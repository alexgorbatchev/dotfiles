package registry

import (
	"context"
	"database/sql"
	"testing"
	"time"
)

func TestGetToolUsagesAndForTool(t *testing.T) {
	_, reg := setupTestDB(t)
	ctx := context.Background()

	err := reg.WithTx(ctx, func(tx *sql.Tx) error {
		u1 := &ToolUsageRecord{
			ToolName:   "bat",
			BinaryName: "bat",
			UsageCount: 5,
			LastUsedAt: 1000,
		}
		u2 := &ToolUsageRecord{
			ToolName:   "bat",
			BinaryName: "bat-cache",
			UsageCount: 2,
			LastUsedAt: 1200,
		}
		u3 := &ToolUsageRecord{
			ToolName:   "fzf",
			BinaryName: "fzf",
			UsageCount: 10,
			LastUsedAt: 1500,
		}
		if err := reg.RecordToolUsage(ctx, tx, u1); err != nil {
			return err
		}
		if err := reg.RecordToolUsage(ctx, tx, u2); err != nil {
			return err
		}
		return reg.RecordToolUsage(ctx, tx, u3)
	})
	if err != nil {
		t.Fatalf("Failed to record usage records: %v", err)
	}

	usagesBat, err := reg.GetToolUsagesForTool(ctx, "bat")
	if err != nil {
		t.Fatalf("GetToolUsagesForTool failed: %v", err)
	}
	if len(usagesBat) != 2 {
		t.Errorf("expected 2 usage records for bat, got %d", len(usagesBat))
	}

	allUsages, err := reg.GetToolUsages(ctx)
	if err != nil {
		t.Fatalf("GetToolUsages failed: %v", err)
	}
	if len(allUsages) != 3 {
		t.Errorf("expected 3 total usage records, got %d", len(allUsages))
	}
}

func TestPermissionTypeMethods(t *testing.T) {
	var emptyPerm Permission
	b, err := emptyPerm.MarshalJSON()
	if err != nil || string(b) != "0" {
		t.Errorf("empty permission MarshalJSON failed: %v, %s", err, string(b))
	}

	val, err := emptyPerm.Value()
	if err != nil || val != nil {
		t.Errorf("empty permission Value failed: %v, %v", err, val)
	}

	pOctal := Permission("0o755")
	bOctal, err := pOctal.MarshalJSON()
	if err != nil || string(bOctal) != "493" {
		t.Errorf("0o755 MarshalJSON failed: %v, %s", err, string(bOctal))
	}

	pDec := Permission("493")
	bDec, err := pDec.MarshalJSON()
	if err != nil || string(bDec) != "493" {
		t.Errorf("decimal fallback MarshalJSON failed: %v, %s", err, string(bDec))
	}

	pInvalid := Permission("invalid_mode")
	_, err = pInvalid.MarshalJSON()
	if err == nil {
		t.Error("expected error for invalid permission string in MarshalJSON")
	}

	var pUnm Permission
	if err := pUnm.UnmarshalJSON([]byte("null")); err != nil || pUnm != "" {
		t.Errorf("UnmarshalJSON(null) failed: %v, %v", err, pUnm)
	}

	if err := pUnm.UnmarshalJSON([]byte(`"not_a_number"`)); err == nil {
		t.Error("expected error unmarshalling invalid number")
	}

	var pScan Permission
	if err := pScan.Scan(nil); err != nil || pScan != "" {
		t.Errorf("Scan(nil) failed: %v, %v", err, pScan)
	}

	if err := pScan.Scan([]byte("493")); err != nil || pScan != "0755" {
		t.Errorf("Scan([]byte) failed: %v, %v", err, pScan)
	}

	if err := pScan.Scan(12345); err == nil {
		t.Error("expected error scanning int into Permission")
	}
}

