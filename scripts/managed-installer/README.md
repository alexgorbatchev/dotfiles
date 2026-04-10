# Managed Installer

Everything related to the hosted bootstrap installer lives here.

Files:

- `install.sh`: source of truth for the hosted installer
- `test.sh`: scenario runner for local validation
- `fixtures/`: scenario inputs copied into temp workspaces by `test.sh`

The docs site publishes `install.sh` to `packages/docs/public/install.sh` during `packages/docs/sync.ts`.
