package testutil

// DeclaredBinaries returns the ToolConfig.Binaries value a tool file that declares the
// given binaries with `.bin(name)` produces.
//
// `.bin()` records one object per call — `{name, pattern?, shim?}` carrying only the
// members the call gave (pkg/vm/loader-api.ts) — and that is the only shape a loaded
// configuration can hold. A test that hands Go a bare string would be exercising a shape
// no `.tool.ts` file can produce.
func DeclaredBinaries(names ...string) []interface{} {
	binaries := make([]interface{}, 0, len(names))
	for _, name := range names {
		binaries = append(binaries, map[string]interface{}{"name": name})
	}
	return binaries
}
