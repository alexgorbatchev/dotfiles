package logger_test

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"go/ast"
	"go/importer"
	"go/parser"
	"go/token"
	"go/types"
	"io"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	"slices"
	"strings"
	"testing"
)

const (
	modulePath    = "github.com/alexgorbatchev/dotfiles"
	loggerPkgPath = modulePath + "/pkg/logger"
)

// repoRoot is the module root, relative to this package's directory.
var repoRoot = filepath.Join("..", "..")

// productionDirs hold the packages whose log calls reach users.
var productionDirs = []string{"cmd", "pkg", "scripts"}

// targetOSes are the operating systems the release is built for. Each is checked,
// since files such as *_windows.go are part of only one of them.
var targetOSes = []string{"darwin", "linux", "windows"}

// logMethods are the Logger methods that take a message followed by arguments.
var logMethods = []string{"Trace", "Debug", "Info", "Warn", "Error", "Fatal"}

// TestProductionLogCallsCarryTheCauseInTheMessage enforces the logger's contract, as v1
// did: the message describes the failure, and outside --trace an error argument adds
// only the .tool.ts locations its text names (FormatErrorForUser). An error passed as an
// argument therefore loses its whole cause in the default output (#131). Its text is
// what a message folds in with %v, which keeps any tool-file location it names, so a
// production call has no reason to pass an error as an argument at all.
//
// The check is type-based: every production package is type-checked, for each target
// operating system, against the export data `go list -export` builds. It catches an
// error of any name or expression, an argument whose interface type can hold an error,
// spread arguments and type parameters, and never mistakes another type's Error method
// for the logger's. A log method used as a method value or expression is reported, since the
// calls made through it cannot be checked. Production code carries no build tags other
// than the operating system, so the targets cover every production file.
func TestProductionLogCallsCarryTheCauseInTheMessage(t *testing.T) {
	recordSourceTree(t)

	violations := map[string]bool{}
	for _, goos := range targetOSes {
		pkgs := listPackages(t, goos)
		fset := token.NewFileSet()
		imp := exportImporter(fset, pkgs)
		checked := 0
		for _, p := range pkgs {
			if p.Module == nil || p.Module.Path != modulePath || p.DepOnly {
				continue
			}
			// Cross-GOOS builds disable cgo, so a file importing "C" would go unchecked.
			if len(p.CgoFiles) > 0 {
				t.Fatalf("%s has cgo files %v, which this check cannot type-check", p.ImportPath, p.CgoFiles)
			}
			if len(p.GoFiles) == 0 {
				continue
			}
			info := checkPackage(t, fset, imp, p)
			checked++
			for _, node := range logCallsWithErrorArgs(info) {
				violations[fset.Position(node.Pos()).String()] = true
			}
		}
		if checked == 0 {
			t.Fatalf("no production packages were checked for %s", goos)
		}
	}
	if len(violations) > 0 {
		sites := make([]string, 0, len(violations))
		for site := range violations {
			sites = append(sites, site)
		}
		slices.Sort(sites)
		t.Errorf("these log calls pass an error as an argument, which the logger drops outside --trace; "+
			"fold its text into the message instead, as in logger.Message(fmt.Sprintf(\"<what failed>: %%v\", err)):\n  %s",
			strings.Join(sites, "\n  "))
	}
}

