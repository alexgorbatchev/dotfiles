package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"

	_ "modernc.org/sqlite"
)

// DB structures for semantic comparisons

type FileOpRow struct {
	ToolName      string  `json:"tool_name"`
	OperationType string  `json:"operation_type"`
	FilePath      string  `json:"file_path"`
	TargetPath    *string `json:"target_path"`
	FileType      string  `json:"file_type"`
	Metadata      *string `json:"metadata"`
	SizeBytes     *int64  `json:"size_bytes"`
	Permissions   *string `json:"permissions"`
	OperationID   string  `json:"operation_id"`
}

type ToolInstRow struct {
	ToolName          string  `json:"tool_name"`
	Version           string  `json:"version"`
	InstallPath       string  `json:"install_path"`
	BinaryPaths       string  `json:"binary_paths"`
	DownloadURL       *string `json:"download_url"`
	AssetName         *string `json:"asset_name"`
	ConfiguredVersion *string `json:"configured_version"`
	OriginalTag       *string `json:"original_tag"`
	InstallMethod     *string `json:"install_method"`
}

type ToolUsageRow struct {
	ToolName   string `json:"tool_name"`
	BinaryName string `json:"binary_name"`
	UsageCount int    `json:"usage_count"`
}

var (
	ansiRegex = regexp.MustCompile(`\x1b\[[0-9;]*[a-zA-Z]`)
	uuidRegex = regexp.MustCompile(`[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}`)
)

func stripAnsi(str string) string {
	return ansiRegex.ReplaceAllString(str, "")
}

// isBinaryFile reads the first 512 bytes of a file to check for null bytes
func isBinaryFile(filePath string) (bool, error) {
	file, err := os.Open(filePath)
	if err != nil {
		return false, err
	}
	defer file.Close()

	buf := make([]byte, 512)
	n, err := file.Read(buf)
	if err != nil && err != io.EOF {
		return false, err
	}

	for i := 0; i < n; i++ {
		if buf[i] == 0 {
			return true, nil
		}
	}
	return false, nil
}

