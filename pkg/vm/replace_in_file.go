package vm

import (
	"fmt"
	"strconv"
	"strings"

	"github.com/alexgorbatchev/dotfiles/pkg/fs"
	"github.com/alexgorbatchev/dotfiles/pkg/logger"
	"github.com/dlclark/regexp2/v2"
	"github.com/dop251/goja"
)

// replaceMode selects whether the pattern is applied to the whole file at once or to
// each line separately. Line mode matters for patterns anchored with ^ or $, which
// would otherwise only see the start and end of the entire file.
type replaceMode string

const (
	replaceModeFile replaceMode = "file"
	replaceModeLine replaceMode = "line"
)

// replaceRequest is one call to replaceInFile, already normalised from the loose
// JavaScript arguments into something Go can act on.
type replaceRequest struct {
	Path         string
	Pattern      *regexp2.Regexp
	PatternLabel string
	Replacement  goja.Value
	Mode         replaceMode
	ErrorMessage string
}

// jsRegexpFlagsToOptions maps JavaScript regular expression flags onto the matching
// engine's options.
//
// The "g" flag is deliberately ignored: replaceInFile always replaces every match, so a
// pattern written without it behaves the same as one written with it.
func jsRegexpFlagsToOptions(flags string) regexp2.RegexOptions {
	// ECMAScript mode makes the engine follow JavaScript semantics rather than .NET
	// ones, so a pattern behaves the way the author expects from writing it in a
	// .tool.ts file.
	options := regexp2.ECMAScript | regexp2.Unicode
	if strings.Contains(flags, "i") {
		options |= regexp2.IgnoreCase
	}
	if strings.Contains(flags, "m") {
		options |= regexp2.Multiline
	}
	if strings.Contains(flags, "s") {
		options |= regexp2.Singleline
	}
	return options
}

// compileReplacePattern builds the expression to search for.
//
// A literal string is escaped so that characters such as "." match themselves, which is
// what an author writing a plain string means. A regular expression arrives as its
// source and flags, because the pattern has to be interpreted by Go rather than handed
// back to JavaScript.
//
// The engine is regexp2 rather than the standard library, because Go's regexp is RE2
// and rejects lookarounds and backreferences. Those are ordinary JavaScript, and a
// pattern an author can write in their editor has to work here too.
func compileReplacePattern(source, flags string, literal bool) (*regexp2.Regexp, error) {
	if literal {
		source = regexp2.Escape(source)
		flags = ""
	}
	re, err := regexp2.Compile(source, jsRegexpFlagsToOptions(flags))
	if err != nil {
		return nil, fmt.Errorf("compiling pattern %q: %w", source, err)
	}
	return re, nil
}

// replaceAll applies the pattern to the input, deferring to buildReplacement for each
// match. It returns the new text and how many matches were replaced.
func replaceAll(re *regexp2.Regexp, input string, buildReplacement replacementFn) (string, int, error) {
	match, err := re.FindStringMatch(input)
	if err != nil {
		return "", 0, fmt.Errorf("matching pattern: %w", err)
	}
	if match == nil {
		return input, 0, nil
	}

	var out strings.Builder
	last := 0
	count := 0
	for match != nil {
		index, length := match.ByteRange()
		replacement, err := buildReplacement(match, input)
		if err != nil {
			return "", 0, err
		}
		out.WriteString(input[last:index])
		out.WriteString(replacement)
		last = index + length
		count++

		match, err = re.FindNextMatch(match)
		if err != nil {
			return "", 0, fmt.Errorf("matching pattern: %w", err)
		}
	}
	out.WriteString(input[last:])
	return out.String(), count, nil
}

