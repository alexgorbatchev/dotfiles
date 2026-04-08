import { TestLogger } from '@dotfiles/logger';
import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import { setupServices } from '../cli';

describe('setupServices DEV_PROXY validation', () => {
  const originalDevProxy = process.env['DEV_PROXY'];

  afterEach(() => {
    if (typeof originalDevProxy === 'string') {
      process.env['DEV_PROXY'] = originalDevProxy;
      return;
    }

    delete process.env['DEV_PROXY'];
  });

  it('fails fast when DEV_PROXY is invalid', async () => {
    process.env['DEV_PROXY'] = 'abc';

    const exitSpy = spyOn(process, 'exit').mockImplementation(
      ((code?: number) => {
        throw new Error(`EXIT:${code}`);
      }) as typeof process.exit,
    );

    try {
      const logger = new TestLogger({ name: 'test' });

      await expect(
        setupServices(logger, {
          config: 'test-project/dotfiles.config.ts',
          dryRun: false,
          log: 'info',
          verbose: false,
          quiet: false,
          trace: false,
          cwd: process.cwd(),
          env: process.env,
        }),
      ).rejects.toThrow('EXIT:1');

      expect(exitSpy).toHaveBeenCalledWith(1);
      logger.expect(
        ['ERROR'],
        ['test', 'setupServices'],
        [],
        ['Invalid DEV_PROXY: "abc" (expected an integer between 1 and 65535)'],
      );
    } finally {
      exitSpy.mockRestore();
    }
  });
});
