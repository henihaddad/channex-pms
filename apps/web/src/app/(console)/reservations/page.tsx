import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { bookingBalance, stayPhase, stayStatus } from "@pms/core";
import { LIST_PILLS, SHIPPED_VIEWS, type ReservationFilters } from "@pms/db";
import {
  AnchorButton,
  Button,
  Card,
  DateInput,
  FormRow,
  Input,
  LinkButton,
  PageHeader,
  Select,
  TBody,
  THead,
  Table,
  Td,
  Th,
  Tr,
  cn,
} from "@/components/ui";
import { money, nightsBetween, stay } from "@/lib/format";
import { guard } from "@/server/guard";
import { listReservations, saveViewAction } from "./reservations.actions";
import { BalanceWords, ChannelDot, StatusChip, partyWords, phaseWords } from "./words";

const PAGE = 50;

/**
 * Reservations (spec 08 §8.1, design canvas November 2026): four filters with their counts,
 * the rest behind "More filters", and a table that reads in words: who, where, when, through
 * which channel, what state it is in and what is owed.
 */
export default async function ReservationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const t = await getTranslations("reservations");
  const locale = await getLocale();
  const limit = Math.min(Math.max(Number(sp.limit) || PAGE, PAGE), 1000);
  const filters: ReservationFilters = {
    view: sp.view,
    dateType: sp.dateType as ReservationFilters["dateType"],
    from: sp.from,
    to: sp.to,
    propertyId: sp.propertyId,
    channel: sp.channel,
    status: sp.status,
    mappingState: sp.mappingState,
    q: sp.q,
    unassigned: sp.unassigned === "1",
    noAccessCode: sp.noAccessCode === "1",
  };
  for (const k of Object.keys(filters) as (keyof ReservationFilters)[])
    if (filters[k] === undefined || filters[k] === "" || filters[k] === false) delete filters[k];
  const { rows, total, views, pills, today } = await guard(() =>
    listReservations({ ...filters, limit }),
  );
  const params = (over: Record<string, string | undefined>) => {
    const next = new URLSearchParams(
      Object.entries({ ...sp, ...over }).filter(([, v]) => v) as [string, string][],
    );
    const s = next.toString();
    return s ? `/reservations?${s}` : "/reservations";
  };
  const exportQs = new URLSearchParams(
    Object.entries(filters).map(([k, v]) => [k, String(v)]),
  ).toString();
  const filtersOpen =
    sp.filters === "1" || Boolean(sp.dateType ?? sp.from ?? sp.to ?? sp.channel ?? sp.q);
  const pill = (active: boolean) =>
    cn(
      "inline-flex h-8.5 items-center rounded-full px-3.5 text-[13px] font-semibold whitespace-nowrap transition-colors",
      active
        ? "bg-foreground text-background"
        : "border border-border bg-surface text-muted hover:text-foreground",
    );

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={t("title")}
        actions={
          <LinkButton href="/reservations/new" variant="primary" data-testid="new-booking">
            + {t("newReservation")}
          </LinkButton>
        }
      >
        <div className="flex flex-wrap items-center gap-2" data-testid="list-pills">
          {LIST_PILLS.map((v) => (
            <Link
              key={v}
              href={sp.view === v ? "/reservations" : `/reservations?view=${v}`}
              className={pill(sp.view === v)}
              aria-current={sp.view === v ? "true" : undefined}
              data-pill={v}
            >
              {t(`pills.${v}`)}
              {v !== "cancelled" && pills[v] > 0 ? (
                <span className="tabular-nums">&nbsp;· {pills[v]}</span>
              ) : null}
            </Link>
          ))}
          {sp.view && !(LIST_PILLS as readonly string[]).includes(sp.view) ? (
            <Link href="/reservations" className={pill(true)}>
              {t(`views.${sp.view}`)} ✕
            </Link>
          ) : null}
          {sp.q ? (
            <Link href={params({ q: undefined })} className={pill(true)}>
              “{sp.q}” ✕
            </Link>
          ) : null}
          <span className="flex-1" />
          <Link
            href={params({ filters: filtersOpen ? undefined : "1" })}
            className="text-[13px] font-semibold text-muted hover:text-foreground"
            aria-expanded={filtersOpen}
          >
            {t("moreFilters")}
          </Link>
          <AnchorButton
            href={`/api/v1/reservations/export${exportQs ? `?${exportQs}` : ""}`}
            size="sm"
          >
            {t("exportCsv")}
          </AnchorButton>
        </div>
      </PageHeader>

      {filtersOpen ? (
        <Card>
          <form method="get" className="flex flex-col gap-4">
            <input type="hidden" name="filters" value="1" />
            {sp.view ? <input type="hidden" name="view" value={sp.view} /> : null}
            <FormRow>
              <Input
                name="q"
                placeholder={t("search")}
                aria-label={t("search")}
                defaultValue={sp.q}
                data-testid="search"
                className="w-full sm:w-72"
              />
              <Select
                name="dateType"
                aria-label={t("dateType")}
                defaultValue={sp.dateType ?? "arrival"}
                className="w-40"
              >
                <option value="arrival">{t("dateTypes.arrival")}</option>
                <option value="departure">{t("dateTypes.departure")}</option>
                <option value="stay">{t("dateTypes.stay")}</option>
                <option value="booked">{t("dateTypes.booked")}</option>
              </Select>
              <DateInput
                name="from"
                aria-label={t("from")}
                defaultValue={sp.from}
                className="w-44"
              />
              <DateInput name="to" aria-label={t("to")} defaultValue={sp.to} className="w-44" />
              <Input
                name="channel"
                placeholder={t("channel")}
                aria-label={t("channel")}
                defaultValue={sp.channel}
                className="w-40"
              />
              <Button type="submit" variant="secondary">
                {t("filter")}
              </Button>
            </FormRow>
            <div className="flex flex-wrap gap-1.5" data-testid="shipped-views">
              {Object.keys(SHIPPED_VIEWS)
                .filter((v) => !(LIST_PILLS as readonly string[]).includes(v))
                .map((v) => (
                  <Link
                    key={v}
                    href={`/reservations?view=${v}&filters=1`}
                    className={cn(
                      "rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap",
                      sp.view === v
                        ? "bg-foreground text-background"
                        : "bg-default text-foreground hover:bg-border",
                    )}
                  >
                    {t(`views.${v}`)}
                  </Link>
                ))}
              {views.map((v) => (
                <Link
                  key={v.id}
                  href={`/reservations?${new URLSearchParams(v.filters as Record<string, string>).toString()}`}
                  className="rounded-full bg-accent-soft px-3 py-1 text-xs font-medium text-accent-soft-foreground"
                >
                  ★ {v.name}
                </Link>
              ))}
            </div>
          </form>
          {Object.keys(filters).length > 0 ? (
            <form action={saveViewAction} className="mt-3 flex flex-wrap items-center gap-2">
              <input
                type="hidden"
                name="filters"
                value={JSON.stringify(
                  Object.fromEntries(
                    Object.entries(sp).filter(([k, v]) => v && k !== "filters" && k !== "limit"),
                  ),
                )}
              />
              <Input
                name="name"
                placeholder={t("saveViewAs")}
                aria-label={t("saveViewAs")}
                className="w-64"
              />
              <Button type="submit" variant="ghost" size="sm">
                {t("saveView")}
              </Button>
            </form>
          ) : null}
        </Card>
      ) : null}

      <Table data-testid="reservations-table" className="min-w-[980px]">
        <THead>
          <Tr className="hover:bg-transparent">
            <Th>{t("guest")}</Th>
            <Th>{t("property")}</Th>
            <Th>{t("stayColumn")}</Th>
            <Th>{t("channel")}</Th>
            <Th>{t("status")}</Th>
            <Th className="text-end">{t("total")}</Th>
            <Th className="text-end">{t("balance")}</Th>
          </Tr>
        </THead>
        <TBody>
          {rows.length === 0 ? (
            <Tr>
              <Td colSpan={7} className="text-muted">
                <p className="font-semibold text-foreground">{t("noResults")}</p>
                <p>{t("noResultsHint")}</p>
              </Td>
            </Tr>
          ) : null}
          {rows.map((r) => {
            const status = stayStatus({
              status: r.status,
              mappingState: r.mappingState,
              unassignedRooms: r.unassignedRooms,
              unacknowledged: r.unacknowledged,
              stayStates: r.stayStates,
            });
            const balance = bookingBalance({
              status: r.status,
              paymentCollect: r.paymentCollect,
              totalMinor: Number(r.totalAmountMinor),
              roomChargesMinor: r.roomChargesMinor,
              otherChargesMinor: r.otherChargesMinor,
              paidMinor: r.paidMinor,
            });
            const nights = nightsBetween(r.arrivalDate, r.departureDate);
            return (
              <Tr
                key={r.id}
                data-row-status={status}
                className={cn(status === "needs_room" && "bg-warning-soft/40")}
              >
                <Td>
                  <span data-booking={r.id} className="block">
                    <Link
                      href={`/reservations/${r.id}`}
                      className="font-semibold text-foreground hover:underline"
                    >
                      {r.guestFullName}
                    </Link>
                  </span>
                  <span className="block text-xs text-muted">
                    {partyWords(r.adults, r.children, t)}
                    {r.otaReservationCode ? ` · ${r.otaReservationCode}` : ""}
                  </span>
                </Td>
                <Td>
                  {status === "needs_room" ? (
                    <>
                      <span className="block font-semibold text-warning-soft-foreground">
                        {t("stayStatus.needs_room_short")}
                      </span>
                      <span className="block text-xs text-muted">{r.propertyTitle}</span>
                    </>
                  ) : (
                    <>
                      {r.propertyTitle}
                      {r.unitNames ? ` · ${r.unitNames}` : ""}
                    </>
                  )}
                </Td>
                <Td className="whitespace-nowrap">
                  {stay(r.arrivalDate, r.departureDate, locale)}
                  <span className="block text-xs text-muted">
                    {t("nights", { n: nights })}
                    {status === "cancelled"
                      ? ""
                      : status === "checked_in"
                        ? ` · ${t("phase.inHouse")}`
                        : ` · ${phaseWords(stayPhase(today, r.arrivalDate, r.departureDate), t)}`}
                  </span>
                </Td>
                <Td>
                  <ChannelDot otaName={r.otaName} />
                </Td>
                <Td>
                  <StatusChip status={status} t={t} />
                </Td>
                <Td className="text-end tabular-nums">
                  {money(Number(r.totalAmountMinor), r.currency, locale)}
                </Td>
                <Td className="text-end tabular-nums">
                  <BalanceWords balance={balance} currency={r.currency} otaName={r.otaName} t={t} />
                </Td>
              </Tr>
            );
          })}
        </TBody>
      </Table>
      {total > 0 ? (
        <p className="-mt-2 text-[13px] text-muted" data-testid="list-footer">
          {t("showing", { shown: rows.length, total })}
          {rows.length < total ? (
            <>
              {" · "}
              <Link
                href={params({ limit: String(limit + PAGE) })}
                className="font-semibold text-accent hover:underline"
                scroll={false}
              >
                {t("loadMore")}
              </Link>
            </>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
