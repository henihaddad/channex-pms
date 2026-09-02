import { connect } from "@pms/db";
import { seedDemo, DEMO_PASSWORD } from "./demo.js";

const handle = await connect();
if (handle.driver === "pglite") await handle.migrate();
const seed = await seedDemo(handle.db);
console.log(
  JSON.stringify(
    {
      password: DEMO_PASSWORD,
      orgA: seed.orgA.slug,
      orgB: seed.orgB.slug,
      users: Object.values(seed.orgA.users).map((u) => u.email),
    },
    null,
    2,
  ),
);
await handle.close();
