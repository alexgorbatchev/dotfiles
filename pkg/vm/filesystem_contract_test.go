package vm

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// fsProbeTool reports what one ctx.fs call did with a path that is not there: the value
// it resolved to, or the fact that it threw. The outcome travels back to Go as an
// install parameter, which is the only channel a tool factory has.
func fsProbeTool(call string) string {
	return `
import { defineTool } from "@alexgorbatchev/dotfiles";
export default defineTool(async (install, ctx) => {
  let outcome;
  try {
    outcome = "resolved:" + JSON.stringify(await ctx.fs.` + call + `);
  } catch (error) {
    outcome = "threw";
  }
  return install("manual", { binaryPath: outcome });
});`
}

// The IFileSystem contract says a call that cannot be carried out rejects, so an
// unguarded await fails rather than continuing against a file that is not there. exists
// is the one method whose answer for an absent path is a value rather than a failure.
func TestFileSystemReadsRejectOnMissingPaths(t *testing.T) {
	tests := []struct {
		name string
		call string
		want string
	}{
		{name: "readFile", call: `readFile("/nowhere/missing.txt")`, want: "threw"},
		{name: "readdir", call: `readdir("/nowhere/missing-dir")`, want: "threw"},
		{name: "exists", call: `exists("/nowhere/missing.txt")`, want: "resolved:false"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			toolConfigs, err := loadToolSource(t, fsProbeTool(tt.call))
			if err != nil {
				t.Fatalf("load failed: %v", err)
			}
			tool, ok := toolConfigs["probe"]
			if !ok {
				t.Fatalf("expected the probe tool to be loaded, got %v", toolConfigs)
			}
			if got := tool.InstallParams["binaryPath"]; got != tt.want {
				t.Errorf("ctx.fs.%s %v, want %q", tt.call, got, tt.want)
			}
		})
	}
}

// The same three methods still answer for a path that is there, so the contract change
// is about absence and not about making reads harder to use.
func TestFileSystemReadsAnswerForPresentPaths(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "present.txt"), []byte("contents"), 0644); err != nil {
		t.Fatalf("writing probe file: %v", err)
	}

	tests := []struct {
		name string
		call string
		want string
	}{
		{name: "readFile", call: `readFile(` + jsString(dir+"/present.txt") + `)`, want: `resolved:"contents"`},
		{name: "readdir", call: `readdir(` + jsString(dir) + `)`, want: `resolved:["present.txt"]`},
		{name: "exists", call: `exists(` + jsString(dir+"/present.txt") + `)`, want: "resolved:true"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			toolConfigs, err := loadToolSource(t, fsProbeTool(tt.call))
			if err != nil {
				t.Fatalf("load failed: %v", err)
			}
			tool, ok := toolConfigs["probe"]
			if !ok {
				t.Fatalf("expected the probe tool to be loaded, got %v", toolConfigs)
			}
			if got := tool.InstallParams["binaryPath"]; got != tt.want {
				t.Errorf("ctx.fs.%s %v, want %q", tt.call, got, tt.want)
			}
		})
	}
}

func jsString(value string) string {
	return `"` + strings.ReplaceAll(value, `\`, `\\`) + `"`
}
