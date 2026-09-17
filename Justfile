# Justfile for dotfiles-installer

# Default task
default: test

# Run CLI against test-project in interactive human mode
run *args="generate":
	go run ./cmd/dotfiles --config test-project/dotfiles.config.ts {{ args }}

# Run CLI against test-project in agent mode (AGENT=1)
run-ai *args="generate":
	AGENT=1 go run ./cmd/dotfiles --config test-project/dotfiles.config.ts {{ args }}

# Full validation check (lint + typecheck + tests)
check: lint typecheck unused test

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
    @unformatted="$(gofmt -l cmd pkg scripts tests)"; if [ -n "$unformatted" ]; then echo "gofmt needed:"; echo "$unformatted"; exit 1; fi
    go vet ./...
    bun --bun oxfmt --check .
    cd test-project && ../node_modules/.bin/dprint check --config .dprint.json .
    bun --bun oxlint .

# Auto-fix formatting and linting
fix:
    gofmt -w cmd pkg scripts tests
    bun --bun oxfmt .
    cd test-project && ../node_modules/.bin/dprint fmt --config .dprint.json .
    bun --bun oxlint --fix .

# Report unused TypeScript exports, properties and files
# Run via bun: ts-unused ships ESM with extensionless relative imports, which Node cannot resolve.
unused:
    bun --bun ./packages/dashboard/node_modules/.bin/ts-unused check packages/dashboard/tsconfig.json

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
