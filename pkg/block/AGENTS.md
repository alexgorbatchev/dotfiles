# pkg/block

Managed comment block manipulation for shared configuration files (`~/.ssh/config`, `~/.bashrc`, `~/.gitconfig`, etc.).

## Commands

- Test: `go test ./pkg/block/...`

## Local conventions

- Marker delimiters: delimit managed regions with `>>> dotfiles:<id> (managed by dotfiles - do not edit inside block)` and `<<< dotfiles:<id>`.
- Valid block IDs: IDs must match `^[A-Za-z0-9._-]+$`; reject invalid characters (whitespace, slashes, regex metacharacters).
- Marker style detection (`StyleFor`): auto-detects comment syntax by file extension or specific file base names (`.gitconfig`, `.npmrc`, `.vimrc`, `.gvimrc`), supporting `#`, `//`, `;`, `--`, and `"` (vimscript). Defaults to `#` (StyleHash).
- Match across comment styles: `Find` regex does not constrain the comment prefix, ensuring changed file styles rewrite the existing block rather than duplicating it.
- Position modes (`Position`): `Bottom` (default) and `Top` govern initial insertion of missing blocks; existing blocks stay wherever the user placed them.
- Line ending preservation: handles and normalizes CRLF (`\r\n`) and LF (`\n`) line endings cleanly without leaving trailing `\r` on bodies, marker lines, or surrounding content.
- Idempotency (`Apply`): applying an unchanged body produces byte-identical output with zero phantom diffs or duplicate newlines.
- Clean removal (`Remove`): removes the block and its bounding markers cleanly, preserving surrounding user content.

## Local gotchas

- Misidentifying leading-dot dotfiles like `.bashrc` as file extensions -> `filepath.Ext` returns the whole name for single-dot filenames, which must not be treated as a file extension.
- Malformed marker blocks (unclosed, duplicate start/end, closed before opened) -> `Find` returns explicit errors instead of guessing to avoid corrupting unowned user content.

## Boundaries

- Always: automatically record all new instructions in the most appropriate `AGENTS.md` file immediately upon receipt (check with user if existing instructions conflict)
- Always: write matching unit tests in `block_test.go`.
- Ask first: changing block marker format or syntax comment prefixes.
- Never: overwrite or truncate content outside the delimited block region.

## References

- `pkg/block/block.go`
- `pkg/block/style.go`
- `pkg/block/block_test.go`
