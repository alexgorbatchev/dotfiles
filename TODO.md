- [ ] `packages/config`: `createToolConfigContext(...)` should accept injected `systemInfo` (not `process.*`)
	- Implement in: [packages/config/src/loadToolConfigs.ts](packages/config/src/loadToolConfigs.ts)
	- Callers likely need update to pass `systemInfo` through (search for `createToolConfigContext(`).

- [ ] `packages/installer`: Replace the inline `IInstallContext & { emitEvent?: ... }` type with a named exported type
	- Implement in: [packages/installer/src/Installer.ts](packages/installer/src/Installer.ts) (`createBaseInstallContext` return type)
	- Goal: avoid structural typing hacks and make the context shape explicit.

- [ ] `packages/installer`: Reuse `createToolConfigContext(...)` when building installer contexts (reduce duplication)
	- Call site: [packages/installer/src/Installer.ts](packages/installer/src/Installer.ts) (`createMinimalContext` / `createBaseInstallContext`)
	- Source builder: [packages/config/src/loadToolConfigs.ts](packages/config/src/loadToolConfigs.ts)