func main() {
	fmt.Println("🚀 Starting Dual-Run Parity Verification Harness...")

	homeDir, err := os.UserHomeDir()
	if err != nil {
		fmt.Fprintf(os.Stderr, "❌ Failed to retrieve user home directory: %v\n", err)
		os.Exit(1)
	}

	// 1. Compile the Go executable dynamically and save it to .dist/dotfiles
	fmt.Println("🔨 Compiling Go binary...")
	if err := os.MkdirAll(".dist", 0755); err != nil {
		fmt.Fprintf(os.Stderr, "❌ Failed to create .dist directory: %v\n", err)
		os.Exit(1)
	}

	buildCmd := exec.Command("go", "build", "-o", ".dist/dotfiles", "./cmd/dotfiles")
	buildCmd.Stdout = os.Stdout
	buildCmd.Stderr = os.Stderr
	if err := buildCmd.Run(); err != nil {
		fmt.Fprintf(os.Stderr, "❌ Go compilation failed: %v\n", err)
		os.Exit(1)
	}
	fmt.Println("✅ Go binary compiled successfully.")

	// Prepare output directories
	tsDir := ".generated/ts"
	goDir := ".generated/go"
	testProjectGenDir := "test-project-npm/.generated"

	if err := resetDirectory(tsDir); err != nil {
		fmt.Fprintf(os.Stderr, "❌ Failed to reset TS output directory: %v\n", err)
		os.Exit(1)
	}
	if err := resetDirectory(goDir); err != nil {
		fmt.Fprintf(os.Stderr, "❌ Failed to reset Go output directory: %v\n", err)
		os.Exit(1)
	}
	_ = os.RemoveAll(testProjectGenDir)

	// 2. Execute TS CLI dual run
	fmt.Println("🏃 Running legacy TS CLI...")
	tsConsoleLog, err := runCLI("bun", "run", "./cli.ts", "--config=test-project-npm/dotfiles.config.ts", "generate", "--dry-run")
	if err != nil {
		fmt.Fprintf(os.Stderr, "⚠️ TS CLI returned error/non-zero: %v\n", err)
	}

	// Normalize TS console logs
	tsNormalizedConsoleLog := normalizeContent(tsConsoleLog, homeDir)
	if err := os.WriteFile(filepath.Join(tsDir, "console.log"), []byte(tsNormalizedConsoleLog), 0644); err != nil {
		fmt.Fprintf(os.Stderr, "❌ Failed to write TS console.log: %v\n", err)
		os.Exit(1)
	}

	// Copy TS generated files if any
	if err := copyAndResetGeneratedDir(testProjectGenDir, tsDir, homeDir); err != nil {
		fmt.Fprintf(os.Stderr, "❌ Failed copying TS output files: %v\n", err)
		os.Exit(1)
	}

	// 3. Execute Go CLI dual run
	fmt.Println("🏃 Running compiled Go CLI...")
	goConsoleLog, err := runCLI(".dist/dotfiles", "--config=test-project-npm/dotfiles.config.ts", "generate", "--dry-run")
	if err != nil {
		fmt.Fprintf(os.Stderr, "⚠️ Go CLI returned error/non-zero: %v\n", err)
	}

	// Normalize Go console logs
	goNormalizedConsoleLog := normalizeContent(goConsoleLog, homeDir)
	if err := os.WriteFile(filepath.Join(goDir, "console.log"), []byte(goNormalizedConsoleLog), 0644); err != nil {
		fmt.Fprintf(os.Stderr, "❌ Failed to write Go console.log: %v\n", err)
		os.Exit(1)
	}

	// Copy Go generated files if any
	if err := copyAndResetGeneratedDir(testProjectGenDir, goDir, homeDir); err != nil {
		fmt.Fprintf(os.Stderr, "❌ Failed copying Go output files: %v\n", err)
		os.Exit(1)
	}

	// 4. Assert exact equality recursively
	fmt.Println("🔍 Asserting exact parity between TS and Go outputs...")
	if err := assertParity(tsDir, goDir, homeDir); err != nil {
		fmt.Fprintf(os.Stderr, "❌ PARITY FAILURE:\n%v\n", err)
		os.Exit(1)
	}

	fmt.Println("🎉 PARITY SUCCESS! Legacy TS and compiled Go outputs are identical.")
}

func resetDirectory(dir string) error {
	if err := os.RemoveAll(dir); err != nil {
		return err
	}
	return os.MkdirAll(dir, 0755)
}

func runCLI(name string, args ...string) (string, error) {
	cmd := exec.Command(name, args...)
	cmd.Env = append(os.Environ(), "DOTFILES_BUILT_PACKAGE_NAME=@dotfiles/core")
	outputBytes, err := cmd.CombinedOutput()
	return string(outputBytes), err
}

func normalizeContent(content string, homeDir string) string {
	content = stripAnsi(content)
	// Convert CRLF to LF
	content = strings.ReplaceAll(content, "\r\n", "\n")

	// Normalize Windows-style paths to forward slashes before replacing home directory
	content = strings.ReplaceAll(content, "\\", "/")
	normalizedHome := strings.ReplaceAll(homeDir, "\\", "/")
	content = strings.ReplaceAll(content, normalizedHome, "{{HOME}}")

	// Mask UUIDs with zero-UUID
	content = uuidRegex.ReplaceAllString(content, "00000000-0000-0000-0000-000000000000")

	return content
}