func TestUpdateToolInstallationAllFields(t *testing.T) {
	_, reg := setupTestDB(t)
	ctx := context.Background()

	rec := &ToolInstallationRecord{
		ToolName:    "eza",
		Version:     "1.0.0",
		InstallPath: "/usr/local/bin/eza",
		Timestamp:   "now",
		InstalledAt: time.Now().UnixMilli(),
		BinaryPaths: "[]",
	}
	err := reg.WithTx(ctx, func(tx *sql.Tx) error {
		return reg.RecordToolInstallation(ctx, tx, rec)
	})
	if err != nil {
		t.Fatalf("RecordToolInstallation failed: %v", err)
	}

	newVersion := "1.1.0"
	newInstallPath := "/opt/bin/eza"
	newBinPaths := `["/opt/bin/eza"]`
	newDownloadURL := "https://example.com/eza.tar.gz"
	newAssetName := "eza.tar.gz"
	newConfiguredVersion := "1.1.0"
	newOriginalTag := "v1.1.0"
	newInstallMethod := "cargo"

	err = reg.WithTx(ctx, func(tx *sql.Tx) error {
		return reg.UpdateToolInstallation(ctx, tx, "eza", ToolInstallationUpdate{
			Version:           &newVersion,
			InstallPath:       &newInstallPath,
			BinaryPaths:       &newBinPaths,
			DownloadURL:       &newDownloadURL,
			AssetName:         &newAssetName,
			ConfiguredVersion: &newConfiguredVersion,
			OriginalTag:       &newOriginalTag,
			InstallMethod:     &newInstallMethod,
		})
	})
	if err != nil {
		t.Fatalf("UpdateToolInstallation with all fields failed: %v", err)
	}

	updated, err := reg.GetToolInstallation(ctx, "eza")
	if err != nil || updated == nil {
		t.Fatalf("GetToolInstallation failed: %v", err)
	}
	if updated.Version != "1.1.0" || updated.InstallPath != "/opt/bin/eza" || *updated.DownloadURL != newDownloadURL || *updated.InstallMethod != "cargo" {
		t.Errorf("unexpected updated record: %+v", updated)
	}
}

func TestValidateWithIssues(t *testing.T) {
	_, reg := setupTestDB(t)
	ctx := context.Background()

	err := reg.WithTx(ctx, func(tx *sql.Tx) error {
		_ = reg.RecordFileOperation(ctx, tx, &FileOperationRecord{
			ToolName:      "bat",
			OperationType: "write",
			FilePath:      "/f1",
			FileType:      "file",
			CreatedAt:     100,
			OperationID:   "same-op-id",
		})
		_ = reg.RecordFileOperation(ctx, tx, &FileOperationRecord{
			ToolName:      "bat",
			OperationType: "write",
			FilePath:      "/f2",
			FileType:      "file",
			CreatedAt:     101,
			OperationID:   "same-op-id",
		})

		target := "/missing/db/target"
		return reg.RecordFileOperation(ctx, tx, &FileOperationRecord{
			ToolName:      "bat",
			OperationType: "symlink",
			FilePath:      "/symlink",
			TargetPath:    &target,
			FileType:      "symlink",
			CreatedAt:     102,
			OperationID:   "op-sym-broken",
		})
	})
	if err != nil {
		t.Fatalf("setup failed: %v", err)
	}

	vRes, err := reg.Validate(ctx)
	if err != nil {
		t.Fatalf("Validate failed: %v", err)
	}
	if vRes.Valid {
		t.Errorf("expected Validate to be invalid when duplicate op IDs and broken symlinks exist")
	}
	if len(vRes.Issues) < 2 {
		t.Errorf("expected at least 2 issues, got %d: %v", len(vRes.Issues), vRes.Issues)
	}
}

func TestPermConversionEdgeCases(t *testing.T) {
	if got := OctalToDecimalPerm("invalid_octal_xyz"); got != "invalid_octal_xyz" {
		t.Errorf("OctalToDecimalPerm(invalid) = %q, want invalid_octal_xyz", got)
	}

	if got := DecimalToOctalPerm("invalid_dec_xyz"); got != "invalid_dec_xyz" {
		t.Errorf("DecimalToOctalPerm(invalid) = %q, want invalid_dec_xyz", got)
	}

	if _, err := DecimalStringToMode("invalid_mode_xyz"); err == nil {
		t.Error("expected error for DecimalStringToMode(invalid)")
	}
}

