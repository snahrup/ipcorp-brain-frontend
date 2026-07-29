import type { SourcePassport } from "../../types/workbench";

export type ConnectionAvailability =
  | "connected"
  | "not-checked"
  | "unavailable"
  | "auth-required"
  | "stale";

export type ConnectionScope = "workspace" | "local-only";

export type ConnectionStatus =
  | {
      state: "not-checked";
      scope: ConnectionScope;
      observedAt: null;
      evidence: "none";
      detail: string;
    }
  | {
      state: Exclude<ConnectionAvailability, "not-checked">;
      scope: ConnectionScope;
      observedAt: string;
      evidence: "local-gateway" | "prepared-snapshot";
      detail: string;
    };

export const connectionStatePresentation = {
  connected: { label: "Connected", tone: "success" },
  "not-checked": { label: "Not checked", tone: "neutral" },
  unavailable: { label: "Unavailable", tone: "error" },
  "auth-required": { label: "Authentication required", tone: "attention" },
  stale: { label: "Stale", tone: "attention" },
} as const satisfies Record<
  ConnectionAvailability,
  { label: string; tone: "success" | "attention" | "neutral" | "error" }
>;

export function getPassiveConnectionStatus(passport: SourcePassport): ConnectionStatus {
  if (passport.id === "brain" && passport.state === "stale" && passport.asOf) {
    return {
      state: "stale",
      scope: "workspace",
      observedAt: passport.asOf,
      evidence: "prepared-snapshot",
      detail:
        "The prepared prepared snapshot is older than seven days. Live source freshness was not checked.",
    };
  }

  if (passport.id === "microsoft365") {
    return {
      state: "not-checked",
      scope: "local-only",
      observedAt: null,
      evidence: "none",
      detail:
        "No Microsoft 365 request was made. This screen only reports the owner-local configuration.",
    };
  }

  if (passport.id === "jira") {
    return {
      state: "not-checked",
      scope: "local-only",
      observedAt: null,
      evidence: "none",
      detail: "No Jira request was made. Opening Connections does not contact Jira.",
    };
  }

  if (passport.id === "fabric") {
    return {
      state: "not-checked",
      scope: "local-only",
      observedAt: null,
      evidence: "none",
      detail: "Data work is local-only and its tools are checked only when deliberately opened.",
    };
  }

  return {
    state: "not-checked",
    scope: "workspace",
    observedAt: null,
    evidence: "none",
    detail: "This source was not checked in this view.",
  };
}

export function connectionScopeLabel(scope: ConnectionScope) {
  return scope === "local-only" ? "Local only" : "This workspace";
}
