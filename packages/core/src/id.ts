let globalIdCounter = 0;

/**
 * Resets the internal ID counter to a specified starting value.
 * Useful for deterministic unit testing.
 */
export function resetIdCounter(start = 0): void {
  globalIdCounter = start;
}

/**
 * Generates a unique, deterministic kebab-case identifier.
 *
 * @param prefix - Optional prefix for the ID (defaults to "id").
 * @param seed - Optional explicit seed or index for determinism.
 * @returns A kebab-case identifier string.
 */
export function newId(prefix = "id", seed?: number | string): string {
  const cleanPrefix =
    prefix
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "id";

  if (seed !== undefined) {
    const cleanSeed =
      String(seed)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || "0";
    return `${cleanPrefix}-${cleanSeed}`;
  }

  globalIdCounter += 1;
  return `${cleanPrefix}-${globalIdCounter}`;
}
