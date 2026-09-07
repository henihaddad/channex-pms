import { asSystem, DrizzleOperatorRepository, rawRows, sql, withoutTenant } from "@pms/db";
import { consoleAccess, type TenantState } from "@pms/core";
import { container } from "./container";
import { currentImpersonation, currentOperator } from "./operator";

export interface ConsoleContext {
  state: TenantState;
  access: "full" | "billing_only";
  announcements: Array<{ id: string; title: string; body: string; level: string }>;
  impersonation: { orgName: string; expiresAt: string } | null;
  isOperator: boolean;
  /**
   * Time-to-first-value programme (spec 12 §12.3); null once every track is done.
   * Tracks run in order: a later one unlocks when the one before it is complete, so a
   * new account is never shown twelve things at once.
   */
  onboarding: OnboardingTrack[] | null;
}

export interface OnboardingTrack {
  key: string;
  /** Steps of this track, in the order they happen. */
  steps: Array<{ key: string; done: boolean; href: string; minutes: number }>;
  done: boolean;
  /** False while an earlier track is unfinished. */
  unlocked: boolean;
}

/** Everything the console shell shows above the page: state banners, announcements, the checklist. */
export async function consoleContext(orgId: string): Promise<ConsoleContext> {
  const c = await container();
  const [row] = await withoutTenant(c.db.db, (tx) =>
    rawRows<{ state: TenantState }>(tx, sql`select state from organization where id = ${orgId}`),
  );
  const state = row?.state ?? "trial";
  const announcements = await withoutTenant(c.db.db, (tx) =>
    new DrizzleOperatorRepository(tx).activeAnnouncementsFor(orgId),
  );
  const [steps] = await asSystem(c.db.db, orgId, (tx) =>
    rawRows<{
      properties: number;
      channels: number;
      live: number;
      editedRates: number;
      directChannels: number;
      owners: number;
      templates: number;
      automations: number;
      crews: number;
    }>(
      tx,
      sql`select
        (select count(*)::int from property where org_id = ${orgId} and archived_at is null) as properties,
        (select count(*)::int from channel_connection where org_id = ${orgId} and archived_at is null and adapter_code <> 'direct') as channels,
        (select count(*)::int from property where org_id = ${orgId} and state = 'live') as live,
        (select count(*)::int from (select 1 from rate_day where org_id = ${orgId} and source not in ('seed', 'airbnb_import') limit 1) x) as "editedRates",
        (select count(*)::int from channel_connection where org_id = ${orgId} and adapter_code = 'direct' and archived_at is null) as "directChannels",
        (select count(*)::int from owner where org_id = ${orgId} and archived_at is null) as owners,
        (select count(*)::int from message_template where org_id = ${orgId}) as templates,
        (select count(*)::int from automation_rule where org_id = ${orgId}) as automations,
        (select count(*)::int from crew where org_id = ${orgId} and archived_at is null) as crews`,
    ),
  );
  const providerConfigured = Boolean(process.env.CHANNEX_API_KEY) || c.fake !== undefined;
  const n = (v: number | undefined) => Number(v ?? 0);
  const tracks: OnboardingTrack[] = [
    {
      key: "connect",
      steps: [
        ...(providerConfigured
          ? []
          : [{ key: "provider", done: false, href: "/sync-health", minutes: 5 }]),
        { key: "property", done: n(steps?.properties) > 0, href: "/properties/new", minutes: 3 },
        { key: "live", done: n(steps?.live) > 0, href: "/properties", minutes: 5 },
        { key: "channel", done: n(steps?.channels) > 0, href: "/channels", minutes: 2 },
      ],
      done: false,
      unlocked: true,
    },
    {
      key: "sell",
      steps: [
        { key: "rates", done: n(steps?.editedRates) > 0, href: "/calendar", minutes: 5 },
        { key: "engine", done: n(steps?.directChannels) > 0, href: "/booking-engine", minutes: 3 },
        { key: "owner", done: n(steps?.owners) > 0, href: "/owners", minutes: 3 },
      ],
      done: false,
      unlocked: false,
    },
    {
      key: "automate",
      steps: [
        { key: "template", done: n(steps?.templates) > 0, href: "/inbox/templates", minutes: 4 },
        {
          key: "automation",
          done: n(steps?.automations) > 0,
          href: "/inbox/automation",
          minutes: 4,
        },
        { key: "crew", done: n(steps?.crews) > 0, href: "/operations/crews", minutes: 3 },
      ],
      done: false,
      unlocked: false,
    },
  ];
  let previousDone = true;
  for (const t of tracks) {
    t.done = t.steps.every((x) => x.done);
    t.unlocked = previousDone;
    previousDone = previousDone && t.done;
  }
  const imp = await currentImpersonation();
  return {
    state,
    access: consoleAccess(state),
    announcements,
    impersonation: imp ? { orgName: imp.orgName, expiresAt: imp.expiresAt } : null,
    isOperator: (await currentOperator()) !== null,
    onboarding: tracks.every((t) => t.done) ? null : tracks,
  };
}
