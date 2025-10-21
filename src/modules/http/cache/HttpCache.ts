export interface HttpCacheOptions {
  now?: () => number;
}

interface CacheEntry<TValue> {
  value: TValue;
  expiresAt: number | null;
}

export class HttpCache {
  private readonly now: () => number;
  private readonly entries: Map<string, CacheEntry<unknown>> = new Map();

  constructor(options: HttpCacheOptions = {}) {
    this.now = options.now ?? (() => Date.now());
  }

  async get<TValue>(key: string): Promise<TValue | undefined> {
    const entry = this.entries.get(key);
    if (!entry) {
      return undefined;
    }

    if (entry.expiresAt !== null && entry.expiresAt <= this.now()) {
      this.entries.delete(key);
      return undefined;
    }

    return entry.value as TValue;
  }

  async set<TValue>(key: string, value: TValue, ttlMs: number): Promise<void> {
    const expiresAt = ttlMs > 0 ? this.now() + ttlMs : null;
    this.entries.set(key, { value, expiresAt });
  }

  async delete(key: string): Promise<void> {
    this.entries.delete(key);
  }

  async clear(): Promise<void> {
    this.entries.clear();
  }
}