// TestLogCallsWithErrorArgs pins what the contract check reports, on a package written
// to contain each shape it has to tell apart.
func TestLogCallsWithErrorArgs(t *testing.T) {
	const src = `package sample

import (
	"errors"
	"fmt"
	"net/http"

	"github.com/alexgorbatchev/dotfiles/pkg/logger"
)

type pathError struct{}

func (*pathError) Error() string { return "path" }

func sample(log *logger.Logger, w http.ResponseWriter) {
	err := errors.New("boom")
	var held any = err
	errs := []any{err}
	log.Error("named error", err)                                  // reported
	log.WithTag("x").Warn("error expression", fmt.Errorf("x: %w", err)) // reported
	log.Info("concrete error type", &pathError{})                  // reported
	log.Info("an interface that can hold an error", held)          // reported
	log.Debug("spread arguments", errs...)                         // reported
	log.Error(logger.Message(fmt.Sprintf("folded: %v", err)))      // fine
	log.Info("a value that is not an error", 42)                   // fine
	log.Info("an interface a value implementing error may be in", fmt.Stringer(nil)) // reported
	log.Info("an interface no error can be in", conflicting(nil))  // fine
	http.Error(w, "another type's Error", http.StatusBadRequest)   // fine
	logError := log.Error                                          // reported
	logError("through a method value")
	logExpr := (*logger.Logger).Error                              // reported
	logExpr(log, "through a method expression")
}

type conflicting interface{ Error() int }

func generic[T any](log *logger.Logger, v T) {
	log.Info("a type parameter that may be an error", v) // reported
}

func numeric[T int | string](log *logger.Logger, v T) {
	log.Info("a type parameter that is never an error", v) // fine
}
`
	fset := token.NewFileSet()
	file, err := parser.ParseFile(fset, "sample.go", src, 0)
	if err != nil {
		t.Fatalf("parsing sample: %v", err)
	}
	info := newInfo()
	conf := types.Config{Importer: exportImporter(fset, listPackages(t, ""))}
	if _, err := conf.Check("sample", fset, []*ast.File{file}, info); err != nil {
		t.Fatalf("type-checking sample: %v", err)
	}

	var lines []int
	for _, node := range logCallsWithErrorArgs(info) {
		lines = append(lines, fset.Position(node.Pos()).Line)
	}
	slices.Sort(lines)
	if want := []int{19, 20, 21, 22, 23, 26, 29, 31, 38}; !slices.Equal(lines, want) {
		t.Errorf("reported lines = %v, want %v", lines, want)
	}
}

// recordSourceTree lists every production directory, so that the Go test cache, which
// hashes the directories a test lists, reruns the check when a file or package is added
// or removed. The files themselves are recorded when checkPackage reads them.
func recordSourceTree(t *testing.T) {
	t.Helper()
	for _, dir := range productionDirs {
		err := filepath.WalkDir(filepath.Join(repoRoot, dir), func(path string, d fs.DirEntry, err error) error {
			if err != nil {
				return err
			}
			if d.IsDir() {
				_, err = os.ReadDir(path)
			}
			return err
		})
		if err != nil {
			t.Fatalf("listing %s: %v", dir, err)
		}
	}
}

// goPackage is the part of `go list -json` output the check reads.
type goPackage struct {
	ImportPath string
	Dir        string
	GoFiles    []string
	CgoFiles   []string
	Export     string
	DepOnly    bool
	Module     *struct{ Path string }
}

// listPackages lists the production packages built for goos (the host's when empty)
// and everything they import, with the export data of each, which `go list -export`
// builds into the Go build cache.
func listPackages(t *testing.T, goos string) []goPackage {
	t.Helper()
	args := []string{"list", "-export", "-deps", "-json=ImportPath,Dir,GoFiles,CgoFiles,Export,DepOnly,Module"}
	for _, dir := range productionDirs {
		args = append(args, "./"+dir+"/...")
	}
	cmd := exec.Command("go", args...)
	cmd.Dir = repoRoot
	cmd.Env = os.Environ()
	if goos != "" {
		cmd.Env = append(cmd.Env, "GOOS="+goos)
	}
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	out, err := cmd.Output()
	if err != nil {
		t.Fatalf("go list for %q: %v\n%s", goos, err, stderr.String())
	}
	var pkgs []goPackage
	dec := json.NewDecoder(bytes.NewReader(out))
	for {
		var p goPackage
		if err := dec.Decode(&p); errors.Is(err, io.EOF) {
			break
		} else if err != nil {
			t.Fatalf("decoding go list output: %v", err)
		}
		pkgs = append(pkgs, p)
	}
	return pkgs
}

// errorInterface is the predeclared error type.
var errorInterface = types.Universe.Lookup("error").Type().Underlying().(*types.Interface)

// exportImporter imports each of pkgs from the export data go list built for it.
func exportImporter(fset *token.FileSet, pkgs []goPackage) types.Importer {
	exports := make(map[string]string, len(pkgs))
	for _, p := range pkgs {
		exports[p.ImportPath] = p.Export
	}
	return importer.ForCompiler(fset, "gc", func(path string) (io.ReadCloser, error) {
		file := exports[path]
		if file == "" {
			return nil, fmt.Errorf("no export data for %q", path)
		}
		return os.Open(file)
	})
}

func newInfo() *types.Info {
	return &types.Info{Types: map[ast.Expr]types.TypeAndValue{}, Selections: map[*ast.SelectorExpr]*types.Selection{}}
}

