# Lane 1: Common activity lifecycle

Owner: activity_lifecycle_builder

Status: pending

Files: new adapter and focused tests under `server/activity-reconciliation/**` only.

Create the small adapter between activity reconciliation and `server/workbench-state`.
It owns common work-item creation, lease claim and renewal, safe recovery, redacted phase
events, lease release, final ordered receipt, and completion. Do not edit the existing
activity service, gateway, UI, or Mythos files.
