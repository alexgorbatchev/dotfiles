package vm

import (
	"context"
	"testing"

	"github.com/dop251/goja"
)

func TestEvaluatorAccessorsAndContext(t *testing.T) {
	vm := goja.New()
	sourceMap := []byte(`{"version":3}`)
	eval := NewEvaluator(vm, sourceMap)

	if eval.Runtime() != vm {
		t.Errorf("Runtime() returned %v, want %v", eval.Runtime(), vm)
	}
	if string(eval.SourceMap()) != string(sourceMap) {
		t.Errorf("SourceMap() returned %s, want %s", eval.SourceMap(), sourceMap)
	}
	if eval.Mutex() == nil {
		t.Error("Mutex() returned nil")
	}

	ctx := context.Background()
	if GetEvaluator(ctx) != nil {
		t.Error("expected GetEvaluator on background context to return nil")
	}
	if GetEvaluator(nil) != nil {
		t.Error("expected GetEvaluator on nil context to return nil")
	}

	ctxWithEval := WithEvaluator(ctx, eval)
	if got := GetEvaluator(ctxWithEval); got != eval {
		t.Errorf("GetEvaluator returned %v, want %v", got, eval)
	}
}