func copyAndResetGeneratedDir(src, dst, homeDir string) error {
	if _, err := os.Stat(src); os.IsNotExist(err) {
		// Nothing generated
		return nil
	}

	// If registry.db exists, process it semantically
	dbPath := filepath.Join(src, "registry.db")
	if _, err := os.Stat(dbPath); err == nil {
		destJSONPrefix := filepath.Join(dst, "db")
		if err := serializeDB(dbPath, destJSONPrefix, homeDir); err != nil {
			return fmt.Errorf("failed semantic DB serialization: %w", err)
		}
	}

	// Recursively copy files, skipping DB binary files
	err := filepath.Walk(src, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}

		// Avoid walking or copying any .git directory
		if info.IsDir() && info.Name() == ".git" {
			return filepath.SkipDir
		}

		rel, err := filepath.Rel(src, path)
		if err != nil {
			return err
		}

		if info.IsDir() {
			if rel == "." {
				return nil
			}
			return os.MkdirAll(filepath.Join(dst, rel), 0755)
		}

		// Skip SQLite DB and write-ahead files
		if strings.HasSuffix(info.Name(), ".db") || strings.HasSuffix(info.Name(), ".db-shm") || strings.HasSuffix(info.Name(), ".db-wal") {
			return nil
		}

		// Check if file is binary
		isBin, err := isBinaryFile(path)
		if err != nil {
			return fmt.Errorf("checking file type: %w", err)
		}

		if isBin {
			// Copy binary files raw
			bytes, err := os.ReadFile(path)
			if err != nil {
				return fmt.Errorf("reading binary file %s: %w", path, err)
			}
			return os.WriteFile(filepath.Join(dst, rel), bytes, info.Mode())
		}

		// Normalize text file and write to dest
		normalized, err := normalizeTextFile(path, homeDir)
		if err != nil {
			return fmt.Errorf("reading file for copy: %w", err)
		}

		return os.WriteFile(filepath.Join(dst, rel), []byte(normalized), info.Mode())
	})

	if err != nil {
		return err
	}

	return os.RemoveAll(src)
}

func normalizeTextFile(filePath, homeDir string) (string, error) {
	bytes, err := os.ReadFile(filePath)
	if err != nil {
		return "", err
	}
	return normalizeContent(string(bytes), homeDir), nil
}

func tableExists(db *sql.DB, tableName string) bool {
	var name string
	err := db.QueryRow("SELECT name FROM sqlite_master WHERE type='table' AND name=?", tableName).Scan(&name)
	return err == nil
}

func normalizeStringPtr(ptr *string, homeDir string) *string {
	if ptr == nil {
		return nil
	}
	normalized := normalizeContent(*ptr, homeDir)
	return &normalized
}

