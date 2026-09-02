import type { ConnectivityProvider } from "@pms/core";
import {
  ChannexProvider,
  CHANNEX_PRODUCTION,
  CHANNEX_STAGING,
  FakeProvider,
  FetchTransport,
  type ProviderObserver,
} from "@pms/connectivity";
import type { Config, Logger } from "@pms/runtime";

declare global {
  var __pmsFakeProvider: FakeProvider | undefined;
}

/**
 * Provider selection (spec 05 §5.2, §5.11): a Channex key selects the real
 * client (staging unless CHANNEX_ENV=production); without one the in-memory
 * FakeProvider serves development and tests. The fake is process-wide so the
 * web app and worker share it in single-process dev.
 */
export function selectProvider(
  config: Config,
  env: NodeJS.ProcessEnv,
  log: Logger,
  observer: ProviderObserver = {},
): { provider: ConnectivityProvider; kind: "channex" | "fake"; fake?: FakeProvider } {
  const key = env.CHANNEX_API_KEY;
  if (key) {
    const base = env.CHANNEX_ENV === "production" ? CHANNEX_PRODUCTION : CHANNEX_STAGING;
    log.info({ base }, "connectivity.provider.channex");
    return {
      provider: new ChannexProvider(new FetchTransport(base, key), observer),
      kind: "channex",
    };
  }
  globalThis.__pmsFakeProvider ??= new FakeProvider({
    seed: Number(env.PMS_FAKE_SEED ?? 1),
    rules: [],
  });
  if (config.PMS_ENV === "production") throw new Error("CHANNEX_API_KEY is required in production");
  log.warn("connectivity.provider.fake: no CHANNEX_API_KEY, using the in-memory FakeProvider");
  return {
    provider: globalThis.__pmsFakeProvider,
    kind: "fake",
    fake: globalThis.__pmsFakeProvider,
  };
}
