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

function getToolInstallation(generatedDir: string, toolName: string): ToolInstallationRow | null {
  const dbPath = path.join(generatedDir, 'registry.db');
  const db = new Database(dbPath);
  const row = db
    .query<ToolInstallationRow, { $toolName: string }>('SELECT * FROM tool_installations WHERE tool_name = $toolName')
    .get({ $toolName: toolName });
  db.close();
  return row;
}

export function versionDetectionScenarios(harness: TestHarness) {
  async function verifyVersionDetection(toolName: string, expectedVersion: string) {
    const result = await harness.install([toolName], ['--log=trace']);
    expect(result.exitCode).toBe(0);

    const binPath = path.join(harness.generatedDir, 'binaries', toolName, toolName);
    expect(await harness.fileExists(binPath)).toBe(true);

    const row = getToolInstallation(harness.generatedDir, toolName);
    assert.ok(row);
    expect(row.version).toBe(expectedVersion);
    expect(row.install_path).toContain(`${toolName}/${expectedVersion}`);
  }

  describe('version detection', () => {
    it('should detect version after installation', async () => {
      await verifyVersionDetection('version-detection--curl-script--with-args', '2.3.4');
    }, 30000);

    it('should detect version using default args (--version) and semver regex', async () => {
      await verifyVersionDetection('version-detection--curl-script--default-args', '1.38.1');
    }, 30000);

    it('should detect version after installation (curl-tar)', async () => {
      await verifyVersionDetection('version-detection--curl-tar--with-args', '3.4.5');
    }, 30000);

    it('should detect version using default args (curl-tar)', async () => {
      await verifyVersionDetection('version-detection--curl-tar--default-args', '4.5.6');
    }, 30000);

    it('should fall back to timestamp when version detection fails', async () => {
      const toolName = 'version-detection--curl-script--no-version';
      const result = await harness.install([toolName], ['--log=trace']);

      expect(result.exitCode).toBe(0);

      const binPath = path.join(harness.generatedDir, 'binaries', toolName, toolName);
      expect(await harness.fileExists(binPath)).toBe(true);

      const row = getToolInstallation(harness.generatedDir, toolName);
      assert.ok(row);

      // Version should be a timestamp format (YYYY-MM-DD-HH-MM-SS)
      expect(row.version).toMatch(/^\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}$/);
      expect(row.install_path).toContain(`${toolName}/${row.version}`);
    }, 30000);
  });
}
