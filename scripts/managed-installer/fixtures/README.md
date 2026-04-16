# Fixture Scenarios

These fixture directories are copied into temporary workspaces by `scripts/managed-installer/test.sh`.

Scenarios:

- `fresh-empty`: no `package.json`, no `dotfiles.config.ts`
- `existing-package-only`: existing `package.json`, config missing
- `existing-config-only`: existing `dotfiles.config.ts`, package missing
- `existing-project-full`: existing package + config + local `bun` tool for the full managed-Bun handoff path
- `existing-project-full-temp-bun`: existing package + config + local `bun` tool with no Bun on `PATH` to verify generated `dotfiles` output does not pin the temporary bootstrap Bun path
- `failing-package-postinstall`: existing `package.json` with a failing `postinstall` to verify bootstrap skips project lifecycle scripts and still succeeds
- `missing-package-spec`: existing `package.json` with an invalid package spec to verify temporary Bun is preserved on real bootstrap failure
