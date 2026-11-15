package registry

import (
	"context"
	"database/sql"
	"testing"
)

func TestAppBundleIdentityRoundTrip(t *testing.T) {
	_, reg := setupTestDB(t)
	ctx := context.Background()
	rec := &ToolInstallationRecord{ToolName: "app", Version: "1", InstallPath: "/bin/app", AppBundlePath: ptr("/Applications/App.app"), AppBundleIdentifier: ptr("example.app"), AppBundleInfoPlistHash: ptr("hash"), AppBundlePendingRemoval: ptr("/Applications/App.app")}
	if err := reg.WithTx(ctx, func(tx *sql.Tx) error { return reg.RecordToolInstallation(ctx, tx, rec) }); err != nil {
		t.Fatal(err)
	}
	assert := func(wantID, wantHash, wantPending string) {
		t.Helper()
		got, err := reg.GetToolInstallation(ctx, "app")
		if err != nil || got == nil || got.AppBundleIdentifier == nil || *got.AppBundleIdentifier != wantID || got.AppBundleInfoPlistHash == nil || *got.AppBundleInfoPlistHash != wantHash || got.AppBundlePendingRemoval == nil || *got.AppBundlePendingRemoval != wantPending {
			t.Fatalf("identity %+v, %v", got, err)
		}
		all, err := reg.GetAllToolInstallations(ctx)
		if err != nil || len(all) != 1 || all[0].AppBundleIdentifier == nil || *all[0].AppBundleIdentifier != wantID || *all[0].AppBundleInfoPlistHash != wantHash || all[0].AppBundlePendingRemoval == nil || *all[0].AppBundlePendingRemoval != wantPending {
			t.Fatalf("all identity %+v, %v", all, err)
		}
	}
	assert("example.app", "hash", "/Applications/App.app")
	if err := reg.WithTx(ctx, func(tx *sql.Tx) error {
		return reg.UpdateToolInstallation(ctx, tx, "app", ToolInstallationUpdate{AppBundleIdentifier: ptr("updated.app"), AppBundleInfoPlistHash: ptr("updated-hash"), AppBundlePendingRemoval: ptr("")})
	}); err != nil {
		t.Fatal(err)
	}
	assert("updated.app", "updated-hash", "")
}
