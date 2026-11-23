import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { checklistItemsFrom, parseUnitChoice } from "./checklist";

describe("checklistItemsFrom", () => {
  it("keeps the keys English checklists always had", () => {
    expect(
      checklistItemsFrom("Beds made*\nBathroom cleaned*\nBins emptied\nKeys in lockbox"),
    ).toEqual([
      { key: "beds_made", label: "Beds made", requiresPhoto: true },
      { key: "bathroom_cleaned", label: "Bathroom cleaned", requiresPhoto: true },
      { key: "bins_emptied", label: "Bins emptied", requiresPhoto: false },
      { key: "keys_in_lockbox", label: "Keys in lockbox", requiresPhoto: false },
    ]);
  });

  it("makes keys from French and Arabic labels instead of collapsing them to one", () => {
    const fr = checklistItemsFrom("Lits faits*\nSalle de bain nettoyée");
    expect(fr.map((i) => i.key)).toEqual(["lits_faits", "salle_de_bain_nettoyée"]);
    const ar = checklistItemsFrom("ترتيب الأسرّة*\nتنظيف الحمّام");
    expect(new Set(ar.map((i) => i.key)).size).toBe(2);
    expect(ar[0]!.requiresPhoto).toBe(true);
  });

  it("falls back to the position for empty or repeated keys", () => {
    expect(checklistItemsFrom("***\nSoap\nsoap").map((i) => i.key)).toEqual([
      "item_1",
      "soap",
      "item_3",
    ]);
  });

  it("never gives two items the same key", () => {
    fc.assert(
      fc.property(fc.array(fc.string({ maxLength: 12 }), { maxLength: 20 }), (lines) => {
        const keys = checklistItemsFrom(lines.join("\n")).map((i) => i.key);
        expect(new Set(keys).size).toBe(keys.length);
        expect(keys.every((k) => k.length > 0)).toBe(true);
      }),
    );
  });
});

describe("parseUnitChoice", () => {
  it("splits the picker's value and pads what is missing", () => {
    expect(parseUnitChoice("p1:rt1:u1", 3)).toEqual(["p1", "rt1", "u1"]);
    expect(parseUnitChoice("p1:u1", 2)).toEqual(["p1", "u1"]);
    expect(parseUnitChoice("", 3)).toEqual(["", "", ""]);
  });
});
