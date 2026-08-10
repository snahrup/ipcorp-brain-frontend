[CmdletBinding()]
param(
  [switch]$NoBrowser,

  # Unattended startup path: skip the pre-launch typecheck. A transient TypeScript
  # error in the working tree must not be the reason the Workbench is missing after
  # a reboot. Vite does not typecheck either; `npm run build` still does.
  [switch]$SkipTypecheck,

  [ValidateRange(5, 300)]
  [int]$TimeoutSeconds = 90
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
$gatewayUrl = "http://127.0.0.1:8817/healthz"
$frontendUrl = "http://127.0.0.1:5217/"
$npmCommand = (Get-Command "npm.cmd" -ErrorAction Stop).Source
$logRoot = Join-Path ([Environment]::GetFolderPath("LocalApplicationData")) "IPCorpBrain\launcher-logs"
$launchStamp = "{0}-{1}" -f (Get-Date -Format "yyyyMMdd-HHmmss"), $PID

New-Item -ItemType Directory -Path $logRoot -Force | Out-Null

function Test-Endpoint {
  param(
    [Parameter(Mandatory)]
    [string]$Uri,

    [Parameter(Mandatory)]
    [scriptblock]$Validator
  )

  try {
    $response = Invoke-WebRequest `
      -Uri $Uri `
      -Method Get `
      -UseBasicParsing `
      -TimeoutSec 3 `
      -ErrorAction Stop

    return $response.StatusCode -eq 200 -and [bool](& $Validator $response)
  } catch {
    return $false
  }
}

function Assert-PortAvailable {
  param(
    [Parameter(Mandatory)]
    [int]$Port,

    [Parameter(Mandatory)]
    [string]$ExpectedService
  )

  $owners = @(
    Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue |
      Select-Object -ExpandProperty OwningProcess -Unique
  )

  if ($owners.Count -gt 0) {
    throw "Port $Port is already listening (PID: $($owners -join ', ')), but $ExpectedService did not pass its readiness check. No process was stopped."
  }
}

function Start-WorkbenchProcess {
  param(
    [Parameter(Mandatory)]
    [string]$Name,

    [Parameter(Mandatory)]
    [string[]]$Arguments
  )

  $stdoutPath = Join-Path $logRoot "$launchStamp-$Name.out.log"
  $stderrPath = Join-Path $logRoot "$launchStamp-$Name.err.log"
  Write-Host "Starting $Name..."

  $process = Start-Process `
    -FilePath $npmCommand `
    -ArgumentList $Arguments `
    -WorkingDirectory $repoRoot `
    -RedirectStandardOutput $stdoutPath `
    -RedirectStandardError $stderrPath `
    -WindowStyle Hidden `
    -PassThru

  return [pscustomobject]@{
    Name = $Name
    Process = $process
    StdoutPath = $stdoutPath
    StderrPath = $stderrPath
  }
}

$gatewayValidator = {
  param($Response)

  try {
    $payload = $Response.Content | ConvertFrom-Json -ErrorAction Stop
    return $payload.ok -eq $true -and $payload.service -eq "ipcorp-workbench-data-gateway"
  } catch {
    return $false
  }
}

$frontendValidator = {
  param($Response)

  # Match the app entry module, not the <title>. The title is product branding and
  # it moved once already ("IP Corp Architecture Brain" -> "IP Corporation
  # Workbench" in the July rebrand), which left this check unable to ever pass:
  # the launcher waited out its full timeout and reported failure while the app was
  # serving perfectly, so the browser never opened. The entry script identifies this
  # app just as precisely and survives renames.
  return $Response.Content -match "/src/main\.tsx"
}

try {
  if (-not (Test-Path -LiteralPath (Join-Path $repoRoot "node_modules"))) {
    throw "Dependencies are not installed. Run npm install once in $repoRoot, then launch again."
  }

  if ($SkipTypecheck) {
    Write-Host "Skipping the pre-launch typecheck by request."
  } else {
    Write-Host "Checking the Workbench TypeScript before launch..."
    Push-Location $repoRoot
    try {
      & $npmCommand run typecheck -- --pretty false
      if ($LASTEXITCODE -ne 0) {
        throw "TypeScript validation failed with exit code $LASTEXITCODE. The browser was not opened."
      }
    } finally {
      Pop-Location
    }
  }

  $gatewayReady = Test-Endpoint -Uri $gatewayUrl -Validator $gatewayValidator
  $frontendReady = Test-Endpoint -Uri $frontendUrl -Validator $frontendValidator

  if (-not $gatewayReady) {
    Assert-PortAvailable -Port 8817 -ExpectedService "the IP Corp Workbench data gateway"
  }
  if (-not $frontendReady) {
    Assert-PortAvailable -Port 5217 -ExpectedService "the IP Corp Brain Vite app"
  }

  $gatewayProcess = if ($gatewayReady) {
    Write-Host "Reusing the ready gateway at $gatewayUrl"
    $null
  } else {
    Start-WorkbenchProcess -Name "gateway" -Arguments @("run", "dev:jira")
  }

  $frontendProcess = if ($frontendReady) {
    Write-Host "Reusing the ready frontend at $frontendUrl"
    $null
  } else {
    Start-WorkbenchProcess -Name "frontend" -Arguments @("run", "dev")
  }

  $launchDeadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
  while ([DateTime]::UtcNow -lt $launchDeadline) {
    $gatewayReady = Test-Endpoint -Uri $gatewayUrl -Validator $gatewayValidator
    $frontendReady = Test-Endpoint -Uri $frontendUrl -Validator $frontendValidator
    if ($gatewayReady -and $frontendReady) {
      break
    }

    foreach ($managedProcess in @($gatewayProcess, $frontendProcess)) {
      if ($null -eq $managedProcess) {
        continue
      }
      $managedProcess.Process.Refresh()
      if ($managedProcess.Process.HasExited) {
        throw "$($managedProcess.Name) exited with code $($managedProcess.Process.ExitCode) before readiness. Logs: $($managedProcess.StdoutPath) and $($managedProcess.StderrPath)"
      }
    }
    Start-Sleep -Milliseconds 500
  }

  if (-not $gatewayReady -or -not $frontendReady) {
    $missing = @()
    if (-not $gatewayReady) {
      $missing += "gateway :8817"
    }
    if (-not $frontendReady) {
      $missing += "frontend :5217"
    }
    throw "$($missing -join ' and ') did not become ready within $TimeoutSeconds seconds. Review $logRoot."
  }

  Write-Host "IP Corp Workbench data gateway ready at $gatewayUrl"
  Write-Host "IP Corp Brain frontend ready at $frontendUrl"

  if ($NoBrowser) {
    Write-Host "Both local services are ready. Browser launch skipped by request."
  } else {
    Write-Host "Opening $frontendUrl"
    Start-Process -FilePath $frontendUrl
  }

  exit 0
} catch {
  [Console]::Error.WriteLine("IP Corp Brain launch failed: $($_.Exception.Message)")
  exit 1
}
