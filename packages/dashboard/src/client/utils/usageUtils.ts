import type { IToolUsageSummary } from "../../shared/types";

export function parseUsageTimestamp(value: string | null): number | null {
  if (value === null) return null;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : timestamp;
}

export function getLastUsedAt(usage: IToolUsageSummary): number | null {
  return usage.binaries.reduce<number | null>((latest, entry) => {
    const timestamp = parseUsageTimestamp(entry.lastUsedAt);
    if (timestamp === null) return latest;
    return latest === null ? timestamp : Math.max(latest, timestamp);
  }, null);
}

export function formatRelativeTime(timestamp: number, now: number): string {
  const diff = now - timestamp;

  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) {
    return "just now";
  }

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  }

  const days = Math.floor(hours / 24);
  if (days < 30) {
    return `${days} day${days === 1 ? "" : "s"} ago`;
  }

  const months = Math.floor(days / 30);
  return `${months} month${months === 1 ? "" : "s"} ago`;
}
