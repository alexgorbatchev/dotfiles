package vm

import (
	"os"
	"regexp"
	"slices"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
)

var cargoInstallParamsPattern = regexp.MustCompile(`(?s)export interface ICargoInstallParams extends ICommonInstallParams \{(.*?)\n\}`)

// ICargoInstallParams declares the binarySource and versionSource a tool file
// type-checks against, and the load rejects every value config.CargoBinarySources and
// config.CargoVersionSources do not hold. Both are hand-written, so nothing but this
// test stops a type-checked cargo tool from being rejected at load, or a value the load
// accepts from failing the type check.
func TestCargoSourceDeclarationsMatchConfig(t *testing.T) {
	source, err := os.ReadFile("dsl-types.ts")
	if err != nil {
		t.Fatalf("reading dsl-types.ts: %v", err)
	}
	params := cargoInstallParamsPattern.FindSubmatch(source)
	if params == nil {
		t.Fatalf("no `export interface ICargoInstallParams` declaration found in dsl-types.ts")
	}

	for _, tt := range []struct {
		param string
		want  []string
	}{
		{"binarySource", config.CargoBinarySources()},
		{"versionSource", config.CargoVersionSources()},
	} {
		t.Run(tt.param, func(t *testing.T) {
			union := regexp.MustCompile(`\n\s*` + tt.param + `\?: ([^;]*);`).FindSubmatch(params[1])
			if union == nil {
				t.Fatalf("ICargoInstallParams declares no optional %s", tt.param)
			}
			var declared []string
			for _, member := range regexp.MustCompile(`"([^"]+)"`).FindAllSubmatch(union[1], -1) {
				declared = append(declared, string(member[1]))
			}
			slices.Sort(declared)
			if !slices.Equal(declared, tt.want) {
				t.Errorf("dsl-types.ts declares %s as %v, config accepts %v", tt.param, declared, tt.want)
			}
		})
	}
}