func serializeDB(dbPath, destJSONPrefix, homeDir string) error {
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return fmt.Errorf("failed to open database %s: %w", dbPath, err)
	}
	defer db.Close()

	// 1. file_operations
	fileOps := []FileOpRow{}
	if tableExists(db, "file_operations") {
		rows, err := db.Query(`
			SELECT tool_name, operation_type, file_path, target_path, file_type, metadata, size_bytes, permissions, operation_id 
			FROM file_operations 
			ORDER BY tool_name, operation_type, file_path, target_path, file_type, metadata, size_bytes, permissions, operation_id
		`)
		if err != nil {
			return fmt.Errorf("querying file_operations: %w", err)
		}
		defer rows.Close()
		for rows.Next() {
			var r FileOpRow
			if err := rows.Scan(&r.ToolName, &r.OperationType, &r.FilePath, &r.TargetPath, &r.FileType, &r.Metadata, &r.SizeBytes, &r.Permissions, &r.OperationID); err != nil {
				return fmt.Errorf("scanning file_operations: %w", err)
			}
			r.ToolName = normalizeContent(r.ToolName, homeDir)
			r.OperationType = normalizeContent(r.OperationType, homeDir)

			// Skip directory creation/cleanup/rename operations to keep comparison robust across Go and TS
			if r.OperationType == "mkdir" || r.OperationType == "rm" || r.OperationType == "rename" {
				continue
			}

			r.FilePath = normalizeContent(r.FilePath, homeDir)
			r.TargetPath = normalizeStringPtr(r.TargetPath, homeDir)
			r.FileType = normalizeContent(r.FileType, homeDir)
			r.Metadata = normalizeStringPtr(r.Metadata, homeDir)
			r.OperationID = normalizeContent(r.OperationID, homeDir)

			// Normalize size_bytes for shims and init scripts since templates and paths differ in length
			if r.FileType == "shim" || r.FileType == "init" {
				r.SizeBytes = nil
			}

			fileOps = append(fileOps, r)
		}
		if err := rows.Err(); err != nil {
			return fmt.Errorf("file_operations rows iteration failed: %w", err)
		}
	}
	fileOpsData, err := json.MarshalIndent(fileOps, "", "  ")
	if err != nil {
		return fmt.Errorf("marshaling file_operations: %w", err)
	}
	if err := os.WriteFile(destJSONPrefix+"_file_operations.json", fileOpsData, 0644); err != nil {
		return fmt.Errorf("writing file_operations JSON: %w", err)
	}

	// 2. tool_installations
	toolInsts := []ToolInstRow{}
	if tableExists(db, "tool_installations") {
		rows, err := db.Query(`
			SELECT tool_name, version, install_path, binary_paths, download_url, asset_name, configured_version, original_tag, install_method 
			FROM tool_installations 
			ORDER BY tool_name, version, install_path, binary_paths, download_url, asset_name, configured_version, original_tag, install_method
		`)
		if err != nil {
			return fmt.Errorf("querying tool_installations: %w", err)
		}
		defer rows.Close()
		for rows.Next() {
			var r ToolInstRow
			if err := rows.Scan(&r.ToolName, &r.Version, &r.InstallPath, &r.BinaryPaths, &r.DownloadURL, &r.AssetName, &r.ConfiguredVersion, &r.OriginalTag, &r.InstallMethod); err != nil {
				return fmt.Errorf("scanning tool_installations: %w", err)
			}
			r.ToolName = normalizeContent(r.ToolName, homeDir)
			r.Version = normalizeContent(r.Version, homeDir)
			r.InstallPath = normalizeContent(r.InstallPath, homeDir)
			r.BinaryPaths = normalizeContent(r.BinaryPaths, homeDir)
			r.DownloadURL = normalizeStringPtr(r.DownloadURL, homeDir)
			r.AssetName = normalizeStringPtr(r.AssetName, homeDir)
			r.ConfiguredVersion = normalizeStringPtr(r.ConfiguredVersion, homeDir)
			r.OriginalTag = normalizeStringPtr(r.OriginalTag, homeDir)
			r.InstallMethod = normalizeStringPtr(r.InstallMethod, homeDir)
			toolInsts = append(toolInsts, r)
		}
		if err := rows.Err(); err != nil {
			return fmt.Errorf("tool_installations rows iteration failed: %w", err)
		}
	}
	toolInstsData, err := json.MarshalIndent(toolInsts, "", "  ")
	if err != nil {
		return fmt.Errorf("marshaling tool_installations: %w", err)
	}
	if err := os.WriteFile(destJSONPrefix+"_tool_installations.json", toolInstsData, 0644); err != nil {
		return fmt.Errorf("writing tool_installations JSON: %w", err)
	}

	// 3. tool_usage
	toolUsages := []ToolUsageRow{}
	if tableExists(db, "tool_usage") {
		rows, err := db.Query(`
			SELECT tool_name, binary_name, usage_count 
			FROM tool_usage 
			ORDER BY tool_name, binary_name, usage_count
		`)
		if err != nil {
			return fmt.Errorf("querying tool_usage: %w", err)
		}
		defer rows.Close()
		for rows.Next() {
			var r ToolUsageRow
			if err := rows.Scan(&r.ToolName, &r.BinaryName, &r.UsageCount); err != nil {
				return fmt.Errorf("scanning tool_usage: %w", err)
			}
			r.ToolName = normalizeContent(r.ToolName, homeDir)
			r.BinaryName = normalizeContent(r.BinaryName, homeDir)
			toolUsages = append(toolUsages, r)
		}
		if err := rows.Err(); err != nil {
			return fmt.Errorf("tool_usage rows iteration failed: %w", err)
		}
	}
	toolUsagesData, err := json.MarshalIndent(toolUsages, "", "  ")
	if err != nil {
		return fmt.Errorf("marshaling tool_usage: %w", err)
	}
	if err := os.WriteFile(destJSONPrefix+"_tool_usage.json", toolUsagesData, 0644); err != nil {
		return fmt.Errorf("writing tool_usage JSON: %w", err)
	}

	return nil
}

