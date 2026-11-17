package catalog

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"strings"
	"time"

	"github.com/alexgorbatchev/dotfiles/pkg/exec"
	"github.com/alexgorbatchev/dotfiles/pkg/fs"
	"github.com/google/uuid"
)

const gitOutputLimit = 1 << 20

// FetchOptions selects a Git tool directory and its local destination.
type FetchOptions struct {
	ID, Repository, Ref    string
	TemporaryDir, ToolsDir string
	DryRun                 bool
}

// FetchResult describes the pinned source and files retrieved, or a dry-run preview.
type FetchResult struct {
	ID          string   `json:"id"`
	Repository  string   `json:"repository"`
	Commit      string   `json:"commit"`
	SourcePath  string   `json:"sourcePath"`
	Destination string   `json:"destination"`
	Files       []string `json:"files"`
	DryRun      bool     `json:"dryRun"`
}

// Validate checks the selector without executing Git or touching the filesystem.
func (o FetchOptions) Validate() error {
	if err := ValidateID(o.ID); err != nil {
		return err
	}
	if err := validateGitRepository(o.Repository); err != nil {
		return err
	}
	if strings.HasPrefix(o.Ref, "-") || strings.ContainsAny(o.Ref, " \t\r\n\x00:*?[") || strings.Contains(o.Ref, "..") || strings.HasPrefix(o.Ref, "+") {
		return fmt.Errorf("ref must be one branch, tag, or commit, not a refspec")
	}
	return nil
}

func validateGitRepository(value string) error {
	if filepath.IsAbs(value) {
		return nil
	}
	u, err := url.Parse(value)
	if err != nil {
		return fmt.Errorf("invalid Git repository: %w", err)
	}
	if u.RawQuery != "" || u.Fragment != "" || u.Opaque != "" || strings.ContainsAny(value, "\x00\r\n") || apiURL(u) {
		return fmt.Errorf("repository must be a non-API Git URL without a query or fragment")
	}
	switch u.Scheme {
	case "https", "ssh":
		if u.Hostname() == "" || u.Path == "" {
			return fmt.Errorf("Git URL requires a host and repository path")
		}
		if u.User != nil {
			_, password := u.User.Password()
			if u.Scheme != "ssh" || password {
				return fmt.Errorf("credentials in Git URLs are not supported; use SSH authentication")
			}
		}
	case "file":
		if u.Host != "" || !path.IsAbs(u.Path) || u.User != nil {
			return fmt.Errorf("file Git URL requires an absolute local path without a host")
		}
	default:
		return fmt.Errorf("supply --repo as an HTTPS, SSH, file Git URL or absolute local repository path")
	}
	return nil
}

