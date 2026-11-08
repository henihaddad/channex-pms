import Link from "next/link";
import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { PROVISION_STEPS } from "@pms/core";
import {
  Alert,
  Button,
  Card,
  Chip,
  Field,
  Input,
  LinkButton,
  PageHeader,
  Select,
  Stat,
  TBody,
  THead,
  Table,
  Td,
  Th,
  Tr,
} from "@/components/ui";
import { guard } from "@/server/guard";
import { channelLabel, day, elapsed, money, percent } from "@/lib/format";
import {
  addDerivedPlanAction,
  addPolicyAction,
  forceResyncAction,
  loadProperty,
  loadPropertyOverview,
  updateDetailsAction,
  updateRoomTypeCountAction,
  type PropertyOverview,
} from "./property.actions";
import { AutoRefresh } from "../../auto-refresh";
import { ChannelDot, channelName } from "../channel-dot";
import { derivedLabel } from "../derived-label";

const stateColor: Record<string, "success" | "accent" | "default" | "warning"> = {
  live: "success",
  syncing: "accent",
  draft: "default",
  suspended: "warning",
};

type T = Awaited<ReturnType<typeof getTranslations<"properties">>>;

/**
 * One property (design "Property"): the photos and four numbers that say how it is doing,
 * its rooms and rate plans, and its details on the left; on the right what is still missing
 * from its content, where it sells, who owns it and who cleans it. Setup steps and provider
 * ids sit behind "Technical details".
 */