func assertParity(tsDir, goDir, homeDir string) error {
	mismatches := []string{}

	// Helper to find all files recursively
	getFiles := func(dir string) (map[string]string, error) {
		files := make(map[string]string)
		err := filepath.Walk(dir, func(path string, info os.FileInfo, err error) error {
			if err != nil {
				return err
			}
			if info.IsDir() && info.Name() == ".git" {
				return filepath.SkipDir
			}
			if !info.IsDir() {
				rel, err := filepath.Rel(dir, path)
				if err != nil {
					return err
				}
				normalizedRel := uuidRegex.ReplaceAllString(rel, "00000000-0000-0000-0000-000000000000")
				files[normalizedRel] = path
			}
			return nil
		})
		return files, err
	}

	tsFiles, err := getFiles(tsDir)
	if err != nil {
		return fmt.Errorf("failed to list files in %s: %w", tsDir, err)
	}

	goFiles, err := getFiles(goDir)
	if err != nil {
		return fmt.Errorf("failed to list files in %s: %w", goDir, err)
	}

	// Check missing in Go
	for f := range tsFiles {
		if _, ok := goFiles[f]; !ok {
			mismatches = append(mismatches, fmt.Sprintf("❌ File present in TS but missing in Go: %s", f))
		}
	}

	// Check extra in Go
	for f := range goFiles {
		if _, ok := tsFiles[f]; !ok {
			mismatches = append(mismatches, fmt.Sprintf("❌ File present in Go but missing in TS: %s", f))
		}
	}

	// Compare contents
	for f, tsPath := range tsFiles {
		if f == "console.log" {
			continue
		}
		if goPath, ok := goFiles[f]; ok {
			tsContent, err := os.ReadFile(tsPath)
			if err != nil {
				return fmt.Errorf("failed to read TS file %s: %w", tsPath, err)
			}

			goContent, err := os.ReadFile(goPath)
			if err != nil {
				return fmt.Errorf("failed to read Go file %s: %w", goPath, err)
			}

			if string(tsContent) != string(goContent) {
				diff := generateDiff(tsPath, goPath, string(tsContent), string(goContent))
				mismatches = append(mismatches, fmt.Sprintf("❌ Content mismatch in %s:\n%s\n", f, diff))
			}
		}
	}

	if len(mismatches) > 0 {
		return fmt.Errorf("%s", strings.Join(mismatches, "\n"))
	}

	return nil
}

func generateDiff(tsPath, goPath, tsContent, goContent string) string {
	tsLines := strings.Split(tsContent, "\n")
	goLines := strings.Split(goContent, "\n")

	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("--- %s\n+++ %s\n", tsPath, goPath))

	maxLines := len(tsLines)
	if len(goLines) > maxLines {
		maxLines = len(goLines)
	}

	for i := 0; i < maxLines; i++ {
		var tsLine, goLine string
		hasTS := i < len(tsLines)
		hasGo := i < len(goLines)

		if hasTS {
			tsLine = tsLines[i]
		}
		if hasGo {
			goLine = goLines[i]
		}

		if hasTS && hasGo {
			if tsLine != goLine {
				sb.WriteString(fmt.Sprintf("Line %d mismatch:\n", i+1))
				sb.WriteString(fmt.Sprintf("- %s\n", tsLine))
				sb.WriteString(fmt.Sprintf("+ %s\n", goLine))
			}
		} else if hasTS && !hasGo {
			sb.WriteString(fmt.Sprintf("Line %d extra in TS:\n", i+1))
			sb.WriteString(fmt.Sprintf("- %s\n", tsLine))
		} else if !hasTS && hasGo {
			sb.WriteString(fmt.Sprintf("Line %d extra in Go:\n", i+1))
			sb.WriteString(fmt.Sprintf("+ %s\n", goLine))
		}
	}
	return sb.String()
}
