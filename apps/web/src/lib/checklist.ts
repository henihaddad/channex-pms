/**
 * A checklist typed one item per line (spec 08 §8.7), "*" at the end when a photo is required.
 * The key is the label in any script ("Lits faits" → lits_faits, "ترتيب الأسرّة" stays Arabic);
 * a key that comes out empty or twice falls back to the item's position, so no two items share
 * one and the cleaner's ticks never land on the wrong row.
 */
export function checklistItemsFrom(
  text: string,
): Array<{ key: string; label: string; requiresPhoto: boolean }> {
  const seen = new Set<string>();
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l, i) => {
      const requiresPhoto = l.endsWith("*");
      const label = l.replace(/\*$/, "").trim();
      const slug = label
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, "_")
        .replace(/^_+|_+$/g, "");
      let key = slug && !seen.has(slug) ? slug : `item_${String(i + 1)}`;
      for (let n = 2; seen.has(key); n++) key = `item_${String(i + 1)}_${String(n)}`;
      seen.add(key);
      return { key, label, requiresPhoto };
    });
}

/**
 * The unit picker of the block and issue forms sends "property:roomType:unit" (or
 * "property:unit"), so the action knows the unit's property for the permission scope.
 */
export function parseUnitChoice(value: string, parts: 2 | 3): string[] {
  const out = value.split(":");
  return Array.from({ length: parts }, (_, i) => out[i] ?? "");
}
