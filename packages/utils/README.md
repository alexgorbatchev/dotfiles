# @dotfiles/utils

Common utility functions for the dotfiles generator.

## Features

- Path manipulation (contract/expand home paths)
- Permission formatting
- String utilities (dedent)
- Timestamp generation

## Usage

```typescript
import { contractHomePath, formatPermissions, dedentString } from '@dotfiles/utils';

const shortPath = contractHomePath('/Users/john', '/Users/john/projects');
// Returns: '~/projects'

const perms = formatPermissions(0o755);
// Returns: 'rwxr-xr-x'
```
