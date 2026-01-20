# 2. Project Context

[← Back to Index](00-index.md) | [Previous: Executive Summary](01-executive-summary.md) | [Next: User Personas →](03-user-personas.md)

---

## 2.1 What is Dotfiles Tool Installer?

A declarative, TypeScript-based system for managing developer tools across platforms. It:

- **Installs tools** from multiple sources (GitHub releases, Homebrew, Cargo, curl scripts/tarballs, manual)
- **Generates shims** for zero-overhead shell startup with on-demand installation
- **Creates shell integration** files (aliases, functions, environment variables, completions)
- **Manages symlinks** for configuration files
- **Tracks operations** in SQLite registries (tool installations + file operations)
- **Supports lifecycle hooks** for custom installation logic
- **Maintains versioned** timestamped installations with stable `current` symlinks

## 2.2 Current State & Pain Points

The system operates entirely through CLI commands with structured logging. Users have limited visibility into:

| Pain Point                      | Impact                                                 |
| ------------------------------- | ------------------------------------------------------ |
| Real-time installation progress | Can't see what's happening during long installs        |
| Dependency relationships        | Hard to understand why tools install in specific order |
| File system changes             | No clear view of what files are created/modified       |
| Hook execution flow             | Debugging hook failures requires log parsing           |
| Historical trends               | No way to analyze patterns over time                   |
| Configuration impact            | Can't preview changes before execution                 |

## 2.3 Existing Data Infrastructure

The project already has rich data sources that the visualization can leverage:

| Source                       | Type             | Contains                                                                         |
| ---------------------------- | ---------------- | -------------------------------------------------------------------------------- |
| **ToolInstallationRegistry** | SQLite           | Tool name, version, install path, timestamp, binary paths, download URLs         |
| **FileRegistry**             | SQLite           | Append-only file operations log with tool attribution, file types, operation IDs |
| **ProjectConfig**            | TypeScript       | Paths, features, GitHub tokens, platform overrides                               |
| **Tool Configs**             | `.tool.ts` files | Installation methods, versions, hooks, shell integration, dependencies           |
| **Event System**             | In-memory        | Installation lifecycle events (partial)                                          |
| **Download Cache**           | File system      | Cached API responses and binaries                                                |

## 2.4 CLI Commands (Reference)

The documented CLI commands relevant to visualization:

| Command            | Purpose                      | Visualization Opportunity          |
| ------------------ | ---------------------------- | ---------------------------------- |
| `install [tool]`   | Install tools                | Real-time progress, hook lifecycle |
| `update [tool]`    | Update tools                 | Version diff, changelog preview    |
| `check-updates`    | Find available updates       | Update matrix, batch selection     |
| `generate`         | Generate shims/init/symlinks | Generation tree, file preview      |
| `files [tool]`     | Show generated file tree     | Interactive file explorer          |
| `detect-conflicts` | Find shim conflicts          | Conflict resolution wizard         |
| `cleanup`          | Remove generated files       | Dry-run preview, selective cleanup |
| `log`              | Show file operation history  | Timeline, filtering, search        |

---

[← Back to Index](00-index.md) | [Previous: Executive Summary](01-executive-summary.md) | [Next: User Personas →](03-user-personas.md)
