# Justfile for dotfiles-installer

# Default task
default: test

# Run CLI against test-project in interactive human mode
run *args="generate":
	go run ./cmd/dotfiles --config test-project/dotfiles.config.ts {{ args }}

# Run CLI against test-project in agent mode (AGENT=1)
run-ai *args="generate":
	AGENT=1 go run ./cmd/dotfiles --config test-project/dotfiles.config.ts {{ args }}

# Full validation check (lint + typecheck + docs links + tests)
check: lint typecheck unused docs-links test

# Run Go unit, Go E2E and TypeScript tests
test: test-unit test-e2e test-ts

# Run Go unit tests only
test-unit:
    go test ./pkg/... ./cmd/... ./scripts/...

# Run Go E2E tests only
test-e2e:
    go test -count=1 -p 1 ./tests/e2e/...

# Run TypeScript tests only
test-ts:
    bun test

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

# Typecheck TypeScript client, test-project and the docs site, and run the tsd tests
# against the generated declarations in .dist (produced by `just prepare`).
# The docs site has its own Astro tsconfig and needs the synced content and generated `.astro/` types first.
typecheck:
    ./node_modules/.bin/tsc -p tsconfig.json
    go run scripts/build/main.go --type-tests
    bun --cwd packages/docs sync
    cd packages/docs && ./node_modules/.bin/astro sync && ../../node_modules/.bin/tsc -p tsconfig.json

# Check skill documentation links, anchors and page reachability (.agents/skills/dotfiles)
docs-links:
    bun scripts/check-docs-links.ts

# Generate the assets the Go packages embed (dashboard bundle, generated types, skill).
# Required before any Go build, vet or test in a fresh checkout.
prepare:
    go run scripts/build/main.go --assets-only

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
