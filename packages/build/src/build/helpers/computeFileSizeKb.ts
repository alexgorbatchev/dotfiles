/**
 * Converts a byte size into rounded-up kilobytes.
 */
export function computeFileSizeKb(fileSizeBytes: number): number {
  if (fileSizeBytes === 0) {
    return 0;
  }

  const fileSizeKb: number = fileSizeBytes / 1024;
  const roundedKb: number = Math.ceil(fileSizeKb);
  return roundedKb;
}
