# Justfile for dotfiles-installer

# Default task
default: check

# Full validation check (lint + typecheck + tests)
check: lint typecheck test

# Run Go unit and E2E tests
test:
    go test ./pkg/... ./cmd/...
    go test -count=1 -p 1 ./tests/e2e/...

# Run Go unit tests only
test-unit:
    go test ./pkg/... ./cmd/...

# Run Go E2E tests only
test-e2e:
    go test -count=1 -p 1 ./tests/e2e/...

# Format and lint check
lint:
    bun --bun oxfmt --check .
    cd test-project && ../node_modules/.bin/dprint check --config .dprint.json .
    bun --bun oxlint .

# Auto-fix formatting and linting
fix:
    bun --bun oxfmt .
    cd test-project && ../node_modules/.bin/dprint fmt --config .dprint.json .
    bun --bun oxlint --fix .

# Typecheck TypeScript client and test-project
typecheck:
    tsgo -p tsconfig.json

# Compile native Go binaries and dashboard client assets
compile:
    go run scripts/build/main.go

# Alias for compile
build: compile

# Run dashboard server against fixture project
dashboard:
    go run ./cmd/dotfiles --config test-project/dotfiles.config.ts dashboard

# Run release pipeline
release bump="patch":
    bun scripts/release.ts {{ bump }}
