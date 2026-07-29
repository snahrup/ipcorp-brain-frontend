import type { CapabilityState } from "../../types/workbench";

export type CapabilityDetail = {
  icon: string;
  availability: string;
  requiredConnection: string;
  inputs: string[];
  outputs: string[];
  reviewScope: string;
};

export const capabilityStatePresentation: Record<
  CapabilityState,
  { label: string; toneClass: string }
> = {
  available: {
    label: "Available for review",
    toneClass: "wb-status-neutral",
  },
  "preparation-only": {
    label: "Preparation only",
    toneClass: "wb-status-attention",
  },
  unavailable: {
    label: "Connection required",
    toneClass: "wb-status-attention",
  },
  off: {
    label: "Not loaded",
    toneClass: "wb-status-neutral",
  },
};

const fallbackDetail: CapabilityDetail = {
  icon: "/fabric-icons/fabric.png",
  availability:
    "The capability rules can be reviewed, but this workspace has no active Data work connection.",
  requiredConnection:
    "An approved, read-only Data work adapter with an explicitly scoped source connection.",
  inputs: ["A bounded question", "Named source material", "Explicit review limits"],
  outputs: [
    "A source-backed review artifact",
    "Visible limitations and unresolved questions",
    "No source-system changes",
  ],
  reviewScope:
    "Review the required source material and limits before requesting a connected workflow.",
};

const capabilityDetails: Record<string, CapabilityDetail> = {
  explore: {
    icon: "/fabric-icons/sql-database.png",
    availability:
      "Preparation guidance is available. Query execution is unavailable because this workspace has no active Data work gateway.",
    requiredConnection:
      "An approved, read-only SQL or Fabric connection to a named source, with explicit database and schema scope, a row limit, and a timeout.",
    inputs: [
      "A bounded business question and the decision it should support",
      "Named source, database, schema, table, and allowed-column scope",
      "Filters, time window, aggregation grain, and maximum rows",
    ],
    outputs: [
      "A reviewable query plan and SQL text before any execution",
      "If later connected, a bounded result table with source, query, row-count, and truncation metadata",
      "No writes, DDL, or source-system changes",
    ],
    reviewScope:
      "Review the question, source scope, and safety limits that a future read-only request would need.",
  },
  compare: {
    icon: "/fabric-icons/dataflow-gen2.png",
    availability:
      "A comparison plan can be prepared. No source is connected, so no records are read and no differences are calculated here.",
    requiredConnection:
      "Approved read-only access to both named sources, or two user-supplied extracts, plus a stable join key and an agreed comparison grain.",
    inputs: [
      "Two named sources or bounded extracts and their as-of timestamps",
      "Join keys, expected grain, field mappings, and null-handling rules",
      "Materiality thresholds and known exclusions",
    ],
    outputs: [
      "A field-mapping and comparison plan for review",
      "If later connected, matched, missing, and changed-record summaries with denominators",
      "A disclosed list of unmapped fields, access gaps, and comparison limits",
    ],
    reviewScope:
      "Review the source pairing, keys, grain, and tolerances before any comparison is requested.",
  },
  review: {
    icon: "/fabric-icons/notebook.png",
    availability:
      "The static review rules are defined. This page does not accept or analyze SQL, and no local review runner is connected.",
    requiredConnection:
      "A local Data work review adapter plus SQL supplied as text. Schema context or an execution plan may be supplied, but static review does not require execute permission.",
    inputs: [
      "SQL text, source dialect, and the query's intended result",
      "Relevant schema, keys, constraints, and expected data volume",
      "Optional execution-plan or runtime evidence supplied by the reviewer",
    ],
    outputs: [
      "Correctness, safety, maintainability, and performance findings tied to specific SQL",
      "Suggested changes clearly separated from verified facts",
      "Open questions when schema or runtime evidence is missing",
    ],
    reviewScope:
      "Collect the query, dialect, intent, and available schema evidence, then review the expected approach. Nothing is analyzed from this panel.",
  },
  lineage: {
    icon: "/fabric-icons/links.png",
    availability:
      "The lineage review rules are defined. No catalog, semantic model, or source metadata is connected to this page.",
    requiredConnection:
      "A metadata-only connection to approved catalog and model definitions, or user-supplied SQL, schema, mapping, and semantic-model files.",
    inputs: [
      "The field or measure to trace and its containing object",
      "Source and target schemas, transformations, mappings, and model definitions",
      "The systems and downstream consumers that are in scope",
    ],
    outputs: [
      "A source-to-target field path with direct and inferred steps distinguished",
      "Known downstream models, reports, tests, and consumers",
      "Source references, confidence limits, and unresolved lineage gaps",
    ],
    reviewScope:
      "Review which metadata artifacts and systems are required before a lineage trace can be grounded.",
  },
  translate: {
    icon: "/fabric-icons/schema-model.png",
    availability:
      "The translation review rules are defined. No SQL is uploaded, translated, validated, or executed from this page.",
    requiredConnection:
      "A local translation adapter with explicit source and target dialects. Database access is not required unless a separate validation workflow is approved.",
    inputs: [
      "SQL text and the named source and target dialects",
      "Relevant schema, function, collation, and date-time assumptions",
      "Compatibility requirements and representative validation cases",
    ],
    outputs: [
      "Translated SQL presented as a review draft",
      "Unsupported or behavior-changing constructs called out explicitly",
      "A validation checklist; never a claim that the translated query ran successfully",
    ],
    reviewScope:
      "Review dialects, assumptions, and validation cases that must accompany a future translation request.",
  },
  models: {
    icon: "/fabric-icons/data-warehouse.png",
    availability:
      "Unavailable until an approved project or exported project artifacts are connected. No model or test result is loaded in this workspace.",
    requiredConnection:
      "Read-only access to an approved dbt project, or user-supplied manifest.json, catalog.json, and run_results.json artifacts with a stated as-of time.",
    inputs: [
      "Project manifest and model definitions",
      "Catalog metadata, tests, exposures, and source declarations",
      "Run results with environment and as-of context",
    ],
    outputs: [
      "A reviewable model dependency summary grounded in supplied artifacts",
      "Test outcomes labeled by environment and run time",
      "Missing artifacts and stale or unverified results called out explicitly",
    ],
    reviewScope:
      "Review the connection and artifact checklist only. Tests cannot be run and results cannot be claimed until a project is connected.",
  },
};

export function getCapabilityDetail(capabilityId: string): CapabilityDetail {
  return capabilityDetails[capabilityId] ?? fallbackDetail;
}
