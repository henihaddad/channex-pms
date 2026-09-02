import {
  advance,
  fail,
  initialProvisioning,
  isLive,
  type Clock,
  type ConnectivityProvider,
  type Crypto,
  type ProvisioningState,
} from "@pms/core";
import { asSystem, DrizzlePropertyRepository, rawRows, sql, withoutTenant, type Db } from "@pms/db";
import type { Logger } from "@pms/runtime";
import { markAllPending, pendingCellCount, queueAriPush } from "./ari-events.js";

export interface ProvisioningDeps {
  db: Db;
  provider: ConnectivityProvider;
  clock: Clock;
  crypto: Crypto;
  log: Logger;
  /** Public base URL of the web app, for the webhook callback (PROV-4). */
  callbackBase: string;
}

export interface ProvisioningJob {
  orgId: string;
  propertyId: string;
}

/**
 * Resumable provisioning (spec 05 §5.3, PROV-1..5). One step per iteration;
 * every provider id lands in the same transaction that marks the step complete
 * (PROV-2). A failure is recorded and rethrown so the queue retries with backoff.
 */
export async function runProvisioning(
  deps: ProvisioningDeps,
  job: ProvisioningJob,
): Promise<ProvisioningState> {
  const { orgId, propertyId } = job;
  const meta = (step: string) => ({
    dedupeKey: `prov:${propertyId}:${step}`,
    requestId: `prov:${propertyId}`,
  });
  let state =
    (await asSystem(deps.db, orgId, (tx) =>
      new DrizzlePropertyRepository(tx, orgId).loadProvisioning(propertyId),
    )) ?? initialProvisioning();
  for (let guard = 0; guard < 12 && !isLive(state); guard++) {
    const detail = await asSystem(deps.db, orgId, (tx) =>
      new DrizzlePropertyRepository(tx, orgId).get(propertyId),
    );
    if (!detail) throw new Error(`property ${propertyId} not found`);
    try {
      switch (state.step) {
        case "group": {
          const g = detail.groups[0];
          const refs: Record<string, string> = {};
          if (g)
            refs.group = (await deps.provider.ensureGroup({ title: g.name }, meta("group"))).id;
          state = await save(deps, orgId, propertyId, advance(state, refs));
          break;
        }
        case "property": {
          const ref = await deps.provider.ensureProperty(
            {
              title: detail.property.title,
              currency: detail.property.currency,
              timezone: detail.property.timezone,
              address: detail.property.address,
              ...(state.refs.group ? { groupId: state.refs.group } : {}),
            },
            meta("property"),
          );
          state = await save(
            deps,
            orgId,
            propertyId,
            advance(state, { property: ref.id }),
            (repo) => repo.setRemoteIds({ propertyId: { local: propertyId, remote: ref.id } }),
          );
          break;
        }
        case "room_types": {
          const remote: Array<{ local: string; remote: string }> = [];
          for (const rt of detail.roomTypes) {
            const ref = rt.channexRoomTypeId
              ? { id: rt.channexRoomTypeId }
              : await deps.provider.ensureRoomType(
                  {
                    propertyId: state.refs.property!,
                    title: rt.title,
                    countOfRooms: rt.countOfRooms,
                    occAdults: rt.occAdults,
                    occChildren: rt.occChildren,
                    occInfants: rt.occInfants,
                    defaultOccupancy: rt.defaultOccupancy,
                  },
                  meta(`rt:${rt.id}`),
                );
            remote.push({ local: rt.id, remote: ref.id });
          }
          state = await save(
            deps,
            orgId,
            propertyId,
            advance(state, Object.fromEntries(remote.map((r) => [`rt:${r.local}`, r.remote]))),
            (repo) => repo.setRemoteIds({ roomTypes: remote }),
          );
          break;
        }
        case "rate_plans": {
          const remote: Array<{ local: string; remote: string }> = [];
          const byLocal = new Map<string, string>(
            detail.ratePlans
              .filter((r) => r.channexRatePlanId)
              .map((r) => [r.id, r.channexRatePlanId!]),
          );
          // parents before children so a derived plan can reference its parent's provider id
          const ordered = [...detail.ratePlans].sort(
            (a, b) => Number(a.parentRatePlanId !== null) - Number(b.parentRatePlanId !== null),
          );
          for (const rp of ordered) {
            let id = byLocal.get(rp.id);
            if (!id) {
              const rt = detail.roomTypes.find((r) => r.id === rp.roomTypeId)!;
              const parent = rp.parentRatePlanId ? byLocal.get(rp.parentRatePlanId) : undefined;
              const ref = await deps.provider.ensureRatePlan(
                {
                  propertyId: state.refs.property!,
                  roomTypeId: state.refs[`rt:${rt.id}`] ?? rt.channexRoomTypeId ?? rt.id,
                  title: rp.title,
                  currency: rp.currency,
                  sellMode: "per_room",
                  ...(parent ? { parentRatePlanId: parent } : {}),
                  options: [{ occupancy: rt.defaultOccupancy, isPrimary: true, rate: 0 }],
                },
                meta(`rp:${rp.id}`),
              );
              id = ref.id;
              byLocal.set(rp.id, id);
            }
            remote.push({ local: rp.id, remote: id });
          }
          state = await save(
            deps,
            orgId,
            propertyId,
            advance(state, Object.fromEntries(remote.map((r) => [`rp:${r.local}`, r.remote]))),
            (repo) => repo.setRemoteIds({ ratePlans: remote }),
          );
          break;
        }
        case "policies":
          // Policies, taxes and photos are pushed by their own actions when present (spec 05 §5.3 step list).
          state = await save(deps, orgId, propertyId, advance(state));
          break;
        case "webhook": {
          const [row] = await asSystem(deps.db, orgId, (tx) =>
            rawRows<{ webhook_token: string | null; webhook_secret_enc: string | null }>(
              tx,
              sql`select webhook_token, webhook_secret_enc from property where id = ${propertyId}`,
            ),
          );
          let token = row?.webhook_token;
          let secret = row?.webhook_secret_enc
            ? await deps.crypto.open(row.webhook_secret_enc)
            : null;
          if (!token || !secret) {
            token ??= deps.crypto.randomToken(24);
            secret ??= deps.crypto.randomToken(32);
            const sealed = await deps.crypto.seal(secret);
            const t = token;
            await asSystem(deps.db, orgId, (tx) =>
              new DrizzlePropertyRepository(tx, orgId).setWebhookCredentials(
                propertyId as never,
                t,
                sealed,
              ),
            );
          }
          const ref = await deps.provider.ensureWebhook(
            {
              propertyId: state.refs.property!,
              callbackUrl: `${deps.callbackBase}/webhooks/channex/${token}`,
              eventMask: "*",
              secret,
              sendData: true,
            },
            meta("webhook"),
          );
          state = await save(deps, orgId, propertyId, advance(state, { webhook: ref.id }));
          break;
        }
        case "seed": {
          // Cells were seeded at creation (PROV-5); anything missing is the horizon job's business.
          const pending = await asSystem(deps.db, orgId, (tx) => pendingCellCount(tx, propertyId));
          if (pending === 0) throw new Error("no seeded cells to push");
          state = await save(deps, orgId, propertyId, advance(state, { seeded: String(pending) }));
          break;
        }
        case "initial_push": {
          const now = deps.clock.now().epochMilliseconds;
          await asSystem(deps.db, orgId, async (tx) => {
            await new DrizzlePropertyRepository(tx, orgId).setPropertyState(propertyId, "syncing");
            await markAllPending(tx, propertyId);
            await queueAriPush(tx, orgId, propertyId, now, "provisioning");
          });
          state = await save(deps, orgId, propertyId, advance(state));
          break;
        }
        case "live":
          break;
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      state = await save(deps, orgId, propertyId, fail(state, message));
      deps.log.warn(
        { orgId, propertyId, step: state.step, attempts: state.attempts, err: message },
        "provisioning.step.failed",
      );
      throw e;
    }
  }
  deps.log.info({ orgId, propertyId, step: state.step }, "provisioning.progress");
  return state;
}

async function save(
  deps: ProvisioningDeps,
  orgId: string,
  propertyId: string,
  state: ProvisioningState,
  also?: (repo: DrizzlePropertyRepository) => Promise<void>,
): Promise<ProvisioningState> {
  await asSystem(deps.db, orgId, async (tx) => {
    const repo = new DrizzlePropertyRepository(tx, orgId);
    if (also) await also(repo);
    await repo.saveProvisioning(propertyId, state);
  });
  return state;
}

/** The last step: a syncing property becomes live once nothing is pending after a push (spec 05 §5.3). */
export async function markLiveIfSynced(
  db: Db,
  orgId: string,
  propertyId: string,
): Promise<boolean> {
  return asSystem(db, orgId, async (tx) => {
    const [p] = await rawRows<{ state: string }>(
      tx,
      sql`select state from property where id = ${propertyId}`,
    );
    if (p?.state !== "syncing") return false;
    if ((await pendingCellCount(tx, propertyId)) > 0) return false;
    const repo = new DrizzlePropertyRepository(tx, orgId);
    await repo.setPropertyState(propertyId, "live");
    const st = await repo.loadProvisioning(propertyId);
    if (st && st.step === "live") return true;
    await repo.saveProvisioning(propertyId, {
      step: "live",
      refs: st?.refs ?? {},
      attempts: 0,
      lastError: null,
    });
    return true;
  });
}

/** Properties waiting for provisioning, across tenants (the scheduler's sweep). */
export async function propertiesToProvision(db: Db): Promise<ProvisioningJob[]> {
  const rows = await withoutTenant(db, (tx) =>
    rawRows<{ org_id: string; id: string }>(
      tx,
      sql`select p.org_id, p.id from property p left join property_provisioning v on v.property_id = p.id
        where p.archived_at is null and p.state in ('draft','syncing') and coalesce(v.step, 'group') <> 'live' and coalesce(v.attempts, 0) < 20`,
    ),
  );
  return rows.map((r) => ({ orgId: r.org_id, propertyId: r.id }));
}
