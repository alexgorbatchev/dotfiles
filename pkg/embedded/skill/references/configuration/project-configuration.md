---
title: Project Configuration
sidebar:
  order: 1
---

# Project Configuration

The project configuration file defines paths, features, and API settings for your dotfiles system.

## Basic Configuration

```typescript
import { defineConfig } from "@alexgorbatchev/dotfiles";

export default defineConfig(() => ({
  paths: {
    dotfilesDir: "~/.dotfiles",
    toolConfigsDir: "~/.dotfiles/tools",
    generatedDir: "~/.dotfiles/.generated",
    targetDir: "~/.local/bin",
  },
}));
```

## defineConfig Options

### Async Configuration

```typescript
async function loadGithubHost(): Promise<string> {
  return process.env.GITHUB_API_HOST ?? "https://api.github.com";
}

export default defineConfig(async () => {
  const host = await loadGithubHost();
  return {
    paths: { dotfilesDir: "~/.dotfiles" },
    github: { host },
  };
});
```

### Context-Aware Configuration

```typescript
export default defineConfig(({ configFileDir, systemInfo }) => ({
  paths: {
    generatedDir: `${configFileDir}/.generated`,
  },
}));
```

## Configuration Reference

A configuration may set seven top-level keys: the six sections below and the
[`platform`](#platform-overrides) override list. Any other key aborts the load with an
"unknown property" error that lists the ones that are accepted, so a misspelling is
never silently ignored.

Every section is optional, and so is every key inside it: each one has a default, and a
configuration that sets nothing keeps every generated file beside the configuration file
itself. A setting that ends up with no value after the defaults are applied -- `homeDir`
on a machine with no discoverable home directory, for instance -- aborts the load and
names the setting.

### paths

Where everything the CLI manages lives. A value may be written in terms of another one
with a `{paths.<setting>}` placeholder, of the directory holding the configuration file
with `{configFileDir}`, or of the home directory with `{HOME}`; a placeholder nothing can
fill aborts the load rather than becoming part of a directory name. A `~` is expanded
afterwards, and a value that is still relative is resolved against the directory of the
configuration file, so the same configuration describes the same layout whichever
directory the command was run from.

| Key               | Default                         | Effect                                                                     |
| ----------------- | ------------------------------- | -------------------------------------------------------------------------- |
| `homeDir`         | the account's home directory    | What `~` expands to                                                        |
| `dotfilesDir`     | `<config file directory>`       | Root of the dotfiles repository; everything below hangs off it             |
| `generatedDir`    | `<dotfilesDir>/.generated`      | Everything the CLI writes, including the registry database                 |
| `targetDir`       | `<generatedDir>/bin`            | Where shims are written; this is the directory that has to be on PATH      |
| `binariesDir`     | `<generatedDir>/binaries`       | Installed tools, one versioned directory and a `current` link per tool     |
| `shellScriptsDir` | `<generatedDir>/shell-scripts`  | `main.zsh`, `main.bash`, `main.ps1`, once-scripts and completions          |
| `toolConfigsDir`  | `<config file directory>/tools` | Where `*.tool.ts` files are found; a string, or an array to search several |

```typescript config
paths: {
  dotfilesDir: "~/.dotfiles",
  toolConfigsDir: ["~/.dotfiles/tools", "~/.dotfiles/work-tools"],
}
```

### features

```typescript config
features: {
  shellInstall: {
    zsh: "~/.zshrc",
    bash: "~/.bashrc",
    powershell: "~/.config/powershell/profile.ps1",
  },
}
```

`shellInstall` names the profile of each shell that `dotfiles generate` adds its
sourcing line to. A shell left out is skipped. Only a profile that already exists is
updated: `dotfiles generate` warns about a configured profile that is missing and leaves
creating it to you.

`catalog` (`generate`, `filePath`) is accepted by the loader, but no command writes a
catalog file and `dotfiles features` does not report it; both keys default to empty.

### github

| Key             | Default                     | Effect                                                         |
| --------------- | --------------------------- | -------------------------------------------------------------- |
| `host`          | `https://api.github.com`    | API root every release lookup addresses, for GitHub Enterprise |
| `token`         | none                        | Authenticates API requests and asset downloads for every tool  |
| `userAgent`     | `dotfiles-installer/1.0`    | The `User-Agent` sent with GitHub API requests                 |
| `cache.enabled` | `true`                      | Whether a fetched release description is reused at all         |
| `cache.ttl`     | `3600000` (one hour), in ms | How long a fetched release description is reused               |

`host` applies to every method that resolves GitHub releases -- `github-release`,
`cargo`, `dmg` and `pkg` -- and to the dashboard's README lookup. It is the API root
only; the hosts a `cargo` crate's archive is downloaded from are the `cargo` section's
own settings.

`token` is the project-wide default. A tool that sets the `token` parameter of its
installation method overrides it, and when neither names one the `GITHUB_TOKEN` and
then `GH_TOKEN` environment variables are consulted. It applies to every method that
resolves GitHub releases -- `github-release`, `cargo`, `dmg` and `pkg` -- and to the
dashboard's README lookup.

`dotfiles upgrade` is the exception: it upgrades the CLI itself from the public API
rather than from `host`, so it authenticates from `GITHUB_TOKEN` or `GH_TOKEN` alone
and never sends a token written for your `host`.

### system

| Key          | Default             | Effect                                             |
| ------------ | ------------------- | -------------------------------------------------- |
| `sudoPrompt` | the system's prompt | Passed to `sudo -p` when a tool declares `.sudo()` |

### downloader

| Key             | Default                       | Effect                                                        |
| --------------- | ----------------------------- | ------------------------------------------------------------- |
| `timeout`       | none, in ms                   | Bounds one download attempt; a slower download is abandoned   |
| `retryCount`    | `0`                           | How many times a failed download is attempted again           |
| `retryDelay`    | `1000` (one second), in ms    | Base delay between attempts, multiplied by the attempt number |
| `cache.enabled` | `true`                        | Whether a downloaded asset is reused at all                   |
| `cache.ttl`     | `2592000000` (30 days), in ms | How long a downloaded asset is reused                         |

A download renders a progress line on stderr while it runs, and only when stderr is a
terminal.

### cargo

Every key under `cargo` is accepted by the loader and read by nothing. Set the log level
with the `--log` flag or `-v`/`-q` (see the [CLI reference](../getting-started/cli-reference.md)).

## Platform Overrides

The `platform` list applies partial configuration only on matching machines. Each entry
names one or more matchers and the sections to override:

```typescript
export default defineConfig(() => ({
  paths: {
    targetDir: "~/.local/bin",
  },
  platform: [
    {
      match: [{ os: "macos", arch: "arm64" }],
      config: {
        paths: { targetDir: "/opt/homebrew/bin" },
      },
    },
  ],
}));
```

- `match` is a non-empty array of matchers. A matcher sets `os` (`"macos"`, `"linux"`,
  `"windows"`) and/or `arch` (`"x86_64"`, `"arm64"`); at least one is required, and a
  field left out matches any value. An entry applies when any of its matchers matches.
- `config` may set any of the sections above (`paths`, `system`,
  `github`, `cargo`, `downloader`, `features`). Objects merge into the base
  configuration recursively; every other value, including arrays such as
  `toolConfigsDir`, replaces the base value.
- Entries apply in order, so a later matching entry wins over an earlier one.
- Matching uses the same target as tool-level `.platform()` blocks, so the
  `--platform`/`--arch` flags (see the [CLI reference](../getting-started/cli-reference.md))
  select project overrides too.

Overrides are resolved before placeholders such as `{paths.generatedDir}` and before
anything reads the paths, so shims, shell scripts and tool files all see the overridden
values.

## CLI Usage

```bash
dotfiles --config ~/.dotfiles/dotfiles.config.ts install
dotfiles install  # Uses dotfiles.config.ts in current directory
```

## Directory Structure

With the defaults above and `dotfilesDir: '~/.dotfiles'`:

```
~/.dotfiles/
├── dotfiles.config.ts    # Project configuration
├── tools/                # Tool definitions (*.tool.ts)
└── .generated/           # Not version controlled
    ├── bin/              # Shims
    ├── shell-scripts/    # Shell init scripts
    ├── binaries/         # Installed tools
    ├── cache/            # Downloaded assets and release metadata
    └── registry.db       # What the CLI has written, per tool
```
