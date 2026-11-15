package managedinstaller

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"context"
	"crypto/sha256"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

type downloadCase struct {
	name, os, arch, verifier, version string
	manifest, failure, signal         string
	override, confirmation            bool
	wantErr                           string
}

func TestBootstrapReleaseChecksums(t *testing.T) {
	for _, tc := range []downloadCase{
		{name: "Linux amd64", os: "Linux", arch: "x86_64", verifier: "sha256sum"},
		{name: "Linux arm64 latest", os: "Linux", arch: "aarch64", verifier: "sha256sum", version: "latest"},
		{name: "macOS amd64", os: "Darwin", arch: "x86_64", verifier: "shasum"},
		{name: "macOS arm64 latest", os: "Darwin", arch: "arm64", verifier: "shasum", version: "latest"},
		{name: "uppercase digest and binary marker", manifest: "uppercase"},
		{name: "CRLF manifest", manifest: "crlf"},
		{name: "corrupt archive", manifest: "wrong", wantErr: "SHA-256 checksum mismatch"},
		{name: "missing archive entry", manifest: "missing", wantErr: "exactly one valid SHA-256 entry"},
		{name: "empty manifest", manifest: "empty", wantErr: "exactly one valid SHA-256 entry"},
		{name: "duplicate archive entry", manifest: "duplicate", wantErr: "exactly one valid SHA-256 entry"},
		{name: "invalid hexadecimal", manifest: "nonhex", wantErr: "exactly one valid SHA-256 entry"},
		{name: "short digest", manifest: "short", wantErr: "exactly one valid SHA-256 entry"},
		{name: "extra manifest field", manifest: "extra", wantErr: "exactly one valid SHA-256 entry"},
		{name: "similar filename", manifest: "similar", wantErr: "exactly one valid SHA-256 entry"},
		{name: "manifest unavailable", failure: "manifest", wantErr: "Failed to download checksums.txt"},
		{name: "archive unavailable", failure: "archive", wantErr: "Failed to download release archive"},
		{name: "latest unavailable", version: "latest", failure: "latest", wantErr: "Failed to resolve latest release version"},
		{name: "no verifier", verifier: "none", wantErr: "requires sha256sum or shasum"},
		{name: "sha256sum failure", verifier: "sha256sum", failure: "verifier", wantErr: "sha256sum failed"},
		{name: "shasum failure", verifier: "shasum", failure: "verifier", wantErr: "shasum failed"},
		{name: "invalid verifier output", failure: "verifier-output", wantErr: "verifier returned an invalid digest"},
		{name: "local binary override", verifier: "none", override: true},
		{name: "unattended confirmation", confirmation: true, wantErr: "Re-run with DOTFILES_YES=1"},
		{name: "terminate while downloading", signal: "TERM", wantErr: "exit status 143"},
		{name: "interrupt while downloading", signal: "INT", wantErr: "exit status 130"},
		{name: "hangup while downloading", signal: "HUP", wantErr: "exit status 129"},
	} {
		t.Run(tc.name, func(t *testing.T) { runBootstrapCase(t, tc) })
	}
}

