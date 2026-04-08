import { describe, expect, it } from 'bun:test';
import { shellCompletionConfigSchema } from '../shellCompletionConfigSchema';

describe('shellCompletionConfigSchema', () => {
  it('accepts direct file URLs without source', () => {
    const result = shellCompletionConfigSchema.parse({
      url: 'https://raw.githubusercontent.com/oven-sh/bun/main/completions/bun.zsh',
    });

    expect(result).toEqual({
      url: 'https://raw.githubusercontent.com/oven-sh/bun/main/completions/bun.zsh',
    });
  });

  it('rejects cmd combined with url', () => {
    const parseConfig = () =>
      shellCompletionConfigSchema.parse({
        cmd: 'bun completion zsh',
        url: 'https://raw.githubusercontent.com/oven-sh/bun/main/completions/bun.zsh',
      });

    expect(parseConfig).toThrow(
      "Invalid completion config: use 'source' alone, 'cmd' alone, 'url' alone, or 'url' with 'source'. Cannot combine 'cmd' with 'url' or 'source'.",
    );
  });
});
