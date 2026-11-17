package main

import (
	"strings"
	"testing"
)

func TestCatalogDiscoveryCommandContract(t *testing.T) {
	for _, name := range []string{"search", "list", "show"} {
		t.Run(name, func(t *testing.T) {
			out, err := runCommand("catalog", name, "--help")
			if err != nil || !strings.Contains(out.Stdout, "--catalog-url") || out.Stderr != "" {
				t.Fatalf("discovery command help: %v %#v", err, out)
			}
		})
	}
	for _, name := range []string{"add", "update", "outdated"} {
		if _, err := runCommand("catalog", name); err == nil {
			t.Fatalf("deferred catalog command %q is available", name)
		}
	}
	for _, args := range [][]string{{"catalog", "search"}, {"catalog", "search", "one", "two"}, {"catalog", "list", "extra"}, {"catalog", "show"}, {"catalog", "show", "one", "two"}} {
		if _, err := runCommand(args...); err == nil {
			t.Fatalf("invalid discovery positional input accepted: %v", args)
		}
	}
}
