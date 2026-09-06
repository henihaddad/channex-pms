import {
  AuthError,
  AuthorizationError,
  describeChannelEvent,
  Id,
  transition,
  type Clock,
  type ConnectivityProvider,
  type Readiness,
} from "@pms/core";
import {
  asSystem,
  DrizzleChannelRepository,
  DrizzlePropertyRepository,
  withoutTenant,
  rawRows,
  sql,
  type Db,
  type Tx,
} from "@pms/db";
import type { Logger } from "@pms/runtime";
import { markAllPending, queueAriPush } from "./ari-events.js";

export interface ChannelDeps {
  db: Db;
  provider: ConnectivityProvider;
  clock: Clock;
  log: Logger;
  /** Waiting between polls of the provider; tests inject a no-op. */
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Where tenant transactions run. The worker opens system transactions per
 * call; a web action passes its own open transaction (a second connection would
 * deadlock a single-connection driver and lose the action's atomicity).
 */
export type TxRunner = <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>;
export const systemRunner =
  (db: Db, orgId: string): TxRunner =>
  (fn) =>
    asSystem(db, orgId, fn);

/**
 * Activation (CH-4, CH-6): create the provider-side channel if needed, check
 * readiness, activate, then re-push the whole horizon. Returns the readiness
 * so the wizard can list the gaps when it is not ready.
 */
export async function activateConnection(
  deps: Omit<ChannelDeps, "db">,
  orgId: string,
  connectionId: string,
  run: TxRunner,
): Promise<{ activated: boolean; readiness: Readiness }> {
  const conn = await run((tx) =>
    new DrizzleChannelRepository(tx, orgId).getConnection(connectionId),
  );
  if (!conn) throw new Error("connection not found");
  const mappings = await run((tx) =>
    new DrizzleChannelRepository(tx, orgId).listMappings(connectionId),
  );
  const idMap = await run((tx) => new DrizzlePropertyRepository(tx, orgId).idMap(conn.propertyId));
  const remotePlan = new Map(idMap.ratePlans.map((r) => [r.local, r.remote]));
  const meta = (op: string) => ({
    dedupeKey: `channel:${connectionId}:${op}`,
    requestId: `channel:${connectionId}`,
  });
  let channexChannelId = conn.channexChannelId;
  if (!channexChannelId) {
    const ref = await deps.provider.createChannel(
      {
        adapterCode: conn.adapterCode,
        propertyId: idMap.property.remote,
        settings: conn.settings,
        mappings: mappings.map((m) => ({
          ratePlanId: remotePlan.get(m.ratePlanId) ?? m.ratePlanId,
          roomCode: m.roomCode,
          rateCode: m.rateCode,
          ...(m.occupancy !== undefined ? { occupancy: m.occupancy } : {}),
        })),
      },
      meta("create"),
    );
    channexChannelId = ref.id;
    await run((tx) =>
      new DrizzleChannelRepository(tx, orgId).updateConnection(connectionId, {
        channexChannelId: ref.id,
      }),
    );
  }
  if (isAirbnbViaChannex(conn)) {
    await ensureListingMappings(deps, {
      channexChannelId,
      remotePropertyId: idMap.property.remote,
      wanted: mappings.map((m) => ({
        ratePlanId: remotePlan.get(m.ratePlanId) ?? m.ratePlanId,
        listingId: m.roomCode,
      })),
      meta,
    });
  }
  const readiness = await deps.provider.checkReadiness({ id: channexChannelId }, meta("readiness"));
  if (!readiness.ready) {
    await run((tx) =>
      new DrizzleChannelRepository(tx, orgId).updateConnection(connectionId, {
        readiness,
        lastError: readiness.issues.join("; "),
      }),
    );
    return { activated: false, readiness };
  }
  await deps.provider.setChannelActive({ id: channexChannelId }, true, meta("activate"));
  if (isAirbnbViaChannex(conn))
    for (const m of mappings)
      await deps.provider.loadFutureReservations(
        { id: channexChannelId },
        meta(`load_reservations:${m.roomCode}`),
        m.roomCode,
      );
  const next = transition(conn.state, "activated");
  const now = deps.clock.now().epochMilliseconds;
  await run(async (tx) => {
    const ch = new DrizzleChannelRepository(tx, orgId);
    await ch.updateConnection(connectionId, {
      state: next.ok ? next.value : "active",
      isActive: true,
      readiness,
      lastError: null,
    });
    await markAllPending(tx, conn.propertyId);
    await queueAriPush(tx, orgId, conn.propertyId, now, "channel.activate");
  });
  return { activated: true, readiness };
}

export async function pauseConnection(
  deps: Omit<ChannelDeps, "db">,
  orgId: string,
  connectionId: string,
  paused: boolean,
  run: TxRunner,
): Promise<void> {
  const conn = await run((tx) =>
    new DrizzleChannelRepository(tx, orgId).getConnection(connectionId),
  );
  if (!conn) throw new Error("connection not found");
  const next = transition(conn.state, paused ? "paused" : "resumed");
  if (!next.ok) throw next.error;
  const meta = (op: string) => ({
    dedupeKey: `channel:${connectionId}:${op}:${String(deps.clock.now().epochMilliseconds)}`,
    requestId: connectionId,
  });
  if (conn.channexChannelId && isAirbnbViaChannex(conn)) {
    // one Airbnb account is one provider channel shared by the portfolio: pausing a property
    // un-maps its listings; the channel stays active for the others (spec 07 CH-5)
    const idMap = await run((tx) =>
      new DrizzlePropertyRepository(tx, orgId).idMap(conn.propertyId),
    );
    const mappings = await run((tx) =>
      new DrizzleChannelRepository(tx, orgId).listMappings(connectionId),
    );
    const remotePlan = new Map(idMap.ratePlans.map((r) => [r.local, r.remote]));
    const wanted = mappings.map((m) => ({
      ratePlanId: remotePlan.get(m.ratePlanId) ?? m.ratePlanId,
      listingId: m.roomCode,
    }));
    if (paused)
      await removeListingMappings(deps, {
        channexChannelId: conn.channexChannelId,
        remotePropertyId: idMap.property.remote,
        listingIds: wanted.map((w) => w.listingId),
        meta,
      });
    else
      await ensureListingMappings(deps, {
        channexChannelId: conn.channexChannelId,
        remotePropertyId: idMap.property.remote,
        wanted,
        meta,
      });
  } else if (conn.channexChannelId) {
    await deps.provider.setChannelActive(
      { id: conn.channexChannelId },
      !paused,
      meta(paused ? "pause" : "resume"),
    );
  }
  const now = deps.clock.now().epochMilliseconds;
  await run(async (tx) => {
    await new DrizzleChannelRepository(tx, orgId).updateConnection(connectionId, {
      state: next.value,
      isActive: !paused,
    });
    if (!paused) {
      await markAllPending(tx, conn.propertyId);
      await queueAriPush(tx, orgId, conn.propertyId, now, "channel.resume");
    }
  });
}

/** Airbnb authorised through Channex (CH-5): the provider channel belongs to the host's account. */
function isAirbnbViaChannex(conn: { adapterCode: string; settings: Record<string, unknown> }) {
  return conn.adapterCode === "AirBNB" && conn.settings.managedIn === "channex";
}

const MAPPING_WAIT_MS = 45_000;
const MAPPING_POLL_MS = 3_000;

/**
 * Make the provider hold exactly the wanted listing mappings for a property: create the
 * missing ones (Channex rejects a listing mapped twice, so the existing ones are skipped)
 * and wait until they appear on the connection — Airbnb confirms a mapping asynchronously,
 * in about thirty seconds, and activation refuses a connection without mappings.
 */
async function ensureListingMappings(
  deps: Omit<ChannelDeps, "db">,
  input: {
    channexChannelId: string;
    remotePropertyId: string;
    wanted: Array<{ ratePlanId: string; listingId: string }>;
    meta: (op: string) => { dedupeKey: string; requestId: string };
  },
): Promise<void> {
  const current = async () => {
    const remote = await deps.provider.listChannels(input.remotePropertyId, input.meta("list"));
    return remote.find((r) => r.id === input.channexChannelId)?.mappings ?? [];
  };
  const held = new Set((await current()).map((m) => m.listingId ?? m.roomCode ?? ""));
  let created = 0;
  for (const w of input.wanted) {
    if (held.has(w.listingId)) continue;
    await deps.provider.mapListing(
      { id: input.channexChannelId },
      { ratePlanId: w.ratePlanId, listingId: w.listingId },
      input.meta(`map:${w.listingId}`),
    );
    created++;
  }
  if (created === 0) return;
  const deadline = deps.clock.now().epochMilliseconds + MAPPING_WAIT_MS;
  for (;;) {
    const have = new Set((await current()).map((m) => m.listingId ?? m.roomCode ?? ""));
    if (input.wanted.every((w) => have.has(w.listingId))) return;
    if (deps.clock.now().epochMilliseconds >= deadline) {
      deps.log.warn(
        { channel: input.channexChannelId, wanted: input.wanted.length, have: have.size },
        "airbnb.mapping.pending",
      );
      return;
    }
    await (deps.sleep ?? defaultSleep)(MAPPING_POLL_MS);
  }
}

/** Un-map the given listings from the provider channel; mappings it no longer holds are skipped. */
async function removeListingMappings(
  deps: Omit<ChannelDeps, "db">,
  input: {
    channexChannelId: string;
    remotePropertyId: string;
    listingIds: string[];
    meta: (op: string) => { dedupeKey: string; requestId: string };
  },
): Promise<void> {
  const remote = await deps.provider.listChannels(input.remotePropertyId, input.meta("list"));
  const held = remote.find((r) => r.id === input.channexChannelId)?.mappings ?? [];
  for (const m of held) {
    const listing = m.listingId ?? m.roomCode ?? "";
    if (!m.id || !input.listingIds.includes(listing)) continue;
    await deps.provider.removeMapping(
      { id: input.channexChannelId },
      m.id,
      input.meta(`unmap:${listing}`),
    );
  }
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Removal (CH-6): an ordinary channel is deactivated on the provider. An Airbnb
 * account channel is shared by every property of the portfolio, so removing one
 * property un-maps its listings and the channel is deactivated only when no
 * other connection of the organisation still uses it.
 */
export async function removeConnection(
  deps: Omit<ChannelDeps, "db">,
  orgId: string,
  connectionId: string,
  run: TxRunner,
): Promise<void> {
  const conn = await run((tx) =>
    new DrizzleChannelRepository(tx, orgId).getConnection(connectionId),
  );
  if (!conn) throw new Error("connection not found");
  const meta = (op: string) => ({
    dedupeKey: `channel:${connectionId}:${op}:${String(deps.clock.now().epochMilliseconds)}`,
    requestId: connectionId,
  });
  if (conn.channexChannelId && isAirbnbViaChannex(conn)) {
    const idMap = await run((tx) =>
      new DrizzlePropertyRepository(tx, orgId).idMap(conn.propertyId),
    );
    const mappings = await run((tx) =>
      new DrizzleChannelRepository(tx, orgId).listMappings(connectionId),
    );
    await removeListingMappings(deps, {
      channexChannelId: conn.channexChannelId,
      remotePropertyId: idMap.property.remote,
      listingIds: mappings.map((m) => m.roomCode),
      meta,
    });
    const others = (
      await run((tx) => new DrizzleChannelRepository(tx, orgId).listConnections())
    ).filter((c) => c.id !== connectionId && c.channexChannelId === conn.channexChannelId);
    if (others.length === 0)
      await deps.provider.setChannelActive({ id: conn.channexChannelId }, false, meta("remove"));
  } else if (conn.channexChannelId) {
    await deps.provider.setChannelActive({ id: conn.channexChannelId }, false, meta("remove"));
  }
  await run((tx) => new DrizzleChannelRepository(tx, orgId).removeConnection(connectionId));
}

/**
 * channel.health_poll: readiness read-back for every active connection; a
 * regression opens a P2 event with the gaps, invalid credentials a P1 (spec 07 §7.4).
 */
export async function pollChannelHealth(
  deps: ChannelDeps,
): Promise<{ checked: number; regressions: number }> {
  const orgs = await withoutTenant(deps.db, (tx) =>
    rawRows<{ org_id: string }>(
      tx,
      sql`select distinct org_id from channel_connection where archived_at is null and state in ('active','error') and channex_channel_id is not null`,
    ),
  );
  let checked = 0;
  let regressions = 0;
  for (const { org_id: orgId } of orgs) {
    const conns = await asSystem(deps.db, orgId, (tx) =>
      new DrizzleChannelRepository(tx, orgId).listConnections(),
    );
    for (const c of conns) {
      if (!c.channexChannelId || (c.state !== "active" && c.state !== "error")) continue;
      checked++;
      const ctx = { propertyTitle: c.propertyTitle, channelTitle: c.adapterCode };
      try {
        const r = await deps.provider.checkReadiness(
          { id: c.channexChannelId },
          {
            dedupeKey: `health:${c.id}:${String(deps.clock.now().epochMilliseconds)}`,
            requestId: `health:${c.id}`,
          },
        );
        await asSystem(deps.db, orgId, async (tx) => {
          const ch = new DrizzleChannelRepository(tx, orgId);
          if (!r.ready && c.readiness.ready) {
            regressions++;
            const alert = describeChannelEvent("readiness_regression", {
              ...ctx,
              detail: r.issues.join("; "),
            });
            await ch.insertEvent({
              id: Id.next(),
              connectionId: c.id,
              propertyId: c.propertyId,
              type: "readiness_regression",
              severity: alert.severity,
              message: `${alert.title}. ${alert.consequence} ${alert.action}`,
              payload: { issues: r.issues },
            });
            const next = transition(c.state, "readiness_failed");
            await ch.updateConnection(c.id, {
              readiness: r,
              ...(next.ok ? { state: next.value } : {}),
              lastError: r.issues.join("; "),
            });
          } else if (r.ready && c.state === "error") {
            const next = transition(c.state, "recovered");
            await ch.updateConnection(c.id, {
              readiness: r,
              ...(next.ok ? { state: next.value } : {}),
              lastError: null,
            });
          } else await ch.updateConnection(c.id, { readiness: r });
        });
      } catch (e) {
        const invalid = e instanceof AuthError || e instanceof AuthorizationError;
        const type = invalid ? "credentials_invalid" : "provider_error";
        const alert = describeChannelEvent(type, {
          ...ctx,
          detail: e instanceof Error ? e.message : String(e),
        });
        await asSystem(deps.db, orgId, async (tx) => {
          const ch = new DrizzleChannelRepository(tx, orgId);
          await ch.insertEvent({
            id: Id.next(),
            connectionId: c.id,
            propertyId: c.propertyId,
            type,
            severity: invalid ? "p1" : alert.severity,
            message: `${alert.title}. ${alert.consequence} ${alert.action}`,
          });
          if (invalid) {
            const next = transition(c.state, "provider_error");
            await ch.updateConnection(c.id, {
              ...(next.ok ? { state: next.value } : {}),
              lastError: alert.title,
            });
          }
        });
      }
    }
  }
  deps.log.info({ checked, regressions }, "channel.health_poll");
  return { checked, regressions };
}
