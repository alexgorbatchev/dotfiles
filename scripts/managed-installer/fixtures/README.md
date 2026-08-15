# Fixture Scenarios

These fixture directories are copied into temporary workspaces by `scripts/managed-installer/test.sh`.

Scenarios:

- `fresh-empty`: no `package.json`, no `dotfiles.config.ts`
- `existing-package-only`: existing `package.json`, config missing
- `existing-config-only`: existing `dotfiles.config.ts`, package missing
- `existing-project-full`: existing config + tools for standalone binary generate execution