// runReplaceInFile performs the replacement and reports whether the file changed.
//
// The file is left untouched when nothing matched, and also when every replacement
// produced exactly what was already there, so a hook that runs repeatedly does not
// rewrite files it has nothing to say about.
func runReplaceInFile(vm *goja.Runtime, fsys fs.FS, log *logger.Logger, toolName string, req replaceRequest) (bool, error) {
	if fsys == nil {
		return false, fmt.Errorf("no file system is available to this VM")
	}

	path := req.Path
	data, err := fsys.ReadFile(path)
	if err != nil {
		return false, fmt.Errorf("reading %q: %w", path, err)
	}
	original := string(data)

	build, err := replacementBuilder(vm, req.Replacement)
	if err != nil {
		return false, err
	}

	var updated string
	total := 0
	switch req.Mode {
	case replaceModeLine:
		lines := strings.Split(original, "\n")
		for i, line := range lines {
			replaced, count, err := replaceAll(req.Pattern, line, build)
			if err != nil {
				return false, err
			}
			lines[i] = replaced
			total += count
		}
		updated = strings.Join(lines, "\n")
	default:
		updated, total, err = replaceAll(req.Pattern, original, build)
		if err != nil {
			return false, err
		}
	}

	if total == 0 {
		if req.ErrorMessage != "" && log != nil {
			log.GetSubLogger("", toolName).Error(logger.Message(
				fmt.Sprintf("Could not find '%s' in %s: %s", req.PatternLabel, path, req.ErrorMessage),
			))
		}
		return false, nil
	}

	if updated == original {
		return false, nil
	}

	if err := fsys.WriteFile(path, []byte(updated), 0644); err != nil {
		return false, fmt.Errorf("writing %q: %w", path, err)
	}
	return true, nil
}

// replacementFn produces the text a single match is replaced with.
type replacementFn func(match *regexp2.Match, input string) (string, error)

// replacementBuilder turns the `to` argument into something that produces the text for
// a single match.
//
// A string is used as-is: it is a literal replacement, not a template, so a "$1" in it
// stays "$1" rather than silently expanding. Authors who want a capture group call a
// function instead, which is explicit about what it is reading.
func replacementBuilder(vm *goja.Runtime, replacement goja.Value) (replacementFn, error) {
	if replacement == nil || goja.IsUndefined(replacement) || goja.IsNull(replacement) {
		return nil, fmt.Errorf("replaceInFile needs a replacement string or function")
	}

	if fn, ok := goja.AssertFunction(replacement); ok {
		return func(match *regexp2.Match, input string) (string, error) {
			result, err := fn(goja.Undefined(), matchArgument(vm, match, input))
			if err != nil {
				return "", fmt.Errorf("replacement callback failed: %w", err)
			}
			if promise, isPromise := result.Export().(*goja.Promise); isPromise {
				// The callback suspended. Its continuation cannot run while this Go
				// call is still on the stack, so the value it will eventually produce
				// is unreachable from here. Saying so beats writing "[object Promise]"
				// into the file.
				if promise.State() != goja.PromiseStateFulfilled {
					return "", fmt.Errorf(
						"replaceInFile replacement callback returned a pending promise: " +
							"asynchronous replacements are not supported, compute the value before calling replaceInFile",
					)
				}
				return promise.Result().String(), nil
			}
			return result.String(), nil
		}, nil
	}

	literal := replacement.String()
	return func(match *regexp2.Match, input string) (string, error) {
		return literal, nil
	}, nil
}

// matchArgument builds the object a replacement callback receives, mirroring what a
// JavaScript String.replace callback is given.
func matchArgument(vm *goja.Runtime, match *regexp2.Match, input string) goja.Value {
	arg := vm.NewObject()
	_ = arg.Set("substring", match.String())
	// Reported in runes rather than bytes, so the offset counts characters the way an
	// author reading the file would count them.
	_ = arg.Set("offset", match.RuneIndex)
	_ = arg.Set("input", input)

	captures := make([]any, 0, match.GroupCount())
	groups := vm.NewObject()
	for i := 1; i < match.GroupCount(); i++ {
		group := match.GroupByNumber(i)
		if group == nil || len(group.Captures) == 0 {
			// An optional group that did not participate. JavaScript reports undefined
			// rather than an empty string, and the difference is meaningful.
			captures = append(captures, nil)
			continue
		}
		value := group.String()
		captures = append(captures, value)
		// In ECMAScript mode an unnamed group carries its number as its name; only a
		// genuinely named group belongs in `groups`.
		if group.Name != "" && group.Name != strconv.Itoa(i) {
			_ = groups.Set(group.Name, value)
		}
	}
	_ = arg.Set("captures", vm.ToValue(captures))
	_ = arg.Set("groups", groups)
	return arg
}