func runBootstrapCase(t *testing.T, tc downloadCase) {
	t.Helper()
	if tc.os == "" {
		tc.os = "Linux"
	}
	if tc.arch == "" {
		tc.arch = "x86_64"
	}
	if tc.verifier == "" {
		tc.verifier = "sha256sum"
	}
	if tc.version == "" {
		tc.version = "1.2.3"
	}
	root := filepath.Join(t.TempDir(), "workspace with ' quotes")
	for _, dir := range []string{"bin", "downloads", "target"} {
		if err := os.MkdirAll(filepath.Join(root, dir), 0755); err != nil {
			t.Fatal(err)
		}
	}
	writeFixture(t, filepath.Join(root, "downloads", "unrelated"), "preserve", 0644)
	for _, name := range []string{"awk", "basename", "cat", "chmod", "cp", "mkdir", "mktemp", "rm", "sed", "tr"} {
		linkCommand(t, filepath.Join(root, "bin", name), name)
	}
	linkCommand(t, filepath.Join(root, "bin", "real-tar"), "tar")
	linkCommand(t, filepath.Join(root, "bin", "gzip"), "gzip")
	writeFixture(t, filepath.Join(root, "bin", "uname"), "#!/bin/bash\ncase \"$1\" in -s) echo \"$BOOTSTRAP_OS\" ;; -m) echo \"$BOOTSTRAP_ARCH\" ;; esac\n", 0755)
	writeFixture(t, filepath.Join(root, "bin", "curl"), mockReleaseCurl, 0755)
	writeFixture(t, filepath.Join(root, "bin", "tar"), "#!/bin/bash\nprintf 'extract\\n' >>\"$BOOTSTRAP_EVENTS\"\nexec real-tar \"$@\"\n", 0755)
	if tc.verifier != "none" {
		writeFixture(t, filepath.Join(root, "bin", tc.verifier), mockVerifier, 0755)
	}
	archiveName := "dotfiles_1.2.3_" + strings.ToLower(tc.os) + "_amd64.tar.gz"
	if tc.arch == "aarch64" || tc.arch == "arm64" {
		archiveName = "dotfiles_1.2.3_" + strings.ToLower(tc.os) + "_arm64.tar.gz"
	}
	binary := "#!/bin/bash\nprintf 'execute\\n' >>\"$BOOTSTRAP_EVENTS\"\n"
	writeFixture(t, filepath.Join(root, "dotfiles"), binary, 0755)
	archive := bootstrapArchive(t, binary)
	if err := os.WriteFile(filepath.Join(root, "archive.tar.gz"), archive, 0644); err != nil {
		t.Fatal(err)
	}
	digest := fmt.Sprintf("%x", sha256.Sum256(archive))
	manifest := digest + "  " + archiveName + "\n"
	switch tc.manifest {
	case "uppercase":
		manifest = strings.ToUpper(digest) + " *" + archiveName + "\n"
	case "crlf":
		manifest = strings.TrimSuffix(manifest, "\n") + "\r\n"
	case "wrong":
		manifest = strings.Repeat("0", 64) + "  " + archiveName + "\n"
	case "missing":
		manifest = digest + "  another.tar.gz\n"
	case "similar":
		manifest = digest + "  prefix-" + archiveName + "\n" + digest + "  " + archiveName + ".sig\n"
	case "empty":
		manifest = ""
	case "duplicate":
		manifest += digest + " *" + archiveName + "\n"
	case "nonhex":
		manifest = strings.Repeat("z", 64) + "  " + archiveName + "\n"
	case "short":
		manifest = "abc123  " + archiveName + "\n"
	case "extra":
		manifest = strings.TrimSuffix(manifest, "\n") + " extra\n"
	}
	writeFixture(t, filepath.Join(root, "checksums.txt"), manifest, 0644)
	for _, name := range []string{"requests", "events"} {
		writeFixture(t, filepath.Join(root, name), "", 0644)
	}

	bash, err := exec.LookPath("bash")
	if err != nil {
		t.Fatal(err)
	}
	hashProgram, hashMode := "", ""
	if tc.verifier != "none" {
		hashProgram, err = exec.LookPath("sha256sum")
		if err != nil {
			hashProgram, err = exec.LookPath("shasum")
			hashMode = "shasum"
			if err != nil {
				t.Fatal("test host requires sha256sum or shasum for real fixture verification")
			}
		}
	}
	installer, err := filepath.Abs("install.sh")
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(t.Context(), 10*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, bash, installer)
	cmd.Dir = filepath.Join(root, "target")
	override := ""
	yes := "1"
	if tc.confirmation {
		yes = "0"
	}
	if tc.override {
		override = filepath.Join(root, "dotfiles")
	}
	cmd.Env = append(os.Environ(),
		"BASH_ENV=",
		"PATH="+filepath.Join(root, "bin"), "TMPDIR="+filepath.Join(root, "downloads"),
		"INSTALL_DIR="+cmd.Dir, "DOTFILES_TARGET_DIR="+filepath.Join(cmd.Dir, ".generated", "bin"),
		"DOTFILES_VERSION="+tc.version, "DOTFILES_BINARY_PATH="+override, "DOTFILES_YES="+yes,
		"DOTFILES_BASE_URL=https://downloads.example.test/custom", "SHELL=/bin/bash",
		"BOOTSTRAP_ROOT="+root, "BOOTSTRAP_OS="+tc.os, "BOOTSTRAP_ARCH="+tc.arch,
		"BOOTSTRAP_FAILURE="+tc.failure, "BOOTSTRAP_SIGNAL="+tc.signal,
		"BOOTSTRAP_EVENTS="+filepath.Join(root, "events"), "BOOTSTRAP_ARCHIVE="+archiveName,
		"BOOTSTRAP_HASH_PROGRAM="+hashProgram, "BOOTSTRAP_HASH_MODE="+hashMode,
		"BOOTSTRAP_VERIFIER="+tc.verifier,
	)
	output, runErr := cmd.CombinedOutput()
	if tc.wantErr == "" && runErr != nil || tc.wantErr != "" && (runErr == nil || !strings.Contains(string(output)+runErr.Error(), tc.wantErr)) {
		t.Fatalf("bootstrap error=%v, want %q; output:\n%s", runErr, tc.wantErr, output)
	}
	events := readFixture(t, filepath.Join(root, "events"))
	requests := readFixture(t, filepath.Join(root, "requests"))
	if tc.wantErr != "" {
		if events != "" {
			t.Errorf("unverified archive was extracted or executed: %s", events)
		}
		if _, err := os.Stat(filepath.Join(cmd.Dir, "dotfiles.config.ts")); !os.IsNotExist(err) {
			t.Errorf("failed bootstrap wrote configuration: %v", err)
		}
	} else {
		if strings.Count(events, "execute\n") != 3 || !strings.Contains(string(output), "dotfiles bootstrap complete!") {
			t.Errorf("verified bootstrap did not finish: events=%q output=%s", events, output)
		}
		if tc.override {
			if requests != "" || strings.Contains(events, "extract") {
				t.Errorf("local override unexpectedly downloaded/extracted: requests=%q events=%q", requests, events)
			}
		} else {
			for _, name := range []string{archiveName, "checksums.txt"} {
				want := "https://downloads.example.test/custom/releases/download/v1.2.3/" + name + "\n"
				if strings.Count(requests, want) != 1 {
					t.Errorf("expected one pinned download %q; requests=%q", want, requests)
				}
			}
			wantLatest := 0
			if tc.version == "latest" {
				wantLatest = 1
			}
			if strings.Count(requests, "/releases/latest\n") != wantLatest {
				t.Errorf("latest must resolve once, or not at all for pins: %q", requests)
			}
		}
	}
	entries, err := os.ReadDir(filepath.Join(root, "downloads"))
	if err != nil || len(entries) != 1 || entries[0].Name() != "unrelated" {
		t.Errorf("bootstrap temp cleanup changed unrelated files or retained scratch: entries=%v error=%v", entries, err)
	}
}

