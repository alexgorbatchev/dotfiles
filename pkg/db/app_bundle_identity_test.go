package db

import (
	"context"
	"testing"
)

func TestAppBundleIdentityMigration(t *testing.T) {
	ctx := context.Background()
	database, err := NewConnection(ctx, ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	if _, err := database.Exec("INSERT INTO tool_installations(tool_name,version,install_path,timestamp,installed_at,binary_paths,app_bundle_path) VALUES('legacy','1','/bin/legacy','now',0,'[]','/Applications/Legacy.app')"); err != nil {
		t.Fatal(err)
	}
	for _, column := range []string{"app_bundle_identifier", "app_bundle_info_plist_hash", "app_bundle_pending_removal"} {
		if _, err := database.Exec("ALTER TABLE tool_installations DROP COLUMN " + column); err != nil {
			t.Fatal(err)
		}
	}
	if err := InitializeSchema(ctx, database); err != nil {
		t.Fatal(err)
	}
	var id, hash, pending *string
	var path string
	if err := database.QueryRow("SELECT app_bundle_path,app_bundle_identifier,app_bundle_info_plist_hash,app_bundle_pending_removal FROM tool_installations WHERE tool_name='legacy'").Scan(&path, &id, &hash, &pending); err != nil {
		t.Fatal(err)
	}
	if path != "/Applications/Legacy.app" || id != nil || hash != nil || pending != nil {
		t.Fatalf("legacy data changed: %q %v %v", path, id, hash)
	}
	if err := InitializeSchema(ctx, database); err != nil {
		t.Fatal(err)
	}
}
