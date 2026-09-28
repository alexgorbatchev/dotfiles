package vm

import (
	"context"
	"sync"

	"github.com/dop251/goja"
)

// Evaluator retains an evaluated Goja VM and its sourcemap for executing
// lifecycle hooks and parameter resolvers without re-evaluating tool files.
type Evaluator struct {
	mu        sync.Mutex
	vm        *goja.Runtime
	sourceMap []byte
}

// NewEvaluator creates a new Evaluator handle wrapping a Goja runtime and source map.
func NewEvaluator(vm *goja.Runtime, sourceMap []byte) *Evaluator {
	return &Evaluator{
		vm:        vm,
		sourceMap: sourceMap,
	}
}

// Runtime returns the underlying goja.Runtime.
func (e *Evaluator) Runtime() *goja.Runtime {
	return e.vm
}

// SourceMap returns the source map of the bundled configuration.
func (e *Evaluator) SourceMap() []byte {
	return e.sourceMap
}

// Mutex returns the mutex guarding the runtime.
func (e *Evaluator) Mutex() *sync.Mutex {
	return &e.mu
}

type evaluatorContextKey struct{}

// WithEvaluator returns a new context with the retained Evaluator attached.
func WithEvaluator(ctx context.Context, eval *Evaluator) context.Context {
	return context.WithValue(ctx, evaluatorContextKey{}, eval)
}

// GetEvaluator returns the retained Evaluator from ctx, or nil if none was provided.
func GetEvaluator(ctx context.Context) *Evaluator {
	if ctx == nil {
		return nil
	}
	if eval, ok := ctx.Value(evaluatorContextKey{}).(*Evaluator); ok {
		return eval
	}
	return nil
}
