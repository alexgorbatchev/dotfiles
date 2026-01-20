# 15. Appendices

[← Back to Index](00-index.md) | [Previous: Future Enhancements](14-future-enhancements.md)

---

## Appendix A: Glossary

| Term             | Definition                                                       |
| ---------------- | ---------------------------------------------------------------- |
| **Tool**         | A CLI utility managed by dotfiles-tool-installer                 |
| **Shim**         | A wrapper script that enables auto-installation on first use     |
| **Registry**     | SQLite database storing installation records and file operations |
| **Plugin**       | Installation method implementation (github, brew, cargo, etc.)   |
| **Hook**         | User-defined callback at installation lifecycle points           |
| **Current**      | Symlink pointing to active version of a tool                     |
| **Operation**    | A file system action tracked in the registry                     |
| **Operation ID** | UUID grouping related file operations from a single run          |
| **Platform**     | Operating system (darwin, linux, windows)                        |
| **Arch**         | CPU architecture (x86_64, arm64)                                 |

---

## Appendix B: Source Documents

This combined PRD synthesizes the best features from six independent proposals:

| Document                     | Author              | Key Contribution                                                          |
| ---------------------------- | ------------------- | ------------------------------------------------------------------------- |
| **viz-sonnet-4.5.md**        | Claude (Sonnet 4.5) | Event schemas, hook timeline visualization, phase pipeline                |
| **viz-opus.md**              | Claude (Opus 4.5)   | Detailed ASCII layouts, component specifications, tool card states        |
| **viz-opus-v2.md**           | Claude (Opus 4.5)   | Data flow architecture, API endpoint design, feasibility matrix           |
| **viz-gpt-5.2.md**           | GPT-5.2             | Run identity concept, configuration preview, "truth dashboard" philosophy |
| **viz-gpt-5.1-codex-max.md** | GPT-5.1 Codex Max   | CLI-equivalent mapping, playbook concept, time-travel debugging           |
| **viz-g3-pro.md**            | Gemini 3 Pro        | Health check structure, guided remediation, demo mode concept             |

---

## Appendix C: Keyboard Shortcuts Reference

### Global

| Shortcut        | Action                  |
| --------------- | ----------------------- |
| `⌘K` / `Ctrl+K` | Open command palette    |
| `⌘,` / `Ctrl+,` | Open settings           |
| `⌘R` / `Ctrl+R` | Refresh current view    |
| `⌘L` / `Ctrl+L` | Jump to logs            |
| `?`             | Show keyboard shortcuts |

### Navigation

| Shortcut | Action                             |
| -------- | ---------------------------------- |
| `1-9`    | Navigate to numbered section       |
| `←→`     | Sidebar collapse/expand            |
| `Tab`    | Cycle through interactive elements |
| `Esc`    | Close modal/panel                  |

### Actions

| Shortcut        | Action                |
| --------------- | --------------------- |
| `⌘I` / `Ctrl+I` | Install selected tool |
| `⌘U` / `Ctrl+U` | Update selected tool  |
| `⌘G` / `Ctrl+G` | Generate all          |
| `⌘F` / `Ctrl+F` | Filter current view   |
| `⌘E` / `Ctrl+E` | Export current view   |
| `⌘H` / `Ctrl+H` | Run health check      |

---

## Appendix D: Status Icons Reference

### Tool Status

| Icon | Status    | Meaning                       |
| ---- | --------- | ----------------------------- |
| ✓    | Installed | Tool is installed and healthy |
| ⬆    | Update    | Update available              |
| ⚠    | Warning   | Stale or needs attention      |
| ✗    | Error     | Installation failed           |
| ○    | Pending   | Not installed yet             |
| ●    | Running   | Currently installing          |
| ⊘    | Disabled  | Tool is disabled              |

### Health Status

| Icon | Status  | Meaning            |
| ---- | ------- | ------------------ |
| ✓    | Passed  | Check passed       |
| ⚠    | Warning | Non-critical issue |
| ✗    | Failed  | Critical issue     |

