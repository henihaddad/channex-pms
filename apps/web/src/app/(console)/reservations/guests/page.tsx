import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import {
  AnchorButton,
  Card,
  Chip,
  Input,
  LinkButton,
  PageHeader,
  Stat,
  TBody,
  THead,
  Table,
  Td,
  Th,
  Tr,
  cn,
} from "@/components/ui";
import { dayMonth, money, percent } from "@/lib/format";
import { channelLook } from "@/lib/channel";
import { guard } from "@/server/guard";
import { loadGuests, type GuestPill } from "./guests.actions";

const PAGE = 50;
const PILLS: GuestPill[] = ["all", "returning", "emailable", "flagged"];

/**
 * Guests (design canvas, November 2026): who stayed, how often, where, what they are worth and
 * how they booked, with the win-back audience for direct bookings. Names as on the reservation
 * list; email and phone stay sealed here and leave only through the audited export.
 */
export default async function GuestsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const t = await getTranslations("reservations.guestsPage");
  const locale = await getLocale();
  const pill = (PILLS as string[]).includes(sp.pill ?? "") ? (sp.pill as GuestPill) : "all";
  const limit = Math.min(Math.max(Number(sp.limit) || PAGE, PAGE), 2000);
  const v = await guard(() => loadGuests({ pill, q: sp.q, limit }));
  const qs = (over: Record<string, string | undefined>) => {
    const p = new URLSearchParams(
      Object.entries({ pill: pill === "all" ? undefined : pill, q: sp.q, ...over }).filter(
        ([, x]) => x,
      ) as [string, string][],
    ).toString();
    return p ? `/reservations/guests?${p}` : "/reservations/guests";
  };
  const pillClass = (active: boolean) =>
    cn(
      "inline-flex h-8.5 items-center rounded-full px-3.5 text-[13px] font-semibold whitespace-nowrap",
      active
        ? "bg-foreground text-background"
        : "border border-border bg-surface text-muted hover:text-foreground",
    );
  const share = (n: number) => (v.kpi.guests > 0 ? percent(n / v.kpi.guests) : "—");

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={t("title")} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={t("kpi.guests")} value={v.kpi.guests} hint={t("kpi.guestsHint")} />
        <Stat label={t("kpi.returning")} value={v.kpi.returning} hint={share(v.kpi.returning)} />
        <Stat
          label={t("kpi.directAfterOta")}
          value={v.kpi.directAfterOta}
          hint={t("kpi.directAfterOtaHint")}
        />
        <Stat label={t("kpi.consent")} value={v.kpi.consent} hint={share(v.kpi.consent)} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {PILLS.map((p) => (
          <Link
            key={p}
            href={qs({ pill: p === "all" ? undefined : p, limit: undefined })}
            className={pillClass(pill === p)}
            aria-current={pill === p ? "true" : undefined}
          >
            {t(`pills.${p}`)}
          </Link>
        ))}
        <span className="flex-1" />
        <form method="get" className="flex items-center gap-2" role="search">
          {pill !== "all" ? <input type="hidden" name="pill" value={pill} /> : null}
          <Input
            name="q"
            defaultValue={sp.q}
            placeholder={t("search")}
            aria-label={t("search")}
            className="h-8.5 w-64"
          />
        </form>
        <AnchorButton href="/api/v1/guests/export" size="sm">
          {t("export")}
        </AnchorButton>
      </div>

      <Table data-testid="guests-table" className="min-w-[900px]">
        <THead>
          <Tr className="hover:bg-transparent">
            <Th>{t("col.guest")}</Th>
            <Th>{t("col.stays")}</Th>
            <Th>{t("col.properties")}</Th>
            <Th>{t("col.value")}</Th>
            <Th>
              <span className="sr-only">{t("col.status")}</span>
            </Th>
            <Th>{t("col.via")}</Th>
          </Tr>
        </THead>
        <TBody>
          {v.rows.length === 0 ? (
            <Tr>
              <Td colSpan={6} className="text-muted">
                {t("empty")}
              </Td>
            </Tr>
          ) : null}
          {v.rows.map((g) => (
            <Tr key={g.id} data-guest={g.id}>
              <Td>
                <Link
                  href={g.lastBookingId ? `/reservations/${g.lastBookingId}` : "/reservations"}
                  className="font-semibold text-foreground hover:underline"
                >
                  {g.name}
                </Link>
                <span className="block text-xs text-muted">
                  {[
                    g.hasEmail || g.hasPhone
                      ? t(
                          g.hasEmail && g.hasPhone
                            ? "contact.both"
                            : g.hasEmail
                              ? "contact.email"
                              : "contact.phone",
                        )
                      : t("contact.none"),
                    g.country,
                    g.language ? t("speaks", { language: g.language }) : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </Td>
              <Td className="tabular-nums">{g.stays}</Td>
              <Td>{g.properties.join(", ") || "—"}</Td>
              <Td className="tabular-nums">
                {g.value.map((x) => money(x.amountMinor, x.currency, locale)).join(" + ") || "—"}
              </Td>
              <Td>
                {g.inHouseBookingId ? (
                  <Chip color="info">{t("status.inHouse")}</Chip>
                ) : g.nextArrival ? (
                  <Chip color="info">
                    {t("status.arrives", { date: dayMonth(g.nextArrival, locale) })}
                  </Chip>
                ) : g.pinnedNote ? (
                  <Chip title={g.pinnedNote}>
                    {t("status.note", { note: g.pinnedNote.slice(0, 18) })}
                  </Chip>
                ) : g.lastRating !== null ? (
                  <Chip color="success">★ {g.lastRating.toFixed(1)}</Chip>
                ) : null}
              </Td>
              <Td>{[...new Set(g.channels.map((c) => channelLook(c).label))].join(", ") || "—"}</Td>
            </Tr>
          ))}
        </TBody>
      </Table>
      {v.matching > 0 ? (
        <p className="-mt-2 text-[13px] text-muted">
          {t("showing", { shown: v.rows.length, total: v.matching })}
          {v.rows.length < v.matching ? (
            <>
              {" · "}
              <Link
                href={qs({ limit: String(limit + PAGE) })}
                className="font-semibold text-accent hover:underline"
                scroll={false}
              >
                {t("loadMore")}
              </Link>
            </>
          ) : null}
        </p>
      ) : null}

      <Card title={t("winBack.title")} description={t("winBack.lead")}>
        <div className="flex flex-wrap items-center gap-3">
          <LinkButton href="/inbox/automation">{t("winBack.open")}</LinkButton>
          <span className="text-sm text-muted">{t("winBack.audience", { n: v.winBack })}</span>
        </div>
      </Card>
    </div>
  );
}
