import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { executeJiraOperationLedger } from "./jira-ledger-executor.mjs";
import { JiraReconstructionClient } from "./jira-reconstruction-client.mjs";

const DEFAULT_SETTINGS_PATH =
  process.env.PRISM_JIRA_SETTINGS_PATH ||
  "D:\\CascadeProjects\\Prism\\.prism-data\\prism-settings.json";
const DEFAULT_AUTHOR_ACCOUNT_ID =
  process.env.MDM_JIRA_EXPECTED_AUTHOR_ACCOUNT_ID || "712020:aaf5cbe0-f88b-4eb5-ae6f-b1ba5f939752";

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    mode: "dry-run",
    settingsPath: DEFAULT_SETTINGS_PATH,
    expectedAuthorAccountId: DEFAULT_AUTHOR_ACCOUNT_ID,
    allowIndependentGroups: true,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      index += 1;
      if (index >= argv.length) throw new Error(`${arg} requires a value.`);
      return argv[index];
    };

    if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--ledger") options.ledgerPath = next();
    else if (arg === "--mode") options.mode = next();
    else if (arg === "--output") options.outputPath = next();
    else if (arg === "--checkpoint") options.checkpointPath = next();
    else if (arg === "--settings") options.settingsPath = next();
    else if (arg === "--expected-author") options.expectedAuthorAccountId = next();
    else if (arg === "--preview-hash") options.previewHash = next();
    else if (arg === "--integrity-hash") options.integrityHash = next();
    else if (arg === "--authorized") options.authorized = true;
    else if (arg === "--no-independent-groups") options.allowIndependentGroups = false;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function printHelp() {
  console.log(`Usage:
  node server/mdm-reconciliation/run-jira-operation-ledger.mjs --ledger <path> --mode dry-run
  node server/mdm-reconciliation/run-jira-operation-ledger.mjs --ledger <path> --mode apply --authorized --preview-hash <hash> --integrity-hash <hash>

Options:
  --ledger <path>             Required. Operation ledger JSON from build-weekly-operation-ledger.
  --mode <dry-run|apply>      Defaults to dry-run.
  --output <path>             Optional execution result JSON path.
  --checkpoint <path>         Optional checkpoint JSON path. Defaults beside the output/result.
  --settings <path>           Optional approved Jira settings path. Defaults to Prism runtime storage.
  --expected-author <id>      Expected Jira worklog author account id. Defaults to Steve.
  --authorized                Required for apply mode.
  --preview-hash <hash>       Required for apply mode. Must match the ledger.
  --integrity-hash <hash>     Required for apply mode. Must match the ledger.
  --no-independent-groups     Halt the whole ledger after the first failed group.
`);
}

async function loadApprovedJiraRequest(settingsPath) {
  let settings;
  try {
    settings = JSON.parse(await readFile(resolve(settingsPath), "utf8"));
  } catch {
    throw new Error("The approved Prism Jira credential store is unavailable.");
  }

  const baseUrl = String(settings.jiraBaseUrl || "").replace(/\/+$/, "");
  const email = String(settings.jiraEmail || "");
  const apiToken = String(settings.jiraApiToken || "");
  if (!baseUrl || !email || !apiToken) {
    throw new Error("Jira is not configured in the approved Prism credential store.");
  }
  const auth = `Basic ${Buffer.from(`${email}:${apiToken}`, "utf8").toString("base64")}`;

  return async function jiraRequest(path, init = {}) {
    let response;
    try {
      response = await fetch(`${baseUrl}${path}`, {
        ...init,
        headers: {
          Authorization: auth,
          Accept: "application/json",
          "Content-Type": "application/json",
          ...init.headers,
        },
        signal: AbortSignal.timeout(30_000),
      });
    } catch (error) {
      throw new Error(`Jira request failed for ${path}: ${error.message}`);
    }

    if (response.status === 204) return {};
    const text = await response.text();
    let body = {};
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = { raw: text };
      }
    }

    if (!response.ok) {
      const message =
        body?.errorMessages?.join("; ") ||
        (body?.errors && JSON.stringify(body.errors)) ||
        body?.message ||
        response.statusText;
      throw new Error(`Jira ${response.status} for ${path}: ${message}`);
    }

    return body;
  };
}

function defaultResultPath(ledgerPath, mode) {
  return resolve(ledgerPath.replace(/\.json$/i, `.${mode}.result.json`));
}

async function main() {
  const options = parseArgs();
  if (options.help) {
    printHelp();
    return;
  }
  if (!options.ledgerPath) throw new Error("--ledger is required.");
  if (!["dry-run", "apply"].includes(options.mode)) {
    throw new Error('--mode must be "dry-run" or "apply".');
  }

  const ledgerPath = resolve(options.ledgerPath);
  const ledger = JSON.parse(await readFile(ledgerPath, "utf8"));
  if (options.mode === "apply") {
    if (!options.authorized) throw new Error("--authorized is required for apply mode.");
    if (!options.previewHash || options.previewHash !== ledger?.preview?.hash) {
      throw new Error("--preview-hash is required for apply mode and must match the ledger.");
    }
    if (!options.integrityHash || options.integrityHash !== ledger?.integrity?.hash) {
      throw new Error("--integrity-hash is required for apply mode and must match the ledger.");
    }
  }

  const outputPath = resolve(options.outputPath || defaultResultPath(ledgerPath, options.mode));
  const checkpointPath = resolve(
    options.checkpointPath || outputPath.replace(/\.json$/i, ".checkpoint.json")
  );
  const jiraClient = new JiraReconstructionClient(
    await loadApprovedJiraRequest(options.settingsPath)
  );
  const checkpoints = [];

  const result = await executeJiraOperationLedger({
    ledger,
    jiraClient,
    mode: options.mode,
    authorized: options.authorized === true,
    allowIndependentGroups: options.allowIndependentGroups,
    expectedAuthorAccountId: options.expectedAuthorAccountId,
    saveCheckpoint: async (checkpoint) => {
      checkpoints.push({
        savedAt: new Date().toISOString(),
        operationId: checkpoint.operationId || null,
        operationStatus: checkpoint.operationStatus || null,
        ledger: checkpoint.ledger,
        createdKeys: checkpoint.createdKeys,
        binding: {
          runId: checkpoint.runId,
          previewHash: checkpoint.previewHash,
          integrityHash: checkpoint.integrityHash,
        },
      });
      await writeFile(
        checkpointPath,
        `${JSON.stringify({ schemaVersion: 1, mode: options.mode, checkpoints }, null, 2)}\n`,
        "utf8"
      );
    },
  });

  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  console.log(
    JSON.stringify({
      mode: result.mode,
      outputPath,
      checkpointPath: options.mode === "apply" ? checkpointPath : null,
      runId: result.runId,
      previewHash: result.previewHash,
      integrityHash: result.integrityHash,
      summary: result.summary,
      groups: result.groups?.length || 0,
    })
  );
}

const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename);
if (isMain) {
  main().catch((error) => {
    console.error(error?.message || String(error));
    process.exitCode = 1;
  });
}
