package features

import (
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/alexgorbatchev/dotfiles/pkg/fs"
)

func TestParseReadme(t *testing.T) {
	t.Run("readme with frontmatter and H1", func(t *testing.T) {
		markdown := `---
name: mytool
version: 1.2.3
description: A great tool
category: development
---
# Actual Name
Some other description.
`
		meta, remaining := ParseReadme(markdown)

		if meta.Name != "mytool" {
			t.Errorf("expected name 'mytool', got %q", meta.Name)
		}
		if meta.Version != "1.2.3" {
			t.Errorf("expected version '1.2.3', got %q", meta.Version)
		}
		if meta.Description != "A great tool" {
			t.Errorf("expected description 'A great tool', got %q", meta.Description)
		}
		if meta.Attributes["category"] != "development" {
			t.Errorf("expected category 'development', got %q", meta.Attributes["category"])
		}
		if meta.Attributes["name"] != "mytool" {
			t.Errorf("expected name attribute 'mytool'")
		}
		if remaining == "" {
			t.Fatal("expected remaining content to not be empty")
		}
	})

	t.Run("readme with H1 only", func(t *testing.T) {
		markdown := `# My Awesome Tool

This is a description of my awesome tool.

And some details.
`
		meta, _ := ParseReadme(markdown)

		if meta.Name != "My Awesome Tool" {
			t.Errorf("expected name 'My Awesome Tool', got %q", meta.Name)
		}
		if meta.Description != "This is a description of my awesome tool." {
			t.Errorf("expected description, got %q", meta.Description)
		}
	})
}

func TestReadmeCache_PutAndGet(t *testing.T) {
	mem := fs.NewMemFS()
	cache := NewReadmeCache(mem, "/var/cache/readmes")

	item := &CacheItem{
		ToolName: "testtool",
		Readme:   "# Test Tool",
		Metadata: &Metadata{
			Name:        "Test Tool",
			Version:     "1.0.0",
			Description: "A test tool",
		},
		Timestamp: time.Now().Unix(),
	}

	// Case 1: Get from empty cache
	got, err := cache.Get("testtool", 10*time.Minute)
	if err != nil {
		t.Fatalf("Get failed: %v", err)
	}
	if got != nil {
		t.Errorf("expected cache miss, got item")
	}

	// Case 2: Put into cache
	err = cache.Put("testtool", item)
	if err != nil {
		t.Fatalf("Put failed: %v", err)
	}

	// Case 3: Get from cache
	got, err = cache.Get("testtool", 10*time.Minute)
	if err != nil {
		t.Fatalf("Get failed: %v", err)
	}
	if got == nil {
		t.Fatal("expected cache hit, got nil")
	}
	if got.ToolName != "testtool" || got.Metadata.Name != "Test Tool" {
		t.Errorf("retrieved item fields mismatch")
	}

	// Case 4: Expiration (TTL = -1s means immediate expiration)
	got, err = cache.Get("testtool", -1*time.Second)
	if err != nil {
		t.Fatalf("Get failed on expiration: %v", err)
	}
	if got != nil {
		t.Errorf("expected expired item to be nil")
	}

	// Case 5: Empty tool name errors
	err = cache.Put("", item)
	if err == nil {
		t.Fatal("expected error on empty tool name Put")
	}
	_, err = cache.Get("", 10*time.Minute)
	if err == nil {
		t.Fatal("expected error on empty tool name Get")
	}
}

type ErroringFS struct {
	fs.FS
	errOnExists    bool
	errOnReadFile  bool
	errOnWriteFile bool
	errOnMkdirAll  bool
}

func (e *ErroringFS) Exists(path string) (bool, error) {
	if e.errOnExists {
		return false, fmt.Errorf("mock exists error")
	}
	return e.FS.Exists(path)
}

func (e *ErroringFS) ReadFile(path string) ([]byte, error) {
	if e.errOnReadFile {
		return nil, fmt.Errorf("mock readfile error")
	}
	return e.FS.ReadFile(path)
}

func (e *ErroringFS) WriteFile(path string, data []byte, perm os.FileMode) error {
	if e.errOnWriteFile {
		return fmt.Errorf("mock writefile error")
	}
	return e.FS.WriteFile(path, data, perm)
}

func (e *ErroringFS) MkdirAll(path string, perm os.FileMode) error {
	if e.errOnMkdirAll {
		return fmt.Errorf("mock mkdirall error")
	}
	return e.FS.MkdirAll(path, perm)
}

func TestReadmeCache_Errors(t *testing.T) {
	mem := fs.NewMemFS()
	item := &CacheItem{
		ToolName:  "testtool",
		Readme:    "# Test Tool",
		Metadata:  &Metadata{},
		Timestamp: time.Now().Unix(),
	}

	t.Run("MkdirAll error in Put", func(t *testing.T) {
		errFS := &ErroringFS{FS: mem, errOnMkdirAll: true}
		cache := NewReadmeCache(errFS, "/var/cache/readmes")
		err := cache.Put("testtool", item)
		if err == nil {
			t.Fatal("expected error on MkdirAll")
		}
	})

	t.Run("WriteFile error in Put", func(t *testing.T) {
		errFS := &ErroringFS{FS: mem, errOnWriteFile: true}
		cache := NewReadmeCache(errFS, "/var/cache/readmes")
		err := cache.Put("testtool", item)
		if err == nil {
			t.Fatal("expected error on WriteFile")
		}
	})

	t.Run("Exists error in Get", func(t *testing.T) {
		errFS := &ErroringFS{FS: mem, errOnExists: true}
		cache := NewReadmeCache(errFS, "/var/cache/readmes")
		_, err := cache.Get("testtool", 10*time.Minute)
		if err == nil {
			t.Fatal("expected error on Exists")
		}
	})

	t.Run("ReadFile error in Get", func(t *testing.T) {
		baseMem := fs.NewMemFS()
		cacheOk := NewReadmeCache(baseMem, "/var/cache/readmes")
		_ = cacheOk.Put("testtool", item)

		errFS := &ErroringFS{FS: baseMem, errOnReadFile: true}
		cacheErr := NewReadmeCache(errFS, "/var/cache/readmes")
		_, err := cacheErr.Get("testtool", 10*time.Minute)
		if err == nil {
			t.Fatal("expected error on ReadFile")
		}
	})

	t.Run("Corrupted json in Get should self-heal", func(t *testing.T) {
		baseMem := fs.NewMemFS()
		cacheOk := NewReadmeCache(baseMem, "/var/cache/readmes")
		_ = baseMem.MkdirAll("/var/cache/readmes", 0755)
		_ = baseMem.WriteFile("/var/cache/readmes/testtool.json", []byte("{corrupt-json"), 0644)

		got, err := cacheOk.Get("testtool", 10*time.Minute)
		if err != nil {
			t.Fatalf("expected nil error on corrupt JSON: %v", err)
		}
		if got != nil {
			t.Fatal("expected nil item on corrupt JSON")
		}

		// Verify file was deleted (self-healed)
		exists, _ := baseMem.Exists("/var/cache/readmes/testtool.json")
		if exists {
			t.Fatal("expected corrupted cache file to be deleted")
		}
	})
}
