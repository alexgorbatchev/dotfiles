const ANDROID_VARIANT_PATTERN = /(^|[^a-z0-9])android([^a-z0-9]|$)/i;

export function isAndroidTargetedLinuxAsset(assetName: string): boolean {
  return ANDROID_VARIANT_PATTERN.test(assetName);
}
