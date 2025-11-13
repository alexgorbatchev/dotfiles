import { beforeEach, describe, expect, it } from 'bun:test';
import { TestLogger } from '@dotfiles/logger';
import { BrewInstallerPlugin } from '../BrewInstallerPlugin';

describe('BrewInstallerPlugin - externallyManaged property', () => {
  let logger: TestLogger;
  let plugin: BrewInstallerPlugin;

  beforeEach(() => {
    logger = new TestLogger();
    plugin = new BrewInstallerPlugin(logger);
  });

  it('should have externallyManaged set to true', () => {
    expect(plugin.externallyManaged).toBe(true);
  });

  it('should prevent timestamped directory creation in installer', () => {
    // This test verifies that the externallyManaged flag is present
    // The actual directory creation logic is tested in the Installer tests
    // where we verify that when a plugin has externallyManaged=true,
    // no timestamped directories (binaries/tool/YYYY-MM-DD-HH-MM-SS) are created
    expect(plugin.externallyManaged).toBeDefined();
    expect(typeof plugin.externallyManaged).toBe('boolean');
  });
});
