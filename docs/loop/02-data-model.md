# Data model

One SQLite file owned by the gateway (`%LOCALAPPDATA%/IPCorpBrain/loop.db`),
WAL mode, append-biased. The board reads it; the loop writes it. Nothing
here duplicates state that already lives elsewhere (Jira, packages, the
activity store); rows reference those sources by id and path.

```mermaid
erDiagram
    WORK_CLASS ||--o{ WORK_ITEM : classifies
    WORK_CLASS {
        string id PK "e.g. meeting-process, jira-comment, ticket-code"
        string autonomy_tier "auto | show | ask (pinned classes in code)"
        string model_tier "none | local | subscription | top"
        int earned_streak "consecutive verified successes"
        int promote_at "streak needed to move up a tier"
        string tool_set "named tool group the class may reach"
    }

    WORK_ITEM ||--o{ RUN : "worked by"
    WORK_ITEM {
        string id PK
        string kind "meeting-capture, commitment, jira-change, draft, ticket"
        string source_ref "package id, proposal id, MT key, evidence id"
        string state "open, dispatched, staged, waiting-steve, done, failed"
        string created_at
    }

    RUN ||--|| VERIFICATION : "proved by"
    RUN ||--|| RECEIPT : "recorded as"
    RUN {
        string id PK
        string work_item_id FK
        string agent_role "roster name, e.g. coder, qa-reviewer, foreman"
        string model_used "resolved model or none"
        string policy_version "commit hash of policy.json"
        string worktree "path when code work, else null"
        string state "queued, claimed, running, complete, failed, killed"
        string started_at
        string finished_at
        int heartbeat_missed "runaway check counter"
    }

    VERIFICATION {
        string run_id PK
        string ladder "mechanical | content | consequence"
        string result "verified | failed | unverified"
        string evidence_ref "readback id, report path, rescan round count"
        int rounds "convergence rounds when ladder = consequence"
    }

    RECEIPT {
        string run_id PK
        string outcome "one sentence, model-written for reads, else code"
        int tokens_in
        int tokens_out
        string changed_refs "MT keys, file paths, package ids touched"
        string created_at
    }

    APPROVAL ||--|| WORK_ITEM : "releases"
    APPROVAL {
        string id PK
        string work_item_id FK
        string staged_action "what will fire on approval, exact"
        string diff_ref "run-then-show artifact path"
        string requested_at
        string decided_at
        string decision "approved | declined | expired"
    }

    ESCALATION ||--|| RUN : "raised from"
    ESCALATION {
        string id PK
        string run_id FK
        string what_failed
        string where_it_failed
        string impact "blast radius in plain words"
        string fix_in_flight "run id of the repair, or none yet"
        string state "open, acknowledged, resolved"
    }

    BRIEFING {
        string id PK
        string kind "standup | retro"
        string for_date
        string body "foreman prose, voice rules applied"
        string receipt_ids "the evidence it was assembled from"
        string delivered_at
    }

    AGENT_ROLE ||--o{ RUN : performs
    AGENT_ROLE {
        string name PK
        string prompt_path "server/loop/prompts/<name>.md"
        string default_model_tier
        string tool_set
    }
```

## Rules the schema enforces by design

- A RUN without a VERIFICATION row can never be shown as done; the board
  query joins on verification and renders missing as unverified, amber.
- RECEIPT rows are never updated, only inserted. Corrections are new rows
  referencing the old.
- WORK_CLASS.autonomy_tier for send-class and invite-class actions is not a
  row anyone can edit; those classes are constants in code and the policy
  loader refuses a policy file that tries to override them.
- ESCALATION.fix_in_flight closes the loop Steve asked for: the escalation
  card always knows whether a repair run exists and links it.
- Token columns make cost a per-class weekly query, not an estimate.
