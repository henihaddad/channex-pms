/** Explicit migration job (spec 14 §14.7): never run on boot. */
import { connect } from "../src/client.js";

const handle = await connect();
console.log(`db: migrating (${handle.driver})`);
await handle.migrate();
await handle.close();
console.log("db: migrations applied");
