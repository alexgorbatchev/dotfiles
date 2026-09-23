package vm

import (
	"os"
	"regexp"
	"slices"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
)

var installMethodUnionPattern = regexp.MustCompile(`(?s)export type InstallMethod =(.*?);`)
var installMethodMemberPattern = regexp.MustCompile(`\|\s*"([^"]+)"`)

// The InstallMethod union is what a tool file type-checks install() against, and the
// load rejects every method config.InstallMethods does not hold. Both are hand-written,
// so nothing but this test stops a type-checked configuration from being rejected at
// load, or a method the load accepts from failing the type check.
func TestInstallMethodDeclarationMatchesConfig(t *testing.T) {
	source, err := os.ReadFile("dsl-types.ts")
	if err != nil {
		t.Fatalf("reading dsl-types.ts: %v", err)
	}

	union := installMethodUnionPattern.FindSubmatch(source)
	if union == nil {
		t.Fatalf("no `export type InstallMethod` declaration found in dsl-types.ts")
	}

	var declared []string
	for _, member := range installMethodMemberPattern.FindAllStringSubmatch(string(union[1]), -1) {
		declared = append(declared, member[1])
	}
	slices.Sort(declared)

	if want := config.InstallMethods(); !slices.Equal(declared, want) {
		t.Errorf("dsl-types.ts declares InstallMethod %v, config.InstallMethods() is %v", declared, want)
	}
}
