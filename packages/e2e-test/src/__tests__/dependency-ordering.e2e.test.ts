import { describe, expect, it } from 'bun:test';
import { Architecture, Platform } from '@dotfiles/core';
import { TestHarness } from '../TestHarness';

function createHarness(configPath: string): TestHarness {
  const harness = new TestHarness({
    testDir: import.meta.dir,
    configPath,
    platform: Platform.Linux,
    architecture: Architecture.X86_64,
    cleanBeforeRun: true,
  });
  return harness;
}

describe('E2E: dependency ordering validation', () => {
  it('generates successfully when dependencies are satisfied', async () => {
    const harness = createHarness('tools-dependencies/success/config.yaml');
    await harness.clean();
    const result = await harness.generate();
    expect(result.exitCode).toBe(0);
    await harness.verifyShim('dependency-provider');
    await harness.verifyShim('dependency-consumer');
  });

  it('fails when a dependency provider is missing', async () => {
    const harness = createHarness('tools-dependencies/missing-provider/config.yaml');
    await harness.clean();
    const result = await harness.generate();
    expect(result.exitCode).toBe(1);
    const combinedOutput = `${result.stdout}${result.stderr}`;
    expect(combinedOutput).toContain('Missing dependency: tool "dependency-consumer-missing" requires binary');
    expect(combinedOutput).toContain('missing-provider');
    expect(combinedOutput).toContain('platform linux/x86_64');
  });

  it('fails when multiple tools provide the same dependency', async () => {
    const harness = createHarness('tools-dependencies/ambiguous/config.yaml');
    await harness.clean();
    const result = await harness.generate();
    expect(result.exitCode).toBe(1);
    const combinedOutput = `${result.stdout}${result.stderr}`;
    expect(combinedOutput).toContain('Ambiguous dependency: binary "shared-dependency" is provided by multiple tools');
    expect(combinedOutput).toContain('dependency-provider-a');
    expect(combinedOutput).toContain('dependency-provider-b');
    expect(combinedOutput).toContain('dependency-consumer-ambiguous');
  });

  it('fails when dependencies create a cycle', async () => {
    const harness = createHarness('tools-dependencies/circular/config.yaml');
    await harness.clean();
    const result = await harness.generate();
    expect(result.exitCode).toBe(1);
    const combinedOutput = `${result.stdout}${result.stderr}`;
    expect(combinedOutput).toContain('Circular dependency detected between tools');
    expect(combinedOutput).toContain('dependency-cycle-a');
    expect(combinedOutput).toContain('dependency-cycle-b');
  });

  it('fails when the dependency provider is unavailable on the active platform', async () => {
    const harness = createHarness('tools-dependencies/platform-mismatch/config.yaml');
    await harness.clean();
    const result = await harness.generate();
    expect(result.exitCode).toBe(1);
    const combinedOutput = `${result.stdout}${result.stderr}`;
    expect(combinedOutput).toContain('Missing dependency: tool "dependency-platform-consumer" requires binary');
    expect(combinedOutput).toContain('platform-specific-binary');
    expect(combinedOutput).toContain('platform linux/x86_64');
  });
});
