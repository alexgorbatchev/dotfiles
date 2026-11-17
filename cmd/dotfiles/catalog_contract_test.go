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

func TestCatalogFetchCommandContract(t *testing.T) {
	out, err := runCommand("catalog", "fetch", "--help")
	if err != nil || !strings.Contains(out.Stdout, "--repo") || !strings.Contains(out.Stdout, "--ref") || !strings.Contains(out.Stdout, "fetch <id>") {
		t.Fatalf("fetch help: %v, %#v", err, out)
	}
	if !strings.Contains(out.Stdout, "https://github.com/alexgorbatchev/dotfiles-catalog") || !strings.Contains(out.Stdout, "DOTFILES_CATALOG_REPO") {
		t.Fatalf("fetch help omits repository defaults: %#v", out)
	}
	for _, args := range [][]string{{"catalog", "fetch"}, {"catalog", "fetch", "bat", "extra"}, {"catalog", "fetch", "bat", "--repo="}} {
		out, err := runCommand(args...)
		if err == nil || strings.Contains(out.Combined, "loading") {
			t.Fatalf("input must fail before project loading: %v: %v, %#v", args, err, out)
		}
	}
}
