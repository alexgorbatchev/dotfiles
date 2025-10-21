import { describe, expect, test } from 'bun:test';
import { HttpCache } from '@modules/http/cache/HttpCache';

describe('HttpCache', () => {
  describe('basic operations', () => {
    test('returns cached value before expiration', async () => {
      let currentTime = 0;
      const cache = new HttpCache({ now: () => currentTime });
      await cache.set('key', 'value', 1000);

      currentTime = 500;
      const result = await cache.get<string>('key');
      expect(result).toBe('value');
    });

    test('evicts entries after ttl', async () => {
      let currentTime = 0;
      const cache = new HttpCache({ now: () => currentTime });
      await cache.set('key', 'value', 1000);

      currentTime = 1500;
      const result = await cache.get<string>('key');
      expect(result).toBeUndefined();
    });

    test('clear removes all entries', async () => {
      const cache = new HttpCache();
      await cache.set('alpha', 1, 1000);
      await cache.set('beta', 2, 1000);

      await cache.clear();

      const alpha = await cache.get<number>('alpha');
      const beta = await cache.get<number>('beta');

      expect(alpha).toBeUndefined();
      expect(beta).toBeUndefined();
    });
  });

  describe('key isolation', () => {
    test('different keys store different values', async () => {
      const cache = new HttpCache();
      await cache.set('namespace1:key', 'value1', 5000);
      await cache.set('namespace2:key', 'value2', 5000);

      const result1 = await cache.get<string>('namespace1:key');
      const result2 = await cache.get<string>('namespace2:key');

      expect(result1).toBe('value1');
      expect(result2).toBe('value2');
    });

    test('similar keys remain distinct', async () => {
      const cache = new HttpCache();
      await cache.set('key', 'value', 5000);
      await cache.set('key2', 'value2', 5000);
      await cache.set('key-test', 'value-test', 5000);

      const result1 = await cache.get<string>('key');
      const result2 = await cache.get<string>('key2');
      const result3 = await cache.get<string>('key-test');

      expect(result1).toBe('value');
      expect(result2).toBe('value2');
      expect(result3).toBe('value-test');
    });

    test('deleting one key does not affect others', async () => {
      const cache = new HttpCache();
      await cache.set('key1', 'value1', 5000);
      await cache.set('key2', 'value2', 5000);
      await cache.set('key3', 'value3', 5000);

      await cache.delete('key2');

      expect(await cache.get<string>('key1')).toBe('value1');
      expect(await cache.get<string>('key2')).toBeUndefined();
      expect(await cache.get<string>('key3')).toBe('value3');
    });
  });

  describe('multiple entries management', () => {
    test('stores and retrieves multiple entries independently', async () => {
      const cache = new HttpCache();
      const entries = [
        { key: 'entry1', value: 'data1', ttl: 10000 },
        { key: 'entry2', value: 'data2', ttl: 20000 },
        { key: 'entry3', value: 'data3', ttl: 30000 },
        { key: 'entry4', value: 'data4', ttl: 40000 },
      ];

      for (const entry of entries) {
        await cache.set(entry.key, entry.value, entry.ttl);
      }

      for (const entry of entries) {
        const result = await cache.get<string>(entry.key);
        expect(result).toBe(entry.value);
      }
    });

    test('handles different expiration times for multiple entries', async () => {
      let currentTime = 0;
      const cache = new HttpCache({ now: () => currentTime });

      await cache.set('short', 'value1', 1000);
      await cache.set('medium', 'value2', 5000);
      await cache.set('long', 'value3', 10000);

      currentTime = 2000;
      expect(await cache.get<string>('short')).toBeUndefined();
      expect(await cache.get<string>('medium')).toBe('value2');
      expect(await cache.get<string>('long')).toBe('value3');

      currentTime = 6000;
      expect(await cache.get<string>('short')).toBeUndefined();
      expect(await cache.get<string>('medium')).toBeUndefined();
      expect(await cache.get<string>('long')).toBe('value3');
    });

    test('updates existing key with new value and ttl', async () => {
      let currentTime = 0;
      const cache = new HttpCache({ now: () => currentTime });

      await cache.set('key', 'original', 5000);
      currentTime = 1000;
      await cache.set('key', 'updated', 10000);

      currentTime = 6000;
      const result = await cache.get<string>('key');
      expect(result).toBe('updated');

      currentTime = 12000;
      const expired = await cache.get<string>('key');
      expect(expired).toBeUndefined();
    });
  });

  describe('edge cases', () => {
    test('returns undefined for non-existent key', async () => {
      const cache = new HttpCache();
      const result = await cache.get<string>('nonexistent');
      expect(result).toBeUndefined();
    });

    test('handles zero TTL as no expiration', async () => {
      let currentTime = 0;
      const cache = new HttpCache({ now: () => currentTime });

      await cache.set('key', 'value', 0);

      currentTime = 999999;
      const result = await cache.get<string>('key');
      expect(result).toBe('value');
    });

    test('handles negative TTL as no expiration', async () => {
      let currentTime = 0;
      const cache = new HttpCache({ now: () => currentTime });

      await cache.set('key', 'value', -1000);

      currentTime = 999999;
      const result = await cache.get<string>('key');
      expect(result).toBe('value');
    });

    test('handles different value types', async () => {
      const cache = new HttpCache();

      await cache.set('string', 'text', 5000);
      await cache.set('number', 42, 5000);
      await cache.set('boolean', true, 5000);
      await cache.set('object', { nested: 'value' }, 5000);
      await cache.set('array', [1, 2, 3], 5000);
      await cache.set('null', null, 5000);

      expect(await cache.get<string>('string')).toBe('text');
      expect(await cache.get<number>('number')).toBe(42);
      expect(await cache.get<boolean>('boolean')).toBe(true);
      expect(await cache.get<{ nested: string }>('object')).toEqual({ nested: 'value' });
      expect(await cache.get<number[]>('array')).toEqual([1, 2, 3]);
      expect(await cache.get<null>('null')).toBeNull();
    });

    test('deletes non-existent key without error', async () => {
      const cache = new HttpCache();
      await cache.delete('nonexistent');
      expect(await cache.get<string>('nonexistent')).toBeUndefined();
    });

    test('handles empty string key', async () => {
      const cache = new HttpCache();
      await cache.set('', 'empty-key-value', 5000);
      const result = await cache.get<string>('');
      expect(result).toBe('empty-key-value');
    });
  });

  describe('concurrent access patterns', () => {
    test('handles parallel sets and gets', async () => {
      const cache = new HttpCache();

      const operations = Array.from({ length: 10 }, (_, i) => cache.set(`key${i}`, `value${i}`, 5000));

      await Promise.all(operations);

      const results = await Promise.all(Array.from({ length: 10 }, (_, i) => cache.get<string>(`key${i}`)));

      results.forEach((result, i) => {
        expect(result).toBe(`value${i}`);
      });
    });

    test('handles concurrent updates to same key', async () => {
      const cache = new HttpCache();

      await Promise.all([
        cache.set('key', 'value1', 5000),
        cache.set('key', 'value2', 5000),
        cache.set('key', 'value3', 5000),
      ]);

      const result = await cache.get<string>('key');
      expect(result).toBeDefined();
      expect(['value1', 'value2', 'value3']).toContain(result as string);
    });

    test('handles concurrent delete and get operations', async () => {
      const cache = new HttpCache();
      await cache.set('key', 'value', 5000);

      await Promise.all([cache.delete('key'), cache.get<string>('key')]);

      const result = await cache.get<string>('key');
      expect(result).toBeUndefined();
    });

    test('handles clear during active operations', async () => {
      const cache = new HttpCache();
      await cache.set('key1', 'value1', 5000);
      await cache.set('key2', 'value2', 5000);

      await Promise.all([cache.clear(), cache.get<string>('key1'), cache.get<string>('key2')]);

      expect(await cache.get<string>('key1')).toBeUndefined();
      expect(await cache.get<string>('key2')).toBeUndefined();
    });
  });
});