export default async function PropertyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getTranslations("properties");
  const [d, o] = await guard(() => Promise.all([loadProperty(id), loadPropertyOverview(id)]));
  const stepIndex = d.provisioning ? PROVISION_STEPS.indexOf(d.provisioning.step) : -1;
  const state = d.property.state;
  const policy = d.policies[0];
  return (
    <div className="space-y-5">
      <PageHeader
        crumb={[{ href: "/properties", label: t("title") }, { label: d.property.title }]}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {d.property.title}
            <Chip
              color={stateColor[state] ?? "default"}
              data-testid="property-state"
              data-state={state}
            >
              {t(`states.${state}`)}
            </Chip>
          </span>
        }
        actions={
          <>
            <LinkButton href={`/calendar?propertyId=${d.property.id}`} variant="secondary">
              {t("openCalendar")}
            </LinkButton>
            {o.vitals.directEnabled ? (
              <LinkButton href={`/book/${d.property.id}`} variant="primary" target="_blank">
                {t("detail.viewBookingPage")}
              </LinkButton>
            ) : (
              <LinkButton href={`/properties/${d.property.id}/booking-engine`} variant="primary">
                {t("detail.setUpBookingPage")}
              </LinkButton>
            )}
          </>
        }
      />

      {state === "live" && d.connections.length === 0 ? (
        <Alert tone="success" title={t("whatsNext")}>
          {t("nextLive")}{" "}
          <Link href="/channels" className="font-medium underline">
            {t("nextLiveAction")}
          </Link>
        </Alert>
      ) : null}
      {state === "syncing" || state === "draft" ? (
        <Alert tone="info" title={t("whatsNext")} data-testid="setup-progress">
          <p>{state === "syncing" ? t("nextSyncing") : t("nextDraft")}</p>
          <AutoRefresh />
          {d.provisioning?.lastError ? (
            <p className="mt-2 text-danger">
              {d.provisioning.lastError} (attempt {d.provisioning.attempts})
            </p>
          ) : null}
          <form action={forceResyncAction} className="mt-3">
            <input type="hidden" name="propertyId" value={d.property.id} />
            <Button type="submit" variant="secondary" size="sm">
              {t("retry")}
            </Button>
          </form>
        </Alert>
      ) : null}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="flex min-w-0 flex-col gap-5">
          <Card id="photos" className="scroll-mt-24">
            <PhotoMosaic photos={o.extras.photos} t={t} />
            <div className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
              <Kpis o={o} currency={d.property.currency} t={t} />
            </div>
          </Card>

          <RoomsAndPlans d={d} o={o} t={t} />

          <Card
            id="rules"
            title={t("detail.rulesTitle")}
            description={t("detail.rulesHint")}
            className="scroll-mt-24"
          >
            {d.policies.length === 0 ? (
              <p className="text-sm text-muted">{t("detail.noPolicies")}</p>
            ) : (
              <ul className="divide-y divide-border text-sm">
                {d.policies.map((p) => (
                  <li key={p.id} className="flex justify-between gap-3 py-2">
                    <span className="font-semibold">{p.title}</span>
                    <span className="text-muted">
                      {t("checkIn")} {p.checkInTime} · {t("checkOut")} {p.checkOutTime}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-sm">
              <Link
                href={`/properties/${d.property.id}/guide?section=house_rules`}
                className="font-semibold text-accent hover:underline"
              >
                {o.guide?.houseRules ? t("detail.editHouseRules") : t("detail.writeHouseRules")}
              </Link>
            </p>
            <details className="mt-3 rounded-xl border border-border p-4">
              <summary className="cursor-pointer text-sm font-medium">{t("policyTitle")}</summary>
              <form action={addPolicyAction} className="mt-3 grid items-end gap-2 sm:grid-cols-4">
                <input type="hidden" name="propertyId" value={d.property.id} />
                <Field label={t("policyName")} name="title" placeholder="Flexible" />
                <Field label={t("checkIn")} name="checkInTime" defaultValue="15:00" />
                <Field label={t("checkOut")} name="checkOutTime" defaultValue="11:00" />
                <Button type="submit" variant="secondary">
                  {t("addPolicy")}
                </Button>
              </form>
            </details>
          </Card>

          <Card id="settings" title={t("detail.details")} className="scroll-mt-24">
            <form
              action={updateDetailsAction}
              className="grid gap-3 sm:grid-cols-2"
              data-testid="details-form"
            >
              <input type="hidden" name="propertyId" value={d.property.id} />
              <Field label={t("detail.name")} name="title" defaultValue={d.property.title} />
              <Select
                label={t("detail.propertyType")}
                name="kindShown"
                defaultValue={d.property.kind}
                disabled
                description={t("detail.propertyTypeHint")}
              >
                {(["single_unit", "multi_unit", "hotel"] as const).map((k) => (
                  <option key={k} value={k}>
                    {t(`wizard.kinds.${k}.option`)}
                  </option>
                ))}
              </Select>
              <Field
                label={t("wizard.street")}
                name="street"
                required={false}
                defaultValue={d.property.address.street ?? ""}
              />
              <div className="grid grid-cols-[1fr_2fr] gap-3">
                <Field
                  label={t("wizard.postcode")}
                  name="postcode"
                  required={false}
                  defaultValue={d.property.address.postcode ?? ""}
                />
                <Field
                  label={t("wizard.city")}
                  name="city"
                  required={false}
                  defaultValue={d.property.address.city ?? ""}
                />
              </div>
              <Field
                label={t("detail.checkInFrom")}
                name="checkInTime"
                type="time"
                defaultValue={policy?.checkInTime ?? "15:00"}
              />
              <Field
                label={t("detail.checkOutBy")}
                name="checkOutTime"
                type="time"
                defaultValue={policy?.checkOutTime ?? "11:00"}
              />
              <p className="text-xs text-muted sm:col-span-2">
                {t("detail.timezoneLine", { tz: d.property.timezone.replace(/_/g, " ") })}
              </p>
              <div className="flex gap-2 sm:col-span-2">
                <Button type="submit">{t("detail.save")}</Button>
                <Button type="reset" variant="secondary">
                  {t("detail.discard")}
                </Button>
              </div>
            </form>
          </Card>

          <details
            className="rounded-card border border-border bg-surface px-5 py-4 text-sm"
            data-testid="technical-details"
          >
            <summary className="cursor-pointer font-medium">{t("technical")}</summary>
            <dl className="mt-3 grid gap-x-6 gap-y-1 text-xs sm:grid-cols-[auto_1fr]">
              <dt className="text-muted">{t("setupStep")}</dt>
              <dd>
                <ol className="flex flex-wrap gap-1.5" data-testid="provisioning-steps">
                  {PROVISION_STEPS.map((s, i) => (
                    <li
                      key={s}
                      className={`rounded px-2 py-0.5 ${i < stepIndex || d.provisioning?.step === "live" ? "bg-success-soft text-success-soft-foreground" : i === stepIndex ? "bg-accent-soft text-accent" : "bg-background text-muted"}`}
                    >
                      {s}
                    </li>
                  ))}
                </ol>
              </dd>
              <dt className="text-muted">{t("channexId")}</dt>
              <dd className="font-mono">{d.property.channexPropertyId ?? "—"}</dd>
              {d.property.expectedRemovalDate ? (
                <>
                  <dt className="text-danger">{t("removalDate")}</dt>
                  <dd className="text-danger" data-testid="removal-scheduled">
                    {day(d.property.expectedRemovalDate)}
                  </dd>
                </>
              ) : null}
              <dt className="text-muted">{t("webhook")}</dt>
              <dd>{d.property.webhookToken ? t("registered") : "—"}</dd>
              <dt className="text-muted">{t("cells")}</dt>
              <dd>
                {Object.entries(d.health)
                  .map(([k, v]) => `${k} ${v}`)
                  .join(", ") || "—"}
              </dd>
            </dl>
            {state === "live" ? (
              <form action={forceResyncAction} className="mt-3">
                <input type="hidden" name="propertyId" value={d.property.id} />
                <Button type="submit" variant="ghost" size="sm">
                  {t("forceResync")}
                </Button>
              </form>
            ) : null}
            {d.bulkOps.length > 0 ? (
              <div className="mt-3">
                <p className="text-xs text-muted">{t("recentOpsHint")}</p>
                <ul className="text-xs text-muted">
                  {d.bulkOps.map((op) => (
                    <li key={op.id}>
                      {day(op.createdAt)} · {op.cellCount} cells · {op.state}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </details>
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          <Card title={t("detail.content")} data-testid="content-status">
            <ul className="flex flex-col gap-2.5 text-sm">
              <StatusRow
                href={`/properties/${d.property.id}/guide`}
                label={t("guestGuide")}
                chip={
                  !o.guide || o.guide.written === 0 ? (
                    <Chip color="warning">{t("detail.notStarted")}</Chip>
                  ) : (
                    <Chip color={o.guide.published ? "success" : "default"}>
                      {t(o.guide.published ? "detail.guidePublished" : "detail.guideDraft", {
                        written: o.guide.written,
                        total: o.guide.total,
                      })}
                    </Chip>
                  )
                }
              />
              <StatusRow
                href={`/properties/${d.property.id}/guide?section=house_rules`}
                label={t("content.houseRules")}
                chip={
                  o.guide?.houseRules ? (
                    <Chip color="success">{t("detail.complete")}</Chip>
                  ) : (
                    <Chip color="warning">{t("detail.missing")}</Chip>
                  )
                }
              />
              <StatusRow
                href="#photos"
                label={t("content.photos")}
                chip={<Chip>{o.extras.photos.length}</Chip>}
              />
              <StatusRow
                href={`/properties/${d.property.id}/pricing`}
                label={t("pricingImport")}
                chip={
                  o.pricing.enabled ? (
                    <Chip color="accent">
                      {t("detail.pricingScheduled", { provider: providerName(o.pricing.provider) })}
                    </Chip>
                  ) : (
                    <Chip>{t("detail.pricingManual")}</Chip>
                  )
                }
              />
              <StatusRow
                href={`/properties/${d.property.id}/booking-engine`}
                label={t("detail.bookingPage")}
                testId="open-booking-engine"
                chip={
                  o.vitals.directEnabled ? (
                    <Chip color="success">{t("states.live")}</Chip>
                  ) : (
                    <Chip>{t("detail.off")}</Chip>
                  )
                }
              />
            </ul>
          </Card>

          <Card title={t("channels")} data-testid="property-channels-card">
            <ul className="flex flex-col gap-2.5 text-sm">
              {d.connections.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3">
                  <Link href={`/channels/${c.id}`} className="hover:underline">
                    <ChannelDot code={c.adapterCode} />
                  </Link>
                  <Chip color={connectionTone(c.state)}>
                    {t(`detail.connection.${connectionKey(c.state)}`)}
                  </Chip>
                </li>
              ))}
              <li className="flex items-center justify-between gap-3">
                <ChannelDot code="direct" />
                {o.vitals.directEnabled ? (
                  <Chip color="success">{t("states.live")}</Chip>
                ) : (
                  <Link
                    href={`/properties/${d.property.id}/booking-engine`}
                    className="text-[13px] font-semibold text-accent hover:underline"
                  >
                    {t("detail.turnOn")}
                  </Link>
                )}
              </li>
              {(["AirBNB", "BookingCom"] as const)
                .filter((code) => !d.connections.some((c) => c.adapterCode === code))
                .map((code) => (
                  <li key={code} className="flex items-center justify-between gap-3">
                    <ChannelDot code={code} />
                    <Link
                      href={
                        code === "AirBNB"
                          ? "/channels"
                          : `/channels/new?propertyId=${d.property.id}`
                      }
                      className="text-[13px] font-semibold text-accent hover:underline"
                    >
                      {t("detail.connect")}
                    </Link>
                  </li>
                ))}
            </ul>
          </Card>

          <Card title={t("detail.owner")}>
            {o.extras.owner ? (
              <div className="text-sm">
                <p className="font-semibold">{o.extras.owner.name}</p>
                <p className="text-xs text-muted">
                  {ownerTerms(o.extras.owner.model, o.extras.owner.payout, d.property.currency, t)}
                </p>
                <Link
                  href={`/owners/${o.extras.owner.id}`}
                  className="mt-2 inline-block text-[13px] font-semibold text-accent hover:underline"
                >
                  {t("detail.ownerSettings")}
                </Link>
              </div>
            ) : (
              <div className="text-sm">
                <p className="text-muted">{t("detail.noOwner")}</p>
                <Link
                  href="/owners"
                  className="mt-2 inline-block text-[13px] font-semibold text-accent hover:underline"
                >
                  {t("detail.addOwner")}
                </Link>
              </div>
            )}
          </Card>

          <Card title={t("detail.team")}>
            {o.extras.cleaner ? (
              <p className="text-sm">
                {t("detail.cleaning")} <strong>{o.extras.cleaner.name}</strong>
                <span className="block text-xs text-muted">
                  {t("detail.turnoversAhead", { count: o.extras.upcomingTurnovers })}
                </span>
              </p>
            ) : (
              <div className="text-sm">
                <p className="text-muted">
                  {t("detail.noCleaner", { count: o.extras.upcomingTurnovers })}
                </p>
                <Link
                  href="/operations/crews"
                  className="mt-2 inline-block text-[13px] font-semibold text-accent hover:underline"
                >
                  {t("detail.assignCrew")}
                </Link>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function StatusRow({
  href,
  label,
  chip,
  testId,
}: {
  href: string;
  label: string;
  chip: ReactNode;
  testId?: string;
}) {
  return (
    <li className="flex items-center justify-between gap-3">
      <Link
        href={href}
        className="font-semibold text-foreground hover:underline"
        data-testid={testId}
      >
        {label}
      </Link>
      {chip}
    </li>
  );
}

const PROVIDERS: Record<string, string> = {
  csv: "CSV",
  pricelabs: "PriceLabs",
  wheelhouse: "Wheelhouse",
  beyond: "Beyond",
};
const providerName = (p: string) => PROVIDERS[p] ?? p;

function connectionKey(state: string): string {
  return ["active", "mapped", "testing", "paused", "error", "draft"].includes(state)
    ? state
    : "draft";
}
function connectionTone(state: string): "success" | "info" | "warning" | "danger" | "default" {
  if (state === "active") return "success";
  if (state === "mapped" || state === "testing") return "info";
  if (state === "paused") return "warning";
  if (state === "error") return "danger";
  return "default";
}

function ownerTerms(
  model: Record<string, unknown>,
  payout: Record<string, unknown>,
  currency: string,
  t: T,
): string {
  const kind = String(model.kind ?? "");
  const terms =
    kind === "commission_pct" && typeof model.rateBps === "number"
      ? t("detail.split", {
          owner: Math.round((10_000 - model.rateBps) / 100),
          us: Math.round(model.rateBps / 100),
        })
      : kind === "fixed_fee" && typeof model.amountMinor === "number"
        ? t("detail.fixedFee", { amount: money(model.amountMinor, currency) })
        : kind === "guaranteed_rent" && typeof model.amountMinor === "number"
          ? t("detail.guaranteedRent", { amount: money(model.amountMinor, currency) })
          : t("detail.tiered");
  const freq = payout.frequency === "fortnightly" ? "fortnightly" : "monthly";
  return `${terms} · ${t(`detail.statements.${freq}`)}`;
}

function PhotoMosaic({ photos, t }: { photos: string[]; t: T }) {
  const tile = (i: number, cls: string, fallback: string) =>
    photos[i] ? (
      // eslint-disable-next-line @next/next/no-img-element -- remote OTA photo, no loader configured
      <img src={photos[i]} alt="" className={`h-full w-full rounded-xl object-cover ${cls}`} />
    ) : (
      <div className={`rounded-xl ${fallback} ${cls}`} aria-hidden="true" />
    );
  const more = Math.max(0, photos.length - 3);
  return (
    <div className="grid h-[220px] grid-cols-[2fr_1fr_1fr] grid-rows-2 gap-2">
      {tile(0, "row-span-2", "bg-[linear-gradient(135deg,#d8f3ee,#a7e3dc)]")}
      {tile(1, "", "bg-[#cdeff5]")}
      {tile(2, "", "bg-[#e0f2fe]")}
      <Link
        href="/properties/import"
        className="col-span-2 flex items-center justify-center rounded-xl bg-[#d1fae5] px-3 text-center text-[13px] font-semibold text-[#115e59] hover:underline"
      >
        {photos.length === 0
          ? t("detail.noPhotos")
          : more > 0
            ? t("detail.morePhotos", { count: more })
            : t("detail.photosCount", { count: photos.length })}
      </Link>
    </div>
  );
}

/** "Channex just now", "Channex 12 min ago": when the channel manager last confirmed a cell. */
function channexAgo(iso: string, t: T): string {
  const ms = new Date().getTime() - new Date(iso).getTime();
  return ms < 60_000 ? t("detail.channexNow") : t("detail.channexAgo", { ago: elapsed(iso) });
}

function Kpis({ o, currency, t }: { o: PropertyOverview; currency: string; t: T }) {
  const base = o.inventory.ratePlans.find((r) => !r.parentTitle && r.rateMinor !== null);
  const next = o.extras.nextArrival;
  const a = o.attention;
  const syncValue = a
    ? t("detail.syncCheck")
    : o.vitals.pendingCells > 0
      ? t("detail.syncSending")
      : "OK";
  const syncHint =
    a?.kind === "unmapped_bookings"
      ? t("chip.unmapped", { count: a.count })
      : a?.kind === "sync_failed"
        ? t("chip.syncFailed", { count: a.cells })
        : a?.kind === "setup_failed"
          ? t("chip.setupFailed")
          : a?.kind === "suspended"
            ? t("states.suspended")
            : o.vitals.pendingCells > 0
              ? t("detail.nightsWaiting", { count: o.vitals.pendingCells })
              : o.vitals.lastSyncedAt
                ? channexAgo(o.vitals.lastSyncedAt, t)
                : t("detail.inStep");
  return (
    <>
      <Stat
        label={t("occupancy30")}
        value={o.occupancyBps === null ? "—" : percent(o.occupancyBps / 10_000)}
        hint={t("detail.nightsBooked", {
          sold: o.vitals.nightsSold,
          available: o.vitals.nightsAvailable,
        })}
        testId="kpi-occupancy"
      />
      <Stat
        label={t("detail.adr30")}
        value={money(o.adrMinor, currency)}
        hint={
          base ? t("detail.baseRate", { rate: money(base.rateMinor, base.currency) }) : undefined
        }
      />
      <Stat
        label={t("detail.nextArrival")}
        value={next ? day(next.date).split(" ").slice(0, 2).join(" ") : "—"}
        hint={
          next ? (
            <Link href={`/reservations/${next.bookingId}`} className="hover:underline">
              {[next.guestName, channelName(channelLabel(next.channel, "direct"))]
                .filter(Boolean)
                .join(" · ")}
            </Link>
          ) : (
            t("detail.noArrivals")
          )
        }
      />
      <Stat
        label={t("detail.sync")}
        value={<span className={a ? "text-[#b45309]" : "text-[#166534]"}>{syncValue}</span>}
        hint={syncHint}
      />
    </>
  );
}

function RoomsAndPlans({
  d,
  o,
  t,
}: {
  d: Awaited<ReturnType<typeof loadProperty>>;
  o: PropertyOverview;
  t: T;
}) {
  const single = d.property.kind === "single_unit";
  const rows = d.roomTypes.flatMap((rt) => {
    const plans = o.inventory.ratePlans.filter((p) => p.roomTypeId === rt.id);
    const units = d.units.filter((u) => u.roomTypeId === rt.id).length;
    const roomCell = (
      <>
        <strong>{single ? d.property.title : rt.title}</strong>
        <span className="block text-xs text-muted">
          {t("sleeps", { count: rt.maxOccupancy })}
          {!single ? ` · ${t("count.units", { count: units })}` : ""}
        </span>
      </>
    );
    const unitsCell = single ? (
      rt.countOfRooms
    ) : (
      <form action={updateRoomTypeCountAction} className="flex items-center gap-1.5">
        <input type="hidden" name="propertyId" value={d.property.id} />
        <input type="hidden" name="roomTypeId" value={rt.id} />
        <Input
          name="countOfRooms"
          type="number"
          min={1}
          defaultValue={rt.countOfRooms}
          className="w-16"
          aria-label={t("wizard.rooms")}
        />
        <Button type="submit" variant="ghost" size="sm">
          {t("setCount")}
        </Button>
      </form>
    );
    if (plans.length === 0)
      return [
        <Tr key={rt.id}>
          <Td>{roomCell}</Td>
          <Td>{unitsCell}</Td>
          <Td className="text-muted" colSpan={4}>
            {t("detail.noPlans")}
          </Td>
        </Tr>,
      ];
    return plans.map((rp, i) => (
      <Tr key={rp.id}>
        <Td>{i === 0 ? roomCell : null}</Td>
        <Td>{i === 0 ? unitsCell : null}</Td>
        <Td>
          {rp.title}
          {rp.derivedOption ? (
            <span className="block text-xs text-muted">
              {derivedLabel(rp.derivedOption, rp.currency, t)}
            </span>
          ) : null}
        </Td>
        <Td className="tabular-nums">{money(rp.rateMinor, rp.currency)}</Td>
        <Td className="tabular-nums">{rp.minStay ?? "—"}</Td>
        <Td>
          {rp.channels.length ? (
            rp.channels.map(channelName).join(" · ")
          ) : (
            <span className="text-muted">—</span>
          )}
        </Td>
      </Tr>
    ));
  });
  return (
    <Card
      id="rooms"
      title={t("detail.roomsTitle")}
      className="scroll-mt-24"
      actions={
        <LinkButton href="#add-plan" variant="secondary" size="sm">
          + {t("detail.addRatePlan")}
        </LinkButton>
      }
    >
      <Table data-testid="rate-plans">
        <THead>
          <Tr className="hover:bg-transparent">
            <Th>{t("cols.roomType")}</Th>
            <Th>{t("cols.units")}</Th>
            <Th>{t("cols.ratePlan")}</Th>
            <Th>{t("cols.rateTonight")}</Th>
            <Th>{t("cols.minStay")}</Th>
            <Th>{t("cols.channels")}</Th>
          </Tr>
        </THead>
        <TBody>{rows}</TBody>
      </Table>
      <details id="add-plan" className="mt-4 rounded-xl border border-border p-4">
        <summary className="cursor-pointer text-sm font-medium">{t("derivedTitle")}</summary>
        <p className="mt-1 text-xs text-muted">{t("derivedHint")}</p>
        <form
          action={addDerivedPlanAction}
          className="mt-3 grid items-end gap-2 sm:grid-cols-5"
          data-testid="derived-form"
        >
          <input type="hidden" name="propertyId" value={d.property.id} />
          <Field label={t("derivedName")} name="title" placeholder="Non-refundable" />
          <Select label={t("parent")} name="parentRatePlanId">
            {d.ratePlans.map((rp) => (
              <option key={rp.id} value={rp.id}>
                {rp.title}
              </option>
            ))}
          </Select>
          <Select label={t("direction")} name="direction">
            <option value="decrease">{t("decrease")}</option>
            <option value="increase">{t("increase")}</option>
          </Select>
          <Select label={t("by")} name="kind">
            <option value="percent">{t("percent")}</option>
            <option value="amount">{t("amount")}</option>
          </Select>
          <div className="flex gap-2">
            <Input
              name="value"
              type="number"
              min={0}
              step="0.01"
              defaultValue={10}
              aria-label={t("value")}
            />
            <Button type="submit">{t("add")}</Button>
          </div>
        </form>
      </details>
    </Card>
  );
}
