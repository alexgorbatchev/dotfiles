import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { ProxyCacheStore } from "../ProxyCacheStore";

describe("ProxyCacheStore", () => {
  let cacheDir: string;
  let store: ProxyCacheStore;

  beforeEach(() => {
    cacheDir = join(tmpdir(), `http-proxy-test-${Date.now()}`);
    mkdirSync(cacheDir, { recursive: true });
    store = new ProxyCacheStore(cacheDir, 60000); // 1 minute TTL
  });

  afterEach(() => {
    rmSync(cacheDir, { recursive: true, force: true });
  });

  describe("generateKey", () => {
    test("generates consistent keys for same method and URL", () => {
      const key1 = store.generateKey("GET", "https://api.example.com/data");
      const key2 = store.generateKey("GET", "https://api.example.com/data");
      expect(key1).toBe(key2);
    });

    test("generates different keys for different methods", () => {
      const key1 = store.generateKey("GET", "https://api.example.com/data");
      const key2 = store.generateKey("POST", "https://api.example.com/data");
      expect(key1).not.toBe(key2);
    });

    test("generates different keys for different URLs", () => {
      const key1 = store.generateKey("GET", "https://api.example.com/data1");
      const key2 = store.generateKey("GET", "https://api.example.com/data2");
      expect(key1).not.toBe(key2);
    });

    test("normalizes method to uppercase", () => {
      const key1 = store.generateKey("get", "https://api.example.com/data");
      const key2 = store.generateKey("GET", "https://api.example.com/data");
      expect(key1).toBe(key2);
    });
  });

  describe("set and get", () => {
    test("stores and retrieves cache entry", () => {
      const url = "https://api.example.com/data";
      const body = Buffer.from('{"foo":"bar"}');
      const headers = { "content-type": "application/json" };

      store.set("GET", url, 200, headers, body);
      const entry = store.get("GET", url);

      expect(entry).toBeDefined();
      expect(entry!.url).toBe(url);
      expect(entry!.method).toBe("GET");
      expect(entry!.status).toBe(200);
      expect(entry!.headers).toEqual(headers);
      expect(entry!.body.toString()).toBe('{"foo":"bar"}');
    });

    test("returns undefined for non-existent entry", () => {
      const entry = store.get("GET", "https://api.example.com/nonexistent");
      expect(entry).toBeUndefined();
    });

    test("handles binary data correctly", () => {
      const url = "https://api.example.com/binary";
      const body = Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe]);

      store.set("GET", url, 200, {}, body);
      const entry = store.get("GET", url);

      expect(entry).toBeDefined();
      expect(entry!.body).toEqual(body);
    });
  });

  describe("expiration", () => {
    test("returns undefined for expired entry", async () => {
      const shortTtlStore = new ProxyCacheStore(cacheDir, 50); // 50ms TTL
      const url = "https://api.example.com/expires";
      const body = Buffer.from("test");

      shortTtlStore.set("GET", url, 200, {}, body);

      // Entry should exist immediately
      expect(shortTtlStore.get("GET", url)).toBeDefined();

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Entry should be expired
      expect(shortTtlStore.get("GET", url)).toBeUndefined();
    });
  });

  describe("delete", () => {
    test("deletes existing entry", () => {
      const url = "https://api.example.com/delete-me";
      store.set("GET", url, 200, {}, Buffer.from("test"));

      expect(store.get("GET", url)).toBeDefined();

      const deleted = store.delete("GET", url);
      expect(deleted).toBe(true);
      expect(store.get("GET", url)).toBeUndefined();
    });

    test("returns false for non-existent entry", () => {
      const deleted = store.delete("GET", "https://api.example.com/nonexistent");
      expect(deleted).toBe(false);
    });
  });

  describe("getAllEntries", () => {
    test("returns all cached entries", () => {
      store.set("GET", "https://api.example.com/a", 200, {}, Buffer.from("a"));
      store.set("GET", "https://api.example.com/b", 200, {}, Buffer.from("b"));
      store.set("POST", "https://api.example.com/c", 200, {}, Buffer.from("c"));

      const entries = store.getAllEntries();
      expect(entries.length).toBe(3);

      const urls = entries.map((e) => e.url).toSorted();
      expect(urls).toEqual(["https://api.example.com/a", "https://api.example.com/b", "https://api.example.com/c"]);
    });

    test("returns empty array when cache is empty", () => {
      const entries = store.getAllEntries();
      expect(entries).toEqual([]);
    });
  });

  describe("clear", () => {
    test("clears all entries", () => {
      store.set("GET", "https://api.example.com/a", 200, {}, Buffer.from("a"));
      store.set("GET", "https://api.example.com/b", 200, {}, Buffer.from("b"));

      const cleared = store.clear();
      expect(cleared).toBe(2);
      expect(store.getAllEntries()).toEqual([]);
    });

    test("returns 0 when cache is empty", () => {
      const cleared = store.clear();
      expect(cleared).toBe(0);
    });
  });

  describe("getStats", () => {
    test("returns correct statistics", () => {
      store.set("GET", "https://api.example.com/a", 200, {}, Buffer.from("aaaa"));
      store.set("GET", "https://api.example.com/b", 200, {}, Buffer.from("bbbb"));

      const stats = store.getStats();
      expect(stats.entries).toBe(2);
      expect(stats.size).toBeGreaterThan(0);
    });

    test("returns zero for empty cache", () => {
      const stats = store.getStats();
      expect(stats.entries).toBe(0);
      expect(stats.size).toBe(0);
    });
  });

  describe("error handling", () => {
    test("handles corrupted cache file gracefully", () => {
      const url = "https://api.example.com/corrupted";
      const key = store.generateKey("GET", url);
      const subdir = join(cacheDir, key.slice(0, 2));
      mkdirSync(subdir, { recursive: true });

      // Write invalid JSON
      writeFileSync(join(subdir, `${key}.json`), "not valid json");

      // Should return undefined and delete the corrupted file
      const entry = store.get("GET", url);
      expect(entry).toBeUndefined();
    });
  });
});
