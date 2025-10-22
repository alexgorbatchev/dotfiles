# @dotfiles/registry-database

SQLite database connection management for the dotfiles generator registry systems.

## Features

- Manages shared SQLite database connection
- Used by file registry and tool installation registry
- Automatic directory creation
- Clean connection lifecycle management

## Usage

```typescript
import { RegistryDatabase } from '@dotfiles/registry-database';

const db = new RegistryDatabase(logger, '/path/to/registry.db');
const connection = db.getConnection();

// Use the connection...

db.close();
```
