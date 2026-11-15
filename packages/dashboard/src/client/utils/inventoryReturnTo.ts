/** Only an inventory path and query may be used as a contextual return target. */
export function inventoryReturnTo(search: string): string {
  const target = new URLSearchParams(search).get("returnTo");
  if (!target || [...target].some((character) => character.charCodeAt(0) <= 32)) return "/";
  return /^\/(?:\?[^#\\]*)?$/.test(target) ? target : "/";
}
