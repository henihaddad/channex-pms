import { describe, expect, it } from "vitest";
import { runChaos } from "./runner.js";
import { STORM } from "./plans.js";

describe("chaos: no booking lost, no cell permanently wrong", () => {
  it("holds across seeded fault storms", async () => {
    const failures: string[] = [];
    for (let seed = 1; seed <= 40; seed++) {
      const r = await runChaos({ seed, faults: STORM, steps: 50 });
      if (!r.ok) failures.push(`seed ${String(seed)}: ${r.failures.join("; ")}`);
    }
    expect(failures).toEqual([]);
  }, 120_000);

  it("holds with a quiet provider too", async () => {
    const r = await runChaos({ seed: 99, faults: [], steps: 40 });
    expect(r.ok).toBe(true);
    expect(r.emitted).toBeGreaterThan(0);
    expect(r.acked).toBeGreaterThanOrEqual(r.emitted);
  });
});
