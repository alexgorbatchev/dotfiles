---
created_on: 2026-06-24 18:20
last_modified: 2026-06-24 18:50
status: current
ticket_status: closed
---

# Wave 5: Implement Upsert for Tool Usage Counters in Registry

## Problem

Go's implementation of `RecordToolUsage` currently has a data-loss bug. It executes a query using `INSERT OR REPLACE INTO tool_usage (tool_name, binary_name, usage_count, last_used_at)`.

- **The Issue:** `INSERT OR REPLACE` deletes the existing row on primary key conflict and inserts the new row. This completely wipes out pre-existing invocation counts, resetting them to the incoming payload (usually `1`).
- **TypeScript's Behavior:** Uses a secure upsert query: `ON CONFLICT(tool_name, binary_name) DO UPDATE SET usage_count = tool_usage.usage_count + excluded.usage_count`. This correctly preserves and increments usage stats.

## Why this matters

The dashboard and usage reporting utilities depend on accurate, incremental execution counters. Resetting usage statistics to `1` on every call corrupts telemetry and leads to inaccurate tracking statistics in production.

## Observed context

- Specified in `pkg/registry/registry.go` inside the `RecordToolUsage` method.
- Codebase files affected:
  - `pkg/registry/registry.go` (refactor SQL query in `RecordToolUsage`)

## Desired outcome

Go's `RecordToolUsage` implements a proper SQL upsert pattern matching TypeScript's incrementing behavior exactly, preserving and accumulating execution counters.

## Acceptance criteria

- [x] Refactor `RecordToolUsage` inside `pkg/registry/registry.go` to use an `INSERT INTO ... ON CONFLICT(tool_name, binary_name) DO UPDATE SET usage_count = tool_usage.usage_count + excluded.usage_count, last_used_at = excluded.last_used_at` query pattern.
- [x] Write unit tests inside `pkg/registry/registry_test.go` asserting that calling `RecordToolUsage` multiple times on the same tool/binary correctly increments and preserves the execution count.
- [x] Run `bun check` and `bun check:ci` to verify that Go registry database files and unit tests pass cleanly.
- [x] Run a separate review pass on this ticket using an independent review workflow or review subagent, and resolve all identified feedback/issues until a completely clean review is returned.