func bootstrapArchive(t *testing.T, binary string) []byte {
	t.Helper()
	var buffer bytes.Buffer
	gz := gzip.NewWriter(&buffer)
	tw := tar.NewWriter(gz)
	if err := tw.WriteHeader(&tar.Header{Name: "dotfiles", Mode: 0755, Size: int64(len(binary))}); err != nil {
		t.Fatal(err)
	}
	if _, err := tw.Write([]byte(binary)); err != nil {
		t.Fatal(err)
	}
	if err := tw.Close(); err != nil {
		t.Fatal(err)
	}
	if err := gz.Close(); err != nil {
		t.Fatal(err)
	}
	return buffer.Bytes()
}

func writeFixture(t *testing.T, path, content string, mode os.FileMode) {
	t.Helper()
	if err := os.WriteFile(path, []byte(content), mode); err != nil {
		t.Fatal(err)
	}
}

func readFixture(t *testing.T, path string) string {
	t.Helper()
	body, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	return string(body)
}

func linkCommand(t *testing.T, dest, name string) {
	t.Helper()
	source, err := exec.LookPath(name)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(source, dest); err != nil {
		t.Fatal(err)
	}
}

const mockReleaseCurl = `#!/bin/bash
set -euo pipefail
url=""; dest=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    -o) dest="$2"; shift ;;
    https://*) url="$1" ;;
  esac
  shift
done
printf '%s\n' "$url" >>"$BOOTSTRAP_ROOT/requests"
case "$url" in
  */releases/latest)
    [[ "$BOOTSTRAP_FAILURE" != latest ]] || exit 22
    if [[ -e "$BOOTSTRAP_ROOT/latest-resolved" ]]; then
      printf 'https://downloads.example.test/custom/releases/tag/v9.9.9'
    else
      printf 'https://downloads.example.test/custom/releases/tag/v1.2.3'
      : >"$BOOTSTRAP_ROOT/latest-resolved"
    fi
    ;;
  */releases/download/v1.2.3/checksums.txt)
    [[ "$BOOTSTRAP_FAILURE" != manifest ]] || exit 22
    cp "$BOOTSTRAP_ROOT/checksums.txt" "$dest"
    ;;
  */releases/download/v1.2.3/"$BOOTSTRAP_ARCHIVE")
    if [[ -n "$BOOTSTRAP_SIGNAL" ]]; then
      kill -"$BOOTSTRAP_SIGNAL" "$PPID"
      exit 0
    fi
    [[ "$BOOTSTRAP_FAILURE" != archive ]] || exit 22
    cp "$BOOTSTRAP_ROOT/archive.tar.gz" "$dest"
    ;;
  *) printf 'Unexpected download: %s\n' "$url" >&2; exit 1 ;;
esac
`

const mockVerifier = `#!/bin/bash
set -euo pipefail
[[ "$BOOTSTRAP_FAILURE" != verifier ]] || exit 1
if [[ "$BOOTSTRAP_FAILURE" == verifier-output ]]; then
  echo 'invalid output'
  exit 0
fi
if [[ "$BOOTSTRAP_VERIFIER" == shasum && "$*" != '-a 256' ]]; then
  echo 'shasum requires -a 256' >&2
  exit 1
fi
if [[ "$BOOTSTRAP_HASH_MODE" == shasum ]]; then
  exec "$BOOTSTRAP_HASH_PROGRAM" -a 256
fi
exec "$BOOTSTRAP_HASH_PROGRAM"
`
