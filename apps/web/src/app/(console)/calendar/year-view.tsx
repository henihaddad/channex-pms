import Link from "next/link";
import { Money, seasonOn, seasonPrices, summariseMonths, type YearNight } from "@pms/core";
import { DrizzleSeasonRepository, loadYearNights, rawRows, sql, type SeasonRow } from "@pms/db";
import { Card, Stat, Table, TBody, Td, Th, THead, Tr } from "@/components/ui";
import { guard } from "@/server/guard";
import { withPermission } from "@/server/with-permission";
import { CalendarViewSwitch } from "@/components/calendar-view";
import type { CalendarLabels } from "@/components/calendar-labels";
import { addDays, fmt, HATCH, mondayIndex } from "@/components/calendar-shared";
import { money, percent } from "@/lib/format";
import { removeSeasonAction } from "./calendar.actions";
import { AddSeasonForm, PropertySelect } from "./year-forms";

const monthFirst = (iso: string, plus = 0): string => {
  const d = new Date(`${iso.slice(0, 7)}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + plus);
  return d.toISOString().slice(0, 10);
};

const loadYear = withPermission<
  [{ propertyId: string; from: string; to: string }],
  {
    title: string;
    currency: string;
    seasons: SeasonRow[];
    year: Awaited<ReturnType<typeof loadYearNights>>;
  }
>(
  "ari:read",
  {
    scope: "property",
    resolveScope: (i) => ({ kind: "property", id: i.propertyId }),
    audit: false,
  },
  async (ctx, { propertyId, from, to }) => {
    const [p] = await rawRows<{ title: string; currency: string }>(
      ctx.tx,
      sql`select title, currency from property where id = ${propertyId}`,
    );
    return {
      title: p?.title ?? "",
      currency: p?.currency ?? "EUR",
      seasons: await new DrizzleSeasonRepository(ctx.tx, ctx.orgId).list(propertyId),
      year: await loadYearNights(ctx.tx, propertyId, from, to),
    };
  },
);

/**
 * The year (spec 06 §6.2 "year heatmap", §6.6 seasons): twelve months of one listing, each
 * night booked or open, the month's occupancy on the books and its average price, seasons
 * outlined, and the seasons themselves with what they actually charge.
 */
export async function YearView({
  propertyId,
  properties,
  from: fromParam,
  tipsCount,
  labels: L,
}: {
  propertyId: string;
  properties: Array<{ id: string; title: string }>;
  from: string;
  tipsCount: number;
  labels: CalendarLabels;
}) {
  const from = monthFirst(fromParam);
  const to = addDays(monthFirst(from, 12), -1);
  const d = await guard(() => loadYear({ propertyId, from, to }));
  const nights = d.year.nights;
  // an average reads in whole units ("avg €112"), never with cents
  const unit = 10 ** Money.exponent(d.currency);
  const whole = (m: number | null) => (m === null ? null : Math.round(m / unit) * unit);
  const months = summariseMonths(nights);
  const byMonth = new Map<string, YearNight[]>();
  for (const n of nights)
    byMonth.set(n.date.slice(0, 7), [...(byMonth.get(n.date.slice(0, 7)) ?? []), n]);
  const sellable = nights.reduce((s, n) => s + n.sellable, 0);
  const booked = nights.reduce((s, n) => s + n.booked, 0);
  const blockedNights = d.year.blocked.reduce((s, b) => s + b.nights, 0);
  const prevYear = monthFirst(from, -12);
  const nextYear = monthFirst(from, 12);
  const yearOf = (iso: string) => iso.slice(0, 4);
  const monthName = (iso: string) =>
    new Intl.DateTimeFormat("en-GB", { month: "long", timeZone: "UTC" }).format(
      new Date(`${iso}-01T00:00:00Z`),
    );
  const shortDate = (iso: string) =>
    new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(
      new Date(`${iso}T00:00:00Z`),
    );
  const today = new Date().toISOString().slice(0, 10);
  const q = (f: string) => `/calendar?view=year&propertyId=${propertyId}&from=${f}`;

  return (
    <div className="space-y-5" data-testid="calendar-year">
      <div className="flex flex-wrap items-center gap-2.5 text-[13px]">
        <CalendarViewSwitch active="year" propertyId={propertyId} labels={L} />
        <PropertySelect properties={properties} value={propertyId} label={L.propertiesLabel} />
        <Link
          href={q(prevYear)}
          className="inline-flex h-[34px] items-center rounded-full border border-border bg-surface px-3 font-semibold"
        >
          ‹ {yearOf(prevYear)}
        </Link>
        <Link
          href={q(nextYear)}
          className="inline-flex h-[34px] items-center rounded-full border border-border bg-surface px-3 font-semibold"
        >
          {yearOf(nextYear)} ›
        </Link>
        <span className="flex-1" />
        <span className="hidden text-muted xl:inline">{L.yearHint}</span>
        <Link
          href={`/calendar/settings?propertyId=${propertyId}`}
          className="inline-flex h-[34px] items-center rounded-full border border-border bg-surface px-3 font-semibold"
        >
          {L.pricingSettings}
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat
          label={L.next12}
          value={sellable === 0 ? "—" : percent(booked / sellable)}
          hint={L.occupancyOnBooks}
        />
        <Stat label={L.revenueOnBooks} value={money(d.year.revenueMinor, d.currency)} />
        <Stat
          label={L.nightsBlocked}
          value={String(blockedNights)}
          hint={d.year.blocked
            .map(
              (b) =>
                `${String(b.nights)} ${(L[`block_${b.reason}` as keyof CalendarLabels] ?? b.reason).toLowerCase()}`,
            )
            .join(", ")}
        />
        <Stat
          label={L.seasons}
          value={String(d.seasons.length)}
          hint={d.seasons.map((s) => s.name).join(" · ") || L.noSeasons}
        />
        <Stat
          label={L.priceTips}
          value={String(tipsCount)}
          hint={tipsCount === 0 ? L.noTipsYet : undefined}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {months.map((m) => {
          const list = byMonth.get(m.month) ?? [];
          const first = `${m.month}-01`;
          return (
            <Link
              key={m.month}
              href={`/calendar?view=strip&days=30&from=${first < today && today.startsWith(m.month) ? today : first}&propertyId=${propertyId}`}
              className="rounded-card border border-border bg-surface px-3 py-3.5 text-foreground no-underline hover:border-accent"
              data-testid="year-month"
            >
              <div className="mb-2 flex items-baseline justify-between">
                <strong className="text-[13px]">{monthName(m.month)}</strong>
                <span className="text-[11px] text-muted">
                  {m.occupancy === null ? "—" : percent(m.occupancy)} ·{" "}
                  {fmt(L.avg, { price: money(whole(m.averageRateMinor), d.currency) })}
                </span>
              </div>
              <div className="grid grid-cols-7 gap-[3px]">
                {Array.from({ length: mondayIndex(first) }, (_, i) => (
                  <span key={`l${String(i)}`} />
                ))}
                {list.map((n) => {
                  const season = seasonOn(n.date, d.seasons);
                  const full = n.sellable > 0 && n.booked >= n.sellable;
                  const closed = n.closed || n.sellable === 0;
                  return (
                    <span
                      key={n.date}
                      title={season ? `${shortDate(n.date)} · ${season.name}` : shortDate(n.date)}
                      className={`flex h-[22px] items-center justify-center rounded text-[9px] ${full ? "bg-accent text-accent-foreground" : n.booked > 0 ? "bg-teal-200 text-teal-900" : "border border-default text-muted"}`}
                      style={{
                        ...(closed && !full ? { backgroundImage: HATCH } : {}),
                        ...(season ? { boxShadow: `inset 0 -3px 0 ${season.colour}` } : {}),
                      }}
                    >
                      {Number(n.date.slice(8))}
                    </span>
                  );
                })}
              </div>
            </Link>
          );
        })}
      </div>

      <Card
        title={fmt(L.seasonsOf, { property: d.title })}
        actions={<AddSeasonForm propertyId={propertyId} labels={L} from={from} />}
      >
        {d.seasons.length === 0 ? (
          <p className="text-sm text-muted">{L.seasonsEmpty}</p>
        ) : (
          <Table>
            <THead>
              <Tr>
                <Th>{L.season}</Th>
                <Th>{L.dates}</Th>
                <Th>{L.basePrice}</Th>
                <Th>{L.weekendPrice}</Th>
                <Th>{L.minNights}</Th>
                <Th>
                  <span className="sr-only">{L.remove}</span>
                </Th>
              </Tr>
            </THead>
            <TBody>
              {d.seasons.map((s) => {
                const p = seasonPrices(nights, s.ranges);
                return (
                  <Tr key={s.id} data-testid="season-row">
                    <Td>
                      <span className="inline-flex items-center gap-2 font-semibold">
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ background: s.colour }}
                        />
                        {s.name}
                      </span>
                    </Td>
                    <Td>
                      {s.ranges.map((r) => `${shortDate(r.from)} → ${shortDate(r.to)}`).join(" · ")}
                    </Td>
                    <Td>{money(p.weekdayMinor, d.currency)}</Td>
                    <Td>{money(p.weekendMinor, d.currency)}</Td>
                    <Td>{p.minStay ?? "—"}</Td>
                    <Td className="text-end">
                      {s.propertyId ? (
                        <form action={removeSeasonAction}>
                          <input type="hidden" name="propertyId" value={propertyId} />
                          <input type="hidden" name="seasonId" value={s.id} />
                          <button
                            type="submit"
                            className="text-xs font-semibold text-muted hover:text-danger"
                          >
                            {L.remove}
                          </button>
                        </form>
                      ) : (
                        <span className="text-xs text-muted">{L.orgWide}</span>
                      )}
                    </Td>
                  </Tr>
                );
              })}
            </TBody>
          </Table>
        )}
        <p className="mt-3 text-xs text-muted">{L.seasonsNote}</p>
      </Card>
    </div>
  );
}
