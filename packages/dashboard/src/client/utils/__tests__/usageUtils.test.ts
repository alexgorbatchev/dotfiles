import { expect, test } from "bun:test";
import { formatRelativeTime, getLastUsedAt, parseUsageTimestamp } from "../usageUtils";

test.each([
  { value: null, expected: null },
  { value: "invalid", expected: null },
  { value: "1970-01-01T00:00:00Z", expected: 0 },
])("parses recorded timestamps without inventing a date: $value", ({ value, expected }) => {
  expect(parseUsageTimestamp(value)).toBe(expected);
});

test("takes the latest valid observation across binaries without requiring counts", () => {
  expect(getLastUsedAt({ totalCount: 99, binaries: [] })).toBeNull();
  expect(
    getLastUsedAt({
      totalCount: 0,
      binaries: [
        { binaryName: "unknown", count: 0, lastUsedAt: null },
        { binaryName: "invalid", count: 0, lastUsedAt: "invalid" },
        { binaryName: "newer", count: 0, lastUsedAt: "2026-11-14T00:00:00Z" },
        { binaryName: "older", count: 0, lastUsedAt: "2026-01-01T00:00:00Z" },
      ],
    }),
  ).toBe(Date.parse("2026-11-14T00:00:00Z"));
});

test.each([
  { age: 10_000, expected: "just now" },
  { age: 60_000, expected: "1 minute ago" },
  { age: 120_000, expected: "2 minutes ago" },
  { age: 3_600_000, expected: "1 hour ago" },
  { age: 7_200_000, expected: "2 hours ago" },
  { age: 86_400_000, expected: "1 day ago" },
  { age: 172_800_000, expected: "2 days ago" },
  { age: 2_592_000_000, expected: "1 month ago" },
  { age: 5_184_000_000, expected: "2 months ago" },
])("formats recency at $age milliseconds", ({ age, expected }) => {
  const now = Date.parse("2026-11-15T12:00:00Z");
  expect(formatRelativeTime(now - age, now)).toBe(expected);
});
