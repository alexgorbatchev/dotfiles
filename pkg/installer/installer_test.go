package installer

import (
	"context"
	"testing"

	"github.com/alexgorbatchev/dotfiles/pkg/config"
)

type mockInstaller struct {
	name         string
	supportsSudo bool
}

func (m *mockInstaller) Name() string {
	return m.name
}

func (m *mockInstaller) SupportsSudo() bool {
	return m.supportsSudo
}

func (m *mockInstaller) Install(ctx context.Context, tool *config.ToolConfig) (*InstallResult, error) {
	return &InstallResult{}, nil
}

func (m *mockInstaller) Uninstall(ctx context.Context, tool *config.ToolConfig) error {
	return nil
}

func (m *mockInstaller) CheckUpdate(ctx context.Context, tool *config.ToolConfig) (*UpdateCheckResult, error) {
	return &UpdateCheckResult{}, nil
}

func TestRegistry_RegisterAndGet(t *testing.T) {
	reg := NewRegistry()

	inst := &mockInstaller{name: "test-inst"}

	// Successfully register
	if err := reg.Register(inst); err != nil {
		t.Fatalf("unexpected error registering installer: %v", err)
	}

	// Register duplicate should fail
	if err := reg.Register(inst); err == nil {
		t.Fatal("expected error registering duplicate installer, got nil")
	}

	// Register nil should fail
	if err := reg.Register(nil); err == nil {
		t.Fatal("expected error registering nil installer, got nil")
	}

	// Register empty name should fail
	if err := reg.Register(&mockInstaller{name: ""}); err == nil {
		t.Fatal("expected error registering empty name, got nil")
	}

	// Get registered installer
	found, err := reg.Get("test-inst")
	if err != nil {
		t.Fatalf("unexpected error getting installer: %v", err)
	}
	if found != inst {
		t.Errorf("expected to find registered installer %v, got %v", inst, found)
	}

	// Get unregistered installer should fail
	if _, err := reg.Get("nonexistent"); err == nil {
		t.Fatal("expected error getting unregistered installer, got nil")
	}
}

func TestRegistry_List(t *testing.T) {
	reg := NewRegistry()

	_ = reg.Register(&mockInstaller{name: "inst1"})
	_ = reg.Register(&mockInstaller{name: "inst2"})

	list := reg.List()
	if len(list) != 2 {
		t.Fatalf("expected 2 registered installers, got %d", len(list))
	}

	hasInst1 := false
	hasInst2 := false
	for _, name := range list {
		if name == "inst1" {
			hasInst1 = true
		}
		if name == "inst2" {
			hasInst2 = true
		}
	}

	if !hasInst1 || !hasInst2 {
		t.Errorf("expected list to contain both inst1 and inst2, got: %v", list)
	}
}

func TestGlobalRegistry(t *testing.T) {
	reg := DefaultRegistry()
	if reg == nil {
		t.Fatal("expected DefaultRegistry() to return a valid registry, got nil")
	}

	inst := &mockInstaller{name: "global-inst"}
	if err := Register(inst); err != nil {
		t.Fatalf("unexpected error registering to global registry: %v", err)
	}

	found, err := Get("global-inst")
	if err != nil {
		t.Fatalf("unexpected error getting from global registry: %v", err)
	}
	if found != inst {
		t.Errorf("expected to find %v in global registry, got %v", inst, found)
	}
}

func TestRegistry_ZeroValue(t *testing.T) {
	var reg Registry // zero value, uninitialized installers map

	// List should return nil and not panic
	if list := reg.List(); list != nil {
		t.Fatalf("expected nil list for zero value registry, got %v", list)
	}

	// Get should return error and not panic
	if _, err := reg.Get("any"); err == nil {
		t.Fatal("expected error on get from zero-value registry, got nil")
	}

	// Register should initialize and succeed
	inst := &mockInstaller{name: "any"}
	if err := reg.Register(inst); err != nil {
		t.Fatalf("expected registration to succeed on zero-value registry, got: %v", err)
	}

	// Now List and Get should work
	if list := reg.List(); len(list) != 1 || list[0] != "any" {
		t.Fatalf("expected list of length 1, got %v", list)
	}

	if found, err := reg.Get("any"); err != nil || found != inst {
		t.Fatalf("expected to get registered installer, got: %v, %v", found, err)
	}
}
