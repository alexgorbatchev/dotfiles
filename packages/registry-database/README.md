# @dotfiles/registry-database

Manages the shared SQLite database connection for the entire dotfiles ecosystem. This package provides a centralized, singleton-like mechanism for creating and accessing the SQLite database, ensuring that all other packages (like `@dotfiles/registry` and `@dotfiles/installer`) use the same database instance.

## Core Concept

In a modular system where different components need to access a shared resource, it's crucial to manage that resource's lifecycle and access patterns carefully. This package solves that problem for database connections. It abstracts away the details of database initialization, directory creation, and connection handling, providing a clean and reusable `RegistryDatabase` class.

By ensuring a single connection point, it prevents issues like database locking, concurrent write conflicts, and redundant initializations.

## API

### `RegistryDatabase`

The primary export of this package.

#### `constructor(parentLogger: TsLogger, registryDbPath: string)`

Initializes the database connection. If the directory for the database file doesn't exist, it will be created recursively.

- **`parentLogger`**: An instance of `TsLogger` to create a dedicated sub-logger.
- **`registryDbPath`**: The absolute path to the SQLite database file (e.g., `/path/to/your/project/registry.db`).

#### `getConnection(): Database`

Returns the active `bun:sqlite` database instance. This is the primary method consumers will use to interact with the database.

#### `close(): void`

Gracefully closes the database connection. This should be called during the application's shutdown sequence to ensure data integrity.

## Usage Example

```typescript
import { createLogger } from '@dotfiles/logger';
import { RegistryDatabase } from '@dotfiles/registry-database';

// 1. Create a logger instance
const logger = createLogger();

// 2. Define the path for your database
const dbPath = '/tmp/dotfiles-registry.db';

// 3. Instantiate the database
// This automatically creates the directory and initializes the connection.
const registryDb = new RegistryDatabase(logger, dbPath);
console.log('Database connection initialized.');

// 4. Get the connection and use it
const db = registryDb.getConnection();
db.run('CREATE TABLE IF NOT EXISTS tools (id INTEGER PRIMARY KEY, name TEXT);');
console.log('Table created or already exists.');

// 5. Close the connection when done
registryDb.close();
console.log('Database connection closed.');
```