// Fetch reads one sharded tool directory from Git without checking out or evaluating
// source. Git must be installed. Scratch objects are removed before returning.
func Fetch(ctx context.Context, runner exec.CommandRunner, options FetchOptions) (result FetchResult, err error) {
	if err := options.Validate(); err != nil {
		return result, failure("invalid-input", options.ID, err)
	}
	if runner == nil || !filepath.IsAbs(options.TemporaryDir) || !filepath.IsAbs(options.ToolsDir) {
		return result, failure("invalid-input", options.ID, fmt.Errorf("Git runner and absolute temporary/tools directories are required"))
	}
	ctx, cancel := context.WithTimeout(ctx, time.Minute)
	defer cancel()
	fsys := fs.NewOSFS()
	source, err := SourcePath(options.ID)
	if err != nil {
		return result, err
	}
	result = FetchResult{ID: options.ID, Repository: options.Repository, SourcePath: source, Destination: filepath.Join(options.ToolsDir, options.ID), DryRun: options.DryRun, Files: []string{}}
	if err := absentGitDestination(fsys, result.Destination); err != nil {
		return result, err
	}
	if err := safeGitDirectory(fsys, options.TemporaryDir); err != nil {
		return result, err
	}
	scratch := filepath.Join(options.TemporaryDir, "catalog-fetch-"+uuid.NewString())
	if err := fsys.Mkdir(scratch, 0700); err != nil {
		return result, fmt.Errorf("create Git scratch directory: %w", err)
	}
	defer func() { err = errors.Join(err, fsys.RemoveAll(scratch)) }()
	repository := filepath.Join(scratch, "repository")
	git := gitReader{runner: runner, repository: repository, remote: options.Repository}
	if _, err := git.run(ctx, gitOutputLimit, "init", "--bare", "--template=", repository); err != nil {
		return result, err
	}
	ref := options.Ref
	if ref == "" {
		ref = "HEAD"
	}
	if _, err := git.run(ctx, gitOutputLimit, "fetch", "--depth=1", "--filter=blob:none", "--no-tags", "--no-recurse-submodules", "--no-auto-maintenance", "--", "origin", ref); err != nil {
		return result, err
	}
	commit, err := git.run(ctx, gitOutputLimit, "rev-parse", "--verify", "FETCH_HEAD^{commit}")
	if err != nil {
		return result, err
	}
	result.Commit = strings.TrimSpace(string(commit))
	listing, err := git.run(ctx, gitOutputLimit, "ls-tree", "-rlz", "--full-tree", result.Commit, "--", source+"/")
	if err != nil {
		return result, err
	}
	files, err := parseGitFiles(listing, source)
	if err != nil {
		return result, failure("integrity-failed", options.ID, err)
	}
	if len(files) == 0 {
		return result, failure("not-found", options.ID, fmt.Errorf("tool %q not found at %s", options.ID, source))
	}
	payload := filepath.Join(scratch, "files")
	for _, file := range files {
		data, err := git.run(ctx, file.size, "cat-file", "blob", file.object)
		if err != nil {
			return result, err
		}
		if int64(len(data)) != file.size {
			return result, failure("integrity-failed", options.ID, fmt.Errorf("Git blob size changed for %q", file.path))
		}
		if err := writeGitFile(fsys, payload, file, data); err != nil {
			return result, err
		}
		name := file.path
		if name == "tool.ts" {
			name = options.ID + ".tool.ts"
		}
		result.Files = append(result.Files, name)
	}
	if !options.DryRun {
		err = publishGitFiles(fsys, payload, result)
	}
	return result, err
}

type gitReader struct {
	runner             exec.CommandRunner
	repository, remote string
}

func (g gitReader) run(ctx context.Context, limit int64, args ...string) ([]byte, error) {
	config := []string{
		"-c", "core.hooksPath=" + os.DevNull,
		"-c", "core.sshCommand=ssh -oBatchMode=yes -oStrictHostKeyChecking=yes",
		"-c", "http.followRedirects=false",
		"-c", "protocol.allow=never",
		"-c", "protocol.https.allow=always",
		"-c", "protocol.ssh.allow=always",
		"-c", "protocol.file.allow=always",
		"-c", "remote.origin.url=" + g.remote,
		"-c", "remote.origin.promisor=true",
		"-c", "remote.origin.partialclonefilter=blob:none",
	}
	if args[0] != "init" {
		config = append(config, "-C", g.repository)
	}
	cmd := g.runner.CommandContext(ctx, "git", append(config, args...)...)
	cmd.SetProcessGroup(true)
	cmd.SetEnv(gitEnvironment())
	cmd.SetStdin(strings.NewReader(""))
	out := limitedGitOutput{remaining: limit}
	diagnostic := limitedGitOutput{remaining: gitOutputLimit}
	cmd.SetStdout(&out)
	cmd.SetStderr(&diagnostic)
	if err := cmd.Run(); err != nil {
		return nil, failure("network-failed", "", fmt.Errorf("Git %s failed: %w: %s", args[0], errors.Join(err, ctx.Err()), strings.TrimSpace(diagnostic.buffer.String())))
	}
	return out.buffer.Bytes(), nil
}

func gitEnvironment() []string {
	var env []string
	for _, value := range os.Environ() {
		if !strings.HasPrefix(value, "GIT_") {
			env = append(env, value)
		}
	}
	return append(env, "GIT_TERMINAL_PROMPT=0", "GIT_CONFIG_NOSYSTEM=1", "GIT_CONFIG_GLOBAL="+os.DevNull, "GIT_NO_REPLACE_OBJECTS=1")
}

type limitedGitOutput struct {
	buffer    bytes.Buffer
	remaining int64
}

func (b *limitedGitOutput) Write(data []byte) (int, error) {
	if int64(len(data)) > b.remaining {
		return 0, fmt.Errorf("Git output exceeds its byte limit")
	}
	b.remaining -= int64(len(data))
	return b.buffer.Write(data)
}
