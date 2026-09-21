# @dotfiles/docs

Static documentation site for `@alexgorbatchev/dotfiles`, built with Astro and Starlight.

## Overview

The documentation site is served at `https://alexgorbatchev.github.io/dotfiles/`. It renders markdown references, installation guides, configuration docs, and API specifications.

## Source of Truth & Content Synchronization

The canonical source of truth for all documentation is `.agents/skills/dotfiles/`.

- `packages/docs/sync.ts` copies skill references from `.agents/skills/dotfiles/` into `src/content/docs/`.
- It rewrites relative markdown links (`.md`) to clean Starlight web routes at build time.
- It also copies `scripts/managed-installer/install.sh` to `public/install.sh` so the hosted install script is always published from the current tree.

## Commands

All commands are run from the workspace root or inside `packages/docs`:

| Command                           | Action                                                   |
| :-------------------------------- | :------------------------------------------------------- |
| `bun --cwd packages/docs dev`     | Starts local development server at `localhost:4321`      |
| `bun --cwd packages/docs build`   | Builds the production site to `./dist/`                  |
| `bun --cwd packages/docs preview` | Previews the production build locally                    |
| `bun --cwd packages/docs sync`    | Syncs content from `.agents/skills/dotfiles/`            |
| `just docs-links`                 | Validates documentation links, anchors, and reachability |
