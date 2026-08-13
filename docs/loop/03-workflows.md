# Workflows

Five flows cover the whole system. Anything not drawn here is not in v1.

## 1. The daily loop

```mermaid
flowchart TD
    WAKE[Timer or event wake] --> READ[Read live state:\ncalendar, packages, activity store,\nJira board, loop.db]
    READ --> CAP{Meetings ended\nwithout capture?}
    CAP -->|yes| PING[Board card red +\nforeman lists it in next touch]
    CAP -->|no| MEETS
    PING --> MEETS{Captures ready\nto process?}
    MEETS -->|yes| PROC[Process meeting:\ncleanup, package, infographic]
    MEETS -->|no| RECON
    PROC --> RECON{Reconciliation due?}
    RECON -->|yes| RUNREC[Run activity reconciliation]
    RECON -->|no| CLASSIFY
    RUNREC --> CLASSIFY[Policy classifies every\nopen work item]
    CLASSIFY -->|auto-run| DISPATCH[Dispatch runs]
    CLASSIFY -->|run-then-show| DISPATCH
    CLASSIFY -->|ask-first| STAGE[Stage for Steve,\nboard Waiting lane]
    DISPATCH --> VERIFY[Verify every result]
    VERIFY -->|verified| RECEIPT[Write receipt,\nupdate board]
    VERIFY -->|failed or unverified| ESC[Escalation to foreman]
    RECEIPT --> SLEEP[Sleep until next wake]
    ESC --> SLEEP
    STAGE --> SLEEP
```

## 2. Dispatch lifecycle (one run)

```mermaid
sequenceDiagram
    participant P as Policy
    participant A as Assembler
    participant D as Dispatcher
    participant AG as Agent (role, model tier)
    participant V as Verifier
    participant R as Receipts
    participant B as Board

    P->>A: work item + class (tier, model, tools)
    A->>A: gather context: item, links, package,\nknowledge history, rules, voice
    A->>D: brief
    D->>AG: claim + start (worktree if code)
    loop heartbeat
        AG-->>D: progress
        D-->>B: Working lane, aging tone
    end
    AG->>D: structured result
    D->>V: result + evidence
    alt verified
        V->>R: receipt (tokens, changes, proof)
        R->>B: Delivered lane
    else failed or unverifiable
        V->>D: dispatch repair run (bounded retries)
        D->>B: red card
        V->>R: receipt marked failed
        V-->>P: earned streak resets, tier drops
    end
```

## 3. Run-then-show approval

```mermaid
sequenceDiagram
    participant L as Loop
    participant B as Board
    participant S as Steve
    participant X as Executor

    L->>L: do the work, stage the outward step
    L->>B: Approval card: exact staged action + diff
    S->>B: one tap approve or decline
    alt approved
        B->>X: release exactly what was shown
        X->>X: readback check
        X->>B: receipt, Delivered lane
    else declined or expired
        B->>L: staged action discarded, receipt says declined
    end
```

## 4. Escalation

```mermaid
flowchart LR
    F[Failure or unverifiable result] --> FOUR[Foreman formats four fields:\nwhat failed, where,\nwhat it impacted, fix in flight]
    FOUR --> CARD[Red card on the board,\nreceipt linked]
    CARD --> FIX{Repair run\npossible in tier?}
    FIX -->|yes| REPAIR[Dispatch repair,\ncard shows fix in flight]
    FIX -->|no| WAIT[Card waits on Steve\nwith a specific question]
    REPAIR --> RES{Repair verified?}
    RES -->|yes| CLOSE[Escalation resolved,\nreceipt updated]
    RES -->|no| WAIT
```

## 5. Standup and retro

```mermaid
flowchart LR
    T1[Weekday 08:00 ET] --> SUP[Foreman assembles standup\nfrom receipts since last retro:\nran overnight, staged for tap,\nred and why]
    T2[Weekday 17:00 ET] --> RET[Foreman assembles retro:\nshipped with proof, failed with cost,\ntier changes, tokens per class]
    SUP --> BOARD[Board briefing card]
    RET --> BOARD
```

Both briefings are prose Steve reads, so they run at the top model tier with
the voice rules, and both cite the receipt ids they were assembled from so a
spot check takes seconds.
