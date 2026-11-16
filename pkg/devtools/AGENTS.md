# pkg/devtools

Validate configured storage with `ValidateLocation` before lifecycle work. Compare resolved existing symlink ancestors through the injected filesystem against independently managed release, shim, shell, cache, usage and dependency directories. A shared symlinked home ancestor is valid, and directories that do not exist yet remain valid.

Preserve Windows executable source extensions in copied payload filenames while keeping declared binary map keys unchanged. Reject destination filename collisions, including Windows case aliases.

`ContainsPayload` identifies retained copied executables through the configured store and its exact tool/build layout, resolving directory aliases through the injected filesystem. It deliberately works after deactivation, so shell wrappers can stop selecting an inactive copied CLI while retaining it as a lazy-install helper.

Owns machine-local development build copies and active override metadata.

- Storage is `paths.devToolsDir`, defaulting to `{paths.generatedDir}/dev-tools`; it may live beneath generated output and needs no explicit configuration opt-in.
- Keep release receipts independent. Read selection metadata even when a payload is missing so repair cannot silently replace an intentional development install.
- Publish complete immutable builds with an atomic manifest replacement. Use `Restore` to roll back failed generation. Retain prior payloads while any generated shim may still reference them; `Prune` requires migrating every consumer first, not merely regenerating the overridden tool's own shim.
- Hold the per-tool `WithLock` through registration, generation, and release lifecycle checks. Pass its callback context into nested operations to avoid reacquiring the same lock.
- Use the injected filesystem. In-memory tests must not create host lock files. Never unlink advisory lock files while another process may be waiting on their inode.
- Ordinary force does not deactivate overrides. Only explicit development-off operations change that ownership.
