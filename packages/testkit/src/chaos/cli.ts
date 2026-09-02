import { runChaos } from "./runner.js";
import { STORM } from "./plans.js";

const runs = Number(process.argv[2] ?? 100);
const steps = Number(process.argv[3] ?? 60);
let failed = 0;
for (let seed = 1; seed <= runs; seed++) {
  const r = await runChaos({ seed, faults: STORM, steps });
  if (!r.ok) {
    failed += 1;
    console.error(`seed ${String(seed)}: ${r.failures.join("; ")}`);
  }
}
console.log(
  `chaos: ${String(runs - failed)}/${String(runs)} scenarios green (${String(steps)} steps each)`,
);
process.exit(failed ? 1 : 0);
