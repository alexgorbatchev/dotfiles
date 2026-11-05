# Justfile for dotfiles-installer

# Default task
default: test

# Run CLI in interactive human mode
run *args:
    go run ./cmd/dotfiles {{ args }}

# Run CLI against test-project in interactive human mode
test-project *args="state generate":
    go run ./cmd/dotfiles --config test-project/dotfiles.config.ts {{ args }}

# Run CLI against test-project in agent mode (AGENT=1)
run-ai *args="state generate":
    AGENT=1 go run ./cmd/dotfiles --config test-project/dotfiles.config.ts {{ args }}

# Full validation check (lint + typecheck + docs links + tests)
check: lint typecheck unused docs-links test

# Run Go unit, Go E2E and TypeScript tests
test: test-unit test-e2e test-ts

# Run Go unit tests only
test-unit:
    just _test go go test ./pkg/... ./cmd/... ./scripts/...

# Run Go E2E tests only
test-e2e:
    just _test go go test -p 1 ./tests/e2e/...

# Run TypeScript tests only
test-ts:
    just _test bun bun test

# Own test scratch and children even when a suite fails or is interrupted.
[positional-arguments]
[private]
_test runtime +command:
    #!/usr/bin/env bash
    set -euo pipefail
    runtime="$1"
    shift
    if [[ "$runtime" == go ]]; then
        # Keep Go test inputs outside the checkout so its result cache stays usable.
        scratch=$(mktemp -d -t dotfiles-tests.XXXXXXXX)
    else
        mkdir -p .tmp
        scratch=$(mktemp -d "$PWD/.tmp/test-run.XXXXXXXX")
    fi
    child=
    cleanup() {
        local status=$?
        trap - EXIT
        trap '' HUP INT TERM
        if [[ -n "$child" ]]; then
            kill -TERM -- "-$child" 2>/dev/null || true
            for ((attempt=0; attempt<50; attempt++)); do
                kill -0 -- "-$child" 2>/dev/null || break
                sleep 0.1
            done
            kill -KILL -- "-$child" 2>/dev/null || true
            wait "$child" 2>/dev/null || true
        fi
        rm -rf -- "$scratch"
        exit "$status"
    }
    trap cleanup EXIT
    trap 'trap "" HUP INT TERM; exit 129' HUP
    trap 'trap "" HUP INT TERM; exit 130' INT
    trap 'trap "" HUP INT TERM; exit 143' TERM
    export TMPDIR="$scratch"
    export GOTMPDIR="$scratch"
    export NODE_COMPILE_CACHE="$scratch/node-compile-cache"
    set -m
    "$@" &
    child=$!
    wait "$child"

# Run the full release build end to end. Kept out of `test-unit` and `check`
# because it rewrites generated sources and .dist, which stops every package that
# loads a TypeScript configuration from reusing a cached test result. CI runs it
# as its own job.
test-build:
    go test -count=1 -tags buildtest -run TestRunBuild ./scripts/build/

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

# Compile and deploy local development build into a target dotfiles directory for offline testing
dev-bootstrap target="~/.dotfiles":
    go run ./scripts/dev-bootstrap {{ target }}

# Run release pipeline
release bump="patch":
    bun scripts/release.ts {{ bump }}

# Prepare a fresh clone or worktree: dependencies, the assets the Go packages embed,
# and the fixture's generated declarations that `just typecheck` resolves
setup:
    bun install --frozen-lockfile
    go mod download
    just prepare
    just test-project state generate
