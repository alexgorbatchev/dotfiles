import { describe, expect, test } from 'bun:test';
import { resolveValue } from '../resolveValue';

interface Ctx {
  id: string;
  n: number;
}

describe('resolveValue', () => {
  describe('static values', () => {
    test('string', async () => expect(await resolveValue({ id: '1', n: 2 }, 'hello')).toBe('hello'));
    test('number', async () => expect(await resolveValue({ id: '1', n: 2 }, 42)).toBe(42));
    test('boolean', async () => expect(await resolveValue({ id: '1', n: 2 }, true)).toBe(true));
    test('null', async () => expect(await resolveValue({ id: '1', n: 2 }, null)).toBe(null));
    test('undefined', async () => expect(await resolveValue({ id: '1', n: 2 }, undefined)).toBe(undefined));
    test('object', async () => expect(await resolveValue({ id: '1', n: 2 }, { a: 1 })).toEqual({ a: 1 }));
    test('array', async () => expect(await resolveValue({ id: '1', n: 2 }, ['a', 'b'])).toEqual(['a', 'b']));
  });

  describe('sync functions', () => {
    test('string', async () =>
      expect(await resolveValue({ id: '123', n: 2 }, (p: Ctx) => `id-${p.id}`)).toBe('id-123'));
    test('number', async () => expect(await resolveValue({ id: '1', n: 5 }, (p: Ctx) => p.n * 10)).toBe(50));
    test('object', async () =>
      expect(await resolveValue({ id: 'abc', n: 1 }, (p: Ctx) => ({ x: p.id }))).toEqual({ x: 'abc' }));
    test('array', async () =>
      expect(await resolveValue({ id: 'x', n: 3 }, (p: Ctx) => Array(p.n).fill(p.id))).toEqual(['x', 'x', 'x']));
  });

  describe('async functions', () => {
    test('string', async () =>
      expect(await resolveValue({ id: '456', n: 2 }, async (p: Ctx) => `async-${p.id}`)).toBe('async-456'));
    test('number', async () => expect(await resolveValue({ id: '1', n: 7 }, async (p: Ctx) => p.n * 100)).toBe(700));
    test('delayed', async () =>
      expect(
        await resolveValue({ id: 'test', n: 1 }, async (p: Ctx) => {
          await Bun.sleep(5);
          return `delayed-${p.id}`;
        }),
      ).toBe('delayed-test'));
    test('object', async () =>
      expect(await resolveValue({ id: 'item', n: 5 }, async (p: Ctx) => ({ items: [p.id], count: p.n }))).toEqual({
        items: ['item'],
        count: 5,
      }));
  });

  describe('edge cases', () => {
    test('empty params', async () => expect(await resolveValue({}, 'static')).toBe('static'));
    test('sync error', () =>
      expect(
        resolveValue({}, () => {
          throw new Error('sync');
        }),
      ).rejects.toThrow('sync'));
    test('async error', () =>
      expect(
        resolveValue({}, async () => {
          throw new Error('async');
        }),
      ).rejects.toThrow('async'));
  });
});
