const ID_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";

/**
 * Generates unique short string identifiers for layers, assets, and clips in kebab-case format.
 *
 * @param prefix - Optional prefix for the identifier (e.g. 'layer', 'asset', 'clip').
 * @returns A unique kebab-case identifier (e.g. 'layer-3x9f8b2a' or '3x9f8b2a').
 */
export function newId(prefix?: string): string {
  let rand = "";
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.getRandomValues === "function"
  ) {
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    for (let i = 0; i < 8; i++) {
      const byte = bytes[i] ?? 0;
      rand += ID_CHARS[byte % ID_CHARS.length];
    }
  } else {
    for (let i = 0; i < 8; i++) {
      rand += ID_CHARS[Math.floor(Math.random() * ID_CHARS.length)];
    }
  }
  return prefix ? `${prefix}-${rand}` : rand;
}