### Phase Status

| Icon | Status   | Meaning               |
| ---- | -------- | --------------------- |
| ○    | Pending  | Not started           |
| ●    | Running  | In progress           |
| ✓    | Complete | Finished successfully |
| ✗    | Failed   | Error occurred        |
| ⊘    | Skipped  | Not applicable        |

---

## Appendix E: File Types Reference

| Type         | Description           | Examples               |
| ------------ | --------------------- | ---------------------- |
| `binary`     | Compiled executable   | `fzf`, `rg`, `bat`     |
| `shim`       | Wrapper script        | `~/.local/bin/fzf`     |
| `symlink`    | Symbolic link         | `current → 0.55.0`     |
| `completion` | Shell completion file | `_fzf`, `_rg`          |
| `init`       | Shell init script     | `init.zsh`             |
| `config`     | Configuration file    | `~/.config/bat/config` |

---

## Appendix F: API Response Examples

### GET /api/tools

```json
{
  "tools": [
    {
      "name": "fzf",
      "version": "0.55.0",
      "latestVersion": "0.55.0",
      "installMethod": "github-release",
      "status": "installed",
      "installedAt": "2026-01-15T14:32:15.000Z",
      "hasUpdate": false,
      "dependsOn": []
    }
  ],
  "total": 47
}
```

### GET /api/health

```json
{
  "overall": "healthy",
  "score": 96,
  "checks": [
    {
      "check": "binaries",
      "status": "passed",
      "message": "All 47 binaries exist and are executable"
    },
    {
      "check": "shims",
      "status": "warning",
      "message": "2 shims point to non-existent binaries",
      "details": ["exa", "dust"],
      "fixAction": "regenerate-shims"
    }
  ],
  "lastCheck": "2026-01-18T14:30:00.000Z"
}
```

### WebSocket Event

```json
{
  "type": "event",
  "data": {
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "type": "installation.progress",
    "timestamp": 1737214315123,
    "toolName": "ripgrep",
    "phase": "download",
    "percent": 65,
    "message": "Downloading ripgrep-14.1.0-aarch64-apple-darwin.tar.gz"
  }
}
```

---

## Appendix G: Project Structure

```
packages/dashboard/
├── package.json
├── README.md
├── src/
│   ├── server/
│   │   ├── index.ts           # Bun HTTP server entry
│   │   ├── routes/
│   │   │   ├── tools.ts
│   │   │   ├── files.ts
│   │   │   ├── updates.ts
│   │   │   ├── health.ts
│   │   │   ├── config.ts
│   │   │   └── shell.ts
│   │   ├── websocket/
│   │   │   ├── events.ts
│   │   │   └── commands.ts
│   │   └── services.ts
│   │
│   ├── client/
│   │   ├── index.html
│   │   ├── main.tsx
│   │   ├── app.tsx
│   │   ├── router.tsx
│   │   ├── components/
│   │   │   ├── layout/
│   │   │   ├── tools/
│   │   │   ├── files/
│   │   │   ├── updates/
│   │   │   └── common/
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx
│   │   │   ├── Tools.tsx
│   │   │   ├── Files.tsx
│   │   │   ├── Updates.tsx
│   │   │   ├── Shell.tsx
│   │   │   └── Settings.tsx
│   │   ├── hooks/
│   │   │   ├── useTools.ts
│   │   │   ├── useWebSocket.ts
│   │   │   └── useApi.ts
│   │   ├── state/
│   │   │   ├── tools.ts
│   │   │   ├── events.ts
│   │   │   └── config.ts
│   │   └── styles/
│   │       └── tailwind.css
│   │
│   └── shared/
│       └── types.ts
│
└── __tests__/
    ├── server/
    └── client/
```

---

_End of Appendices_

---

**Document Status:** Draft v1.0\
**Last Updated:** January 18, 2026\
**Source:** Combined from 6 independent PRD proposals

[← Back to Index](00-index.md) | [Previous: Future Enhancements](14-future-enhancements.md)
