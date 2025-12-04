import { Database } from 'bun:sqlite';
import { describe, expect, it } from 'bun:test';
import assert from 'node:assert';
import * as path from 'node:path';
import type { TestHarness } from '../../TestHarness';

interface ToolInstallationRow {
  tool_name: string;
  version: string;
  install_path: string;
}

export function versionDetectionScenarios(harness: TestHarness) {
  describe('version detection', () => {
    it('should detect version after installation', async () => {
      const result = await harness.install(['version-detection--with-args'], ['--log=trace']);

      expect(result.exitCode).toBe(0);

      // Verify the tool was installed (check the symlink in the tool root)
      const binPath = path.join(
        harness.generatedDir,
        'binaries',
        'version-detection--with-args',
        'version-detection--with-args'
      );
      expect(await harness.fileExists(binPath)).toBe(true);

      // Verify the registry contains the detected version
      const dbPath = path.join(harness.generatedDir, 'registry.db');
      const db = new Database(dbPath);
      const row = db
        .query<ToolInstallationRow, { $toolName: string }>(
          'SELECT * FROM tool_installations WHERE tool_name = $toolName'
        )
        .get({ $toolName: 'version-detection--with-args' });

      assert.ok(row);
      expect(row.version).toBe('2.3.4');
      expect(row.install_path).toContain('version-detection--with-args/2.3.4');
      db.close();
    }, 30000);

    it('should detect version using default args (--version) and semver regex', async () => {
      const result = await harness.install(['version-detection--default-args'], ['--log=trace']);

      expect(result.exitCode).toBe(0);

      // Verify the tool was installed
      const binPath = path.join(
        harness.generatedDir,
        'binaries',
        'version-detection--default-args',
        'version-detection--default-args'
      );
      expect(await harness.fileExists(binPath)).toBe(true);

      // Verify the registry contains the detected version
      const dbPath = path.join(harness.generatedDir, 'registry.db');
      const db = new Database(dbPath);
      const row = db
        .query<ToolInstallationRow, { $toolName: string }>(
          'SELECT * FROM tool_installations WHERE tool_name = $toolName'
        )
        .get({ $toolName: 'version-detection--default-args' });

      assert.ok(row);
      expect(row.version).toBe('1.38.1');
      expect(row.install_path).toContain('version-detection--default-args/1.38.1');
      db.close();
    }, 30000);

    it('should fall back to timestamp when version cannot be detected', async () => {
      const result = await harness.install(['version-detection--no-version'], ['--log=trace']);

      expect(result.exitCode).toBe(0);

      // Verify the tool was installed
      const binPath = path.join(
        harness.generatedDir,
        'binaries',
        'version-detection--no-version',
        'version-detection--no-version'
      );
      expect(await harness.fileExists(binPath)).toBe(true);

      // Verify the registry contains a timestamp-based version (format: YYYYMMDDHHMMSS)
      const dbPath = path.join(harness.generatedDir, 'registry.db');
      const db = new Database(dbPath);
      const row = db
        .query<ToolInstallationRow, { $toolName: string }>(
          'SELECT * FROM tool_installations WHERE tool_name = $toolName'
        )
        .get({ $toolName: 'version-detection--no-version' });

      assert.ok(row);
      // Version should be a timestamp (format: YYYY-MM-DD-HH-MM-SS)
      expect(row.version).toMatch(/^\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}$/);
      // Install path should contain the timestamp-based version
      expect(row.install_path).toMatch(/version-detection--no-version\/\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}/);
      db.close();
    }, 30000);
  });
}
