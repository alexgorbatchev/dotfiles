# test-runner

Private Linux/macOS supervisor for the test suites invoked by `just _test`. It owns one suite's scratch directory and process group.

## Commands

- Run supervisor behavior tests: `just _test go go test ./scripts/test-runner`
- Measure supervisor coverage: `just _test go go test -cover ./scripts/test-runner`
- Run a scoped suite: `just _test go go test ./pkg/<package>` or `just _test bun bun test <path>`

## Lifecycle

- Launch the command in its own process group. Preserve the command's exit status; cancellation returns `128 + signal` after shutdown completes.
- Send TERM, allow five seconds, then send KILL and allow another five seconds. Join the direct child and establish that the whole process group is absent before removing scratch. Treat ESRCH as an absent group; report other signal, probe, or wait failures and retain scratch for diagnosis.
- Linux uses the native child-subreaper facility so orphaned descendants can be reaped after the direct child exits. macOS relies on launchd for orphan reaping and still checks group completion.
- Go scratch stays in the system temporary directory. Bun scratch lives under the checkout's `.tmp/`. Pass the owned path through TMPDIR, GOTMPDIR, and NODE_COMPILE_CACHE only to the suite.
- The Just recipe builds a unique candidate under ignored `.cache/test-runner/`, then renames it in the same directory to publish `.cache/test-runner/runner` atomically. Keep the compiler in the foreground so shell exit cleanup follows its completion. Keep the parent `.cache/` directory unchanged after initial setup to avoid invalidating Go tests that record repository directory metadata. Concurrent recipes may replace the cached executable; they must never expose partial build output.

## Tests and boundaries

- Maintain at least 90% statement coverage with behavior tests. Use real child processes for early leader exit, cancellation, escalation, and unrelated-process isolation. Inject syscall failures at the process-group boundary to verify preserved scratch and nonzero results.
- Test binaries and fixture checkouts belong in test-owned OS temporary directories. Tests must join their children before removing those directories.
- Cover the actual Just recipe, including concurrent builds, child exit codes, and atomic executable publication.
- Do not replace the executable with `go run`: its wrapper does not preserve the supervised command's exit and signal contract.
