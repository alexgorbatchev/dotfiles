#!/usr/bin/env bash 

set -euo pipefail

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
cd "$SCRIPT_DIR/.."

# Use TypeScript compiler to generate a single bundled .d.ts file
npx tsc --project tsconfig--build-types.json

echo "✅ Generated $(pwd)/dist/generator.d.ts"
