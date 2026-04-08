import { minimatch } from "minimatch";

export type AssetPattern = string | RegExp;

function isValidRegexFlags(flags: string): boolean {
  return /^[dgimsuvy]*$/.test(flags);
}

function isRegexPatternString(value: string): boolean {
  if (!value.startsWith("/")) {
    return false;
  }

  const lastSlashIndex = value.lastIndexOf("/");
  if (lastSlashIndex <= 0) {
    return false;
  }

  return true;
}

function parseRegexPatternString(value: string): RegExp {
  const lastSlashIndex = value.lastIndexOf("/");
  if (lastSlashIndex <= 0) {
    throw new Error('Invalid regex string: missing closing "/"');
  }

  const pattern = value.slice(1, lastSlashIndex);
  const flags = value.slice(lastSlashIndex + 1);

  if (!isValidRegexFlags(flags)) {
    throw new Error("Invalid regex string: invalid flags");
  }

  const regex = new RegExp(pattern, flags);
  return regex;
}

export function isValidAssetPatternString(value: string): boolean {
  if (!isRegexPatternString(value)) {
    return true;
  }

  try {
    parseRegexPatternString(value);
    return true;
  } catch {
    return false;
  }
}

export function formatAssetPatternForLog(assetPattern: AssetPattern): string {
  if (typeof assetPattern === "string") {
    return assetPattern;
  }

  return assetPattern.toString();
}

export function matchAssetPattern(candidate: string, assetPattern: AssetPattern): boolean {
  if (typeof assetPattern === "string") {
    if (isRegexPatternString(assetPattern)) {
      const regex = parseRegexPatternString(assetPattern);
      return regex.test(candidate);
    }

    return minimatch(candidate, assetPattern);
  }

  return assetPattern.test(candidate);
}
