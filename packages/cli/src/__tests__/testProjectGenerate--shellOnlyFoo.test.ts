import { describe, expect, test } from 'bun:test';
import assert from 'node:assert';
import { access, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { $ } from 'bun';

function getRepoRootPath(): string {
  const repoRootPath: string = path.resolve(__dirname, '../../../..');
  return repoRootPath;
}

describe('test-project generate', () => {
  test('includes shell-only foo output in main.zsh', async () => {
    const repoRootPath = getRepoRootPath();
    const generatedDirPath: string = path.join(repoRootPath, 'test-project', '.generated');

    await rm(generatedDirPath, { recursive: true, force: true });

    const result = await $`bun run --silent cli --config test-project/config.ts --quiet generate`
      .cwd(repoRootPath)
      .quiet()
      .nothrow();

    expect(result.exitCode).toBe(0);

    const mainZshPath: string = path.join(repoRootPath, 'test-project', '.generated', 'shell-scripts', 'main.zsh');
    const content = await readFile(mainZshPath, 'utf8');

    assert(content.length > 0);
    expect(content).toContain('This is foo tool');

    const userBinShimPath: string = path.join(
      repoRootPath,
      'test-project',
      '.generated',
      'user-bin',
      'shell-only--foo'
    );
    const hasUserBinShim = await access(userBinShimPath)
      .then(() => true)
      .catch(() => false);
    expect(hasUserBinShim).toBe(false);
  });
});
