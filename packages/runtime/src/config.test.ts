import { describe, expect, it } from "vitest";
import { loadConfig } from "./config.js";

describe("PMS_STEP_UP", () => {
  it("keeps the password re-check on unless an install turns it off", () => {
    expect(loadConfig({}).PMS_STEP_UP).toBe("on");
    expect(loadConfig({ PMS_STEP_UP: "off" }).PMS_STEP_UP).toBe("off");
    expect(() => loadConfig({ PMS_STEP_UP: "no" })).toThrow(/PMS_STEP_UP/);
  });
});
