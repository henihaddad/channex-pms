import { describe, expect, it } from "vitest";
import {
  INTEGRATIONS,
  INTEGRATION_GROUPS,
  integrationsByGroup,
  integrationState,
} from "./integrations.js";

describe("the integrations directory (spec 12 §12.7b)", () => {
  it("has unique keys and puts every entry in exactly one group", () => {
    const keys = INTEGRATIONS.map((i) => i.key);
    expect(new Set(keys).size).toBe(keys.length);
    const grouped = INTEGRATION_GROUPS.flatMap((g) => integrationsByGroup()[g].map((i) => i.key));
    expect(grouped.sort()).toEqual([...keys].sort());
  });

  it("never calls a planned connection connected, nor one missing its key", () => {
    expect(integrationState({ status: "planned" }, { configured: true, inUse: true })).toBe(
      "planned",
    );
    expect(integrationState({ status: "built", configurable: true }, { configured: false })).toBe(
      "available",
    );
    expect(integrationState({ status: "built", configurable: true }, { configured: true })).toBe(
      "connected",
    );
    expect(integrationState({ status: "built" }, { inUse: false })).toBe("available");
    expect(integrationState({ status: "built" }, {})).toBe("connected");
    // an interface with only the stand-in behind it is something to set up, not a connection
    expect(integrationState({ status: "port" }, { inUse: true })).toBe("available");
    expect(integrationState({ status: "partial" }, { inUse: true })).toBe("connected");
  });
});
