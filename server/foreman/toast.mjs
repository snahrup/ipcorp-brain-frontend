// Windows toast raiser for the Foreman countdown. Track FB-3.
// WinRT toast through PowerShell with protocol activation: clicking the
// toast opens the per-meeting briefing route in the default browser. The
// command is built as an argument array and spawned without a shell, so
// meeting titles can never break out of the script.

import { spawn } from "node:child_process";

// A registered AppUserModelID is required for toasts to display; the
// PowerShell AUMID is present on every Windows install.
const AUMID = "{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe";

function xmlEscape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function psSingle(value) {
  return String(value ?? "").replaceAll("'", "''");
}

export function buildToastCommand({ title, line, url }) {
  const xml =
    `<toast activationType="protocol" launch="${xmlEscape(url)}">` +
    `<visual><binding template="ToastGeneric">` +
    `<text>${xmlEscape(title)}</text>` +
    `<text>${xmlEscape(line)}</text>` +
    `</binding></visual></toast>`;
  const script =
    "[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null; " +
    "$xml = New-Object Windows.Data.Xml.Dom.XmlDocument; " +
    `$xml.LoadXml('${psSingle(xml)}'); ` +
    "$toast = New-Object Windows.UI.Notifications.ToastNotification $xml; " +
    `[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('${psSingle(AUMID)}').Show($toast)`;
  return {
    command: "powershell",
    args: ["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", script],
  };
}

export function raiseToast(payload, options = {}) {
  const spawner = options.spawner ?? spawn;
  const { command, args } = buildToastCommand(payload);
  const child = spawner(command, args, { windowsHide: true, detached: false });
  if (typeof child?.unref === "function") child.unref();
  return child;
}