func TestToolUsageErrorsAndNotFound(t *testing.T) {
	database, reg := setupTestDB(t)
	ctx := context.Background()

	u, err := reg.GetToolUsage(ctx, "nonexistent", "nonexistent")
	if err != nil || u != nil {
		t.Errorf("expected nil, nil for non-existent GetToolUsage, got u=%v, err=%v", u, err)
	}

	tx, err := database.BeginTx(ctx, nil)
	if err != nil {
		t.Fatalf("failed to begin tx: %v", err)
	}
	_ = tx.Rollback()

	err = reg.RecordToolUsage(ctx, tx, &ToolUsageRecord{
		ToolName:   "fzf",
		BinaryName: "fzf",
		UsageCount: 1,
		LastUsedAt: 1000,
	})
	if err == nil {
		t.Error("expected error recording usage on rolled back tx")
	}
}

func TestRegistryMethodsEdgeCases(t *testing.T) {
	database, reg := setupTestDB(t)
	ctx := context.Background()

	// OctalToDecimalPerm & DecimalToOctalPerm
	if d := OctalToDecimalPerm("0o755"); d != "493" {
		t.Errorf("OctalToDecimalPerm(0o755) = %s, want '493'", d)
	}
	if d := OctalToDecimalPerm("0755"); d != "493" {
		t.Errorf("OctalToDecimalPerm(0755) = %s, want '493'", d)
	}
	if d := OctalToDecimalPerm("755"); d != "493" {
		t.Errorf("OctalToDecimalPerm(755) = %s, want '493'", d)
	}
	if d := OctalToDecimalPerm(""); d != "" {
		t.Errorf("OctalToDecimalPerm('') = %s, want ''", d)
	}
	if o := DecimalToOctalPerm(""); o != "" {
		t.Errorf("DecimalToOctalPerm('') = %s, want ''", o)
	}
	if o := DecimalToOctalPerm("0o755"); o != "0755" {
		t.Errorf("DecimalToOctalPerm(0o755) = %s, want '0755'", o)
	}

	// WithTx error rollback
	errTx := reg.WithTx(ctx, func(tx *sql.Tx) error {
		return sql.ErrTxDone
	})
	if errTx == nil {
		t.Errorf("expected error from WithTx")
	}

	// RemoveToolInstallation & RemoveFileOperationsByTool
	_ = reg.WithTx(ctx, func(tx *sql.Tx) error {
		_ = reg.RecordToolInstallation(ctx, tx, &ToolInstallationRecord{
			ToolName:    "removetool",
			Version:     "1.0.0",
			InstallPath: "/bin/removetool",
			Timestamp:   "now",
			InstalledAt: 1000,
			BinaryPaths: "[]",
		})
		size := int64(100)
		_ = reg.RecordFileOperation(ctx, tx, &FileOperationRecord{
			ToolName:      "removetool",
			OperationType: "write",
			FilePath:      "/bin/removetool",
			FileType:      "binary",
			CreatedAt:     1000,
			SizeBytes:     &size,
		})
		return nil
	})

	_ = reg.WithTx(ctx, func(tx *sql.Tx) error {
		_ = reg.RemoveToolInstallation(ctx, tx, "removetool")
		_ = reg.Compact(ctx, tx)
		return reg.RemoveFileOperationsByTool(ctx, tx, "removetool")
	})

	inst, _ := reg.GetToolInstallation(ctx, "removetool")
	if inst != nil {
		t.Errorf("expected removetool to be removed")
	}

	// Compact & Validate
	_ = reg.Compact(ctx, nil)

	// Validate with valid on-disk files
	tmpInstallPath := t.TempDir()
	_ = reg.WithTx(ctx, func(tx *sql.Tx) error {
		return reg.RecordToolInstallation(ctx, tx, &ToolInstallationRecord{
			ToolName:    "validtool",
			Version:     "1.0.0",
			InstallPath: tmpInstallPath,
			Timestamp:   "now",
			InstalledAt: 1000,
			BinaryPaths: "[]",
		})
	})

	res, err := reg.Validate(ctx)
	if err != nil || res == nil {
		t.Errorf("Validate failed: res=%v, err=%v", res, err)
	}

	// Close DB and test error paths
	_ = database.Close()
	_, errStats := reg.GetStats(ctx)
	if errStats == nil {
		t.Errorf("expected error from GetStats on closed DB")
	}
}
