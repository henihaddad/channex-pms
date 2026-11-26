import { AsyncLocalStorage } from "node:async_hooks";
import handler from "vinext/server/fetch-handler";
import { CF_CONTEXT, type CfContext } from "../src/server/cf-context";

/**
 * ADR-0013: the app Worker. vinext serves every route; each request's bindings and execution
 * context are kept for `cfContext()` (the Hyperdrive connection string, `waitUntil` for the
 * per-request database connection and the outbox drain, the Queue producers).
 */
const store = new AsyncLocalStorage<CfContext>();
(globalThis as { [CF_CONTEXT]?: AsyncLocalStorage<CfContext> })[CF_CONTEXT] = store;

const app = handler as { fetch(r: Request, e: unknown, c: unknown): Promise<Response> };

const worker = {
  fetch(request: Request, env: CfContext["env"], ctx: CfContext["ctx"]): Promise<Response> {
    return store.run({ env, ctx }, () => app.fetch(request, env, ctx));
  },
};

export default worker;
