# pkg/db

SQLite registry database connection and schema migrations.

## Commands

- Test: `go test ./pkg/db/...`

## Local conventions

- Use empty in-memory SQLite in isolated unit tests. Dry runs use `NewSnapshot` to copy the configured registry through SQLite's backup API into shared in-memory SQLite, including committed WAL data. Open the source read-only and migrate only the copy; a missing source starts empty, while an unreadable or corrupt source fails.

## Local gotchas

- Database schema changes require migration queries -> update schema initialization in `pkg/db/db.go`.

## Boundaries

- Always: automatically record all new instructions in the most appropriate `AGENTS.md` file immediately upon receipt (check with user if existing instructions conflict)
- Always: write matching unit tests in `db_test.go`.
- Ask first: altering SQLite table schemas or column definitions.
- Never: commit or write SQLite databases outside configured `generatedDir`.

## References

- `pkg/db/db.go`
