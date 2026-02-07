---
name: project-bun-install
description: >-
  Troubleshooting Bun package installation failures. Use when bun install fails,
  packages fail to download, or certificate errors occur during dependency
  installation.
targets:
  - '*'
---

# Bun Install Troubleshooting

## Package Installation Failures

When `bun install` or `bun i` fails to download packages:

1. Symlink `~/.npmrc` to be next to `package.json`:
   ```bash
   ln -sf ~/.npmrc .npmrc
   ```

2. Retry the installation:
   ```bash
   bun i
   ```

## Certificate Errors

If installing a module causes a certificate error (common with Warp proxy or corporate networks):

**STOP and notify the user.** You cannot fix certificate issues. The user must resolve network/proxy configuration.
