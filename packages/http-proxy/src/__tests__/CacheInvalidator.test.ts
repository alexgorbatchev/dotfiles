import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import { CacheInvalidator } from '../CacheInvalidator';
import { ProxyCacheStore } from '../ProxyCacheStore';

describe('CacheInvalidator', () => {
  let cacheDir: string;
  let store: ProxyCacheStore;
  let invalidator: CacheInvalidator;

  beforeEach(() => {
    cacheDir = join(tmpdir(), `http-proxy-invalidator-test-${Date.now()}`);
    mkdirSync(cacheDir, { recursive: true });
    store = new ProxyCacheStore(cacheDir, 60000);
    invalidator = new CacheInvalidator(store);
  });

  afterEach(() => {
    rmSync(cacheDir, { recursive: true, force: true });
  });

  describe('clear with no patterns', () => {
    test('clears all entries when patterns array is empty', () => {
      store.set('GET', 'https://api.github.com/repos/a', 200, {}, Buffer.from('a'));
      store.set('GET', 'https://api.github.com/repos/b', 200, {}, Buffer.from('b'));
      store.set('GET', 'https://api.example.com/data', 200, {}, Buffer.from('c'));

      const result = invalidator.clear([]);

      expect(result.cleared).toBe(3);
      expect(store.getAllEntries()).toEqual([]);
    });

    test('clears all entries when pattern is single "*"', () => {
      store.set('GET', 'https://api.github.com/repos/a', 200, {}, Buffer.from('a'));
      store.set('GET', 'https://api.github.com/repos/b', 200, {}, Buffer.from('b'));
      store.set('GET', 'https://api.example.com/data', 200, {}, Buffer.from('c'));

      const result = invalidator.clear(['*']);

      expect(result.cleared).toBe(3);
      expect(store.getAllEntries()).toEqual([]);
    });
  });

  describe('clear with patterns', () => {
    test('clears entries matching single pattern', () => {
      store.set('GET', 'https://api.github.com/repos/a', 200, {}, Buffer.from('a'));
      store.set('GET', 'https://api.github.com/repos/b', 200, {}, Buffer.from('b'));
      store.set('GET', 'https://api.example.com/data', 200, {}, Buffer.from('c'));

      const result = invalidator.clear(['**/github.com/**']);

      expect(result.cleared).toBe(2);
      expect(store.getAllEntries().length).toBe(1);
      expect(store.getAllEntries()[0]!.url).toBe('https://api.example.com/data');
    });

    test('clears entries matching multiple patterns', () => {
      store.set('GET', 'https://api.github.com/repos/a', 200, {}, Buffer.from('a'));
      store.set('GET', 'https://api.example.com/data', 200, {}, Buffer.from('b'));
      store.set('GET', 'https://api.other.com/info', 200, {}, Buffer.from('c'));

      const result = invalidator.clear(['**/github.com/**', '**/example.com/**']);

      expect(result.cleared).toBe(2);
      expect(store.getAllEntries().length).toBe(1);
      expect(store.getAllEntries()[0]!.url).toBe('https://api.other.com/info');
    });

    test('handles exact URL match', () => {
      store.set('GET', 'https://api.github.com/repos/owner/repo', 200, {}, Buffer.from('a'));
      store.set('GET', 'https://api.github.com/users/user', 200, {}, Buffer.from('b'));

      const result = invalidator.clear(['https://api.github.com/repos/owner/repo']);

      expect(result.cleared).toBe(1);
      expect(store.getAllEntries().length).toBe(1);
    });

    test('matches partial paths with glob', () => {
      store.set('GET', 'https://api.github.com/repos/owner/repo', 200, {}, Buffer.from('a'));
      store.set('GET', 'https://api.github.com/repos/owner/other', 200, {}, Buffer.from('b'));
      store.set('GET', 'https://api.github.com/users/user', 200, {}, Buffer.from('c'));

      const result = invalidator.clear(['**/repos/**']);

      expect(result.cleared).toBe(2);
      expect(store.getAllEntries().length).toBe(1);
    });

    test('supports method:url pattern matching', () => {
      store.set('GET', 'https://api.example.com/data', 200, {}, Buffer.from('a'));
      store.set('POST', 'https://api.example.com/data', 200, {}, Buffer.from('b'));

      const result = invalidator.clear(['GET:**/example.com/**']);

      expect(result.cleared).toBe(1);
      const remaining = store.getAllEntries();
      expect(remaining.length).toBe(1);
      expect(remaining[0]!.method).toBe('POST');
    });

    test('returns 0 cleared when no matches', () => {
      store.set('GET', 'https://api.github.com/repos/a', 200, {}, Buffer.from('a'));

      const result = invalidator.clear(['**/nonexistent/**']);

      expect(result.cleared).toBe(0);
      expect(store.getAllEntries().length).toBe(1);
    });

    test('handles empty cache gracefully', () => {
      const result = invalidator.clear(['**/anything/**']);

      expect(result.cleared).toBe(0);
      expect(result.message).toContain('0');
    });
  });

  describe('glob pattern edge cases', () => {
    test('matches URLs with query strings', () => {
      store.set('GET', 'https://api.example.com/search?q=test', 200, {}, Buffer.from('a'));
      store.set('GET', 'https://api.example.com/search?q=other', 200, {}, Buffer.from('b'));

      const result = invalidator.clear(['**/search?q=test']);

      expect(result.cleared).toBe(1);
    });

    test('handles special characters in URLs', () => {
      store.set('GET', 'https://api.example.com/path/with%20spaces', 200, {}, Buffer.from('a'));

      const result = invalidator.clear(['**with%20spaces**']);

      expect(result.cleared).toBe(1);
    });

    test('does not match partial domain names', () => {
      store.set('GET', 'https://api.github.com/repos', 200, {}, Buffer.from('a'));
      store.set('GET', 'https://api.notgithub.com/repos', 200, {}, Buffer.from('b'));

      // Should only match github.com, not notgithub.com
      const result = invalidator.clear(['**/github.com/**']);

      expect(result.cleared).toBe(1);
      expect(store.getAllEntries().length).toBe(1);
    });
  });
});