// checkPackage type-checks the package's non-test sources.
func checkPackage(t *testing.T, fset *token.FileSet, imp types.Importer, p goPackage) *types.Info {
	t.Helper()
	files := make([]*ast.File, 0, len(p.GoFiles))
	for _, name := range p.GoFiles {
		file, err := parser.ParseFile(fset, filepath.Join(p.Dir, name), nil, 0)
		if err != nil {
			t.Fatalf("parsing %s: %v", name, err)
		}
		files = append(files, file)
	}
	info := newInfo()
	conf := types.Config{Importer: imp}
	if _, err := conf.Check(p.ImportPath, fset, files, info); err != nil {
		t.Fatalf("type-checking %s: %v", p.ImportPath, err)
	}
	return info
}

// logCallsWithErrorArgs returns the calls of a *logger.Logger log method that pass,
// after the message, a value that is or may be an error at run time, where filterArgs
// looks at it. A log method used as a method value or a method expression is returned
// too, since the calls made through it cannot be checked.
func logCallsWithErrorArgs(info *types.Info) []ast.Node {
	called := map[*ast.SelectorExpr]bool{}
	var found []ast.Node
	for expr := range info.Types {
		call, ok := expr.(*ast.CallExpr)
		if !ok {
			continue
		}
		sel, ok := call.Fun.(*ast.SelectorExpr)
		if !ok || info.Selections[sel] == nil || !isLogMethod(info.Selections[sel]) {
			continue
		}
		called[sel] = true
		if slices.ContainsFunc(call.Args[1:], func(arg ast.Expr) bool {
			tv, ok := info.Types[arg]
			if !ok || tv.Type == nil {
				return false
			}
			argType := tv.Type
			if call.Ellipsis.IsValid() {
				slice, ok := argType.Underlying().(*types.Slice)
				if !ok {
					return false
				}
				argType = slice.Elem()
			}
			return mayHoldError(argType)
		}) {
			found = append(found, call)
		}
	}
	for sel, selection := range info.Selections {
		if !called[sel] && isLogMethod(selection) {
			found = append(found, sel)
		}
	}
	return found
}

// mayHoldError reports whether a value of type t can be an error at run time: t
// implements error, t is an interface a value implementing error can be stored in, such
// as any or fmt.Stringer, or t is a type parameter one of whose permitted types may hold
// an error.
func mayHoldError(t types.Type) bool {
	if tp, ok := t.(*types.TypeParam); ok {
		constraint := tp.Constraint().Underlying().(*types.Interface)
		if constraint.IsMethodSet() {
			// Any type with the constraint's methods is permitted, error types included.
			return true
		}
		for i := range constraint.NumEmbeddeds() {
			union, ok := constraint.EmbeddedType(i).(*types.Union)
			if !ok {
				if mayHoldError(constraint.EmbeddedType(i)) {
					return true
				}
				continue
			}
			for j := range union.Len() {
				if mayHoldError(union.Term(j).Type()) {
					return true
				}
			}
		}
		return false
	}
	if types.Implements(t, errorInterface) {
		return true
	}
	if !types.IsInterface(t) {
		return false
	}
	// A value in any other interface can implement error as well, unless the
	// interface requires an Error method no error has.
	obj, _, _ := types.LookupFieldOrMethod(t, true, nil, "Error")
	method, ok := obj.(*types.Func)
	if !ok {
		return obj == nil
	}
	errorMethod := errorInterface.Method(0)
	return types.Identical(method.Type(), errorMethod.Type())
}

// isLogMethod reports whether selection is one of logMethods on logger.Logger.
func isLogMethod(selection *types.Selection) bool {
	kind := selection.Kind()
	if (kind != types.MethodVal && kind != types.MethodExpr) || !slices.Contains(logMethods, selection.Obj().Name()) {
		return false
	}
	recv := selection.Obj().(*types.Func).Type().(*types.Signature).Recv()
	if recv == nil {
		return false
	}
	recvType := recv.Type()
	if ptr, ok := recvType.(*types.Pointer); ok {
		recvType = ptr.Elem()
	}
	named, ok := recvType.(*types.Named)
	return ok && named.Obj().Pkg() != nil && named.Obj().Pkg().Path() == loggerPkgPath && named.Obj().Name() == "Logger"
}
