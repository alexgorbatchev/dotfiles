import { describe, expect, it } from 'bun:test';
import { yamlConfigSchema } from '@dotfiles/core';

/**
 * Tests focused on the new per-host configuration + cache behavior for network services.
 */
describe('config schema - host configuration', () => {
  it('should apply defaults for all hosts when omitted', () => {
    const parsed = yamlConfigSchema.parse({});

    expect(parsed.github.host).toBe('https://api.github.com');
    expect(parsed.github.cache.enabled).toBe(true);
    expect(parsed.cargo.cratesIo.host).toBe('https://crates.io');
    expect(parsed.cargo.githubRaw.host).toBe('https://raw.githubusercontent.com');
    expect(parsed.cargo.githubRelease.host).toBe('https://github.com');
  });

  it('should allow overriding a single host cache ttl without affecting others', () => {
    const parsed = yamlConfigSchema.parse({
      cargo: {
        cratesIo: { cache: { ttl: 123 } },
      },
    });

    expect(parsed.cargo.cratesIo.cache.ttl).toBe(123);
    // Ensure siblings kept their default
    expect(parsed.cargo.githubRaw.cache.ttl).toBe(86400000);
    expect(parsed.cargo.githubRelease.cache.ttl).toBe(86400000);
  });

  it('should reject deprecated cargo fields', () => {
    const result = yamlConfigSchema.safeParse({
      cargo: { cratesIoHost: 'https://example.com' },
    });
    expect(result.success).toBe(false);
  });
});
