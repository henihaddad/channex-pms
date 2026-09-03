import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { SHIPPED_VIEWS, type ReservationFilters } from "@pms/db";
import {
  AnchorButton,
  Button,
  Card,
  Chip,
  DataTable,
  DateInput,
  FormRow,
  Input,
  LinkButton,
  PageHeader,
  Select,
  cn,
} from "@/components/ui";
import { guard } from "@/server/guard";
import { listReservations, saveViewAction } from "./reservations.actions";

const money = (minor: number, currency: string) =>
  new Intl.NumberFormat(undefined, { style: "currency", currency }).format(minor / 100);

export default async function ReservationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const t = await getTranslations("reservations");
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
  const { rows, total, views } = await guard(() => listReservations(filters));
  const qs = new URLSearchParams(
    Object.entries(sp).filter(([, v]) => v) as [string, string][],
  ).toString();
  const pill = (active: boolean) =>
    cn(
      "rounded-full px-3 py-1 text-xs font-medium transition-colors",
      active
        ? "bg-foreground text-background"
        : "bg-default text-foreground hover:bg-default-hover",
    );
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={t("title")}
        description={`${total} ${t("results")}`}
        actions={
          <>
            <LinkButton href="/reservations/unmapped" variant="secondary">
              {t("unmappedQueue")}
            </LinkButton>
            <LinkButton href="/reservations/new" variant="primary" data-testid="new-booking">
              {t("newBooking")}
            </LinkButton>
          </>
        }
      >
        <div className="flex flex-wrap gap-1.5" data-testid="shipped-views">
          {Object.keys(SHIPPED_VIEWS).map((v) => (
            <Link key={v} href={`/reservations?view=${v}`} className={pill(sp.view === v)}>
              {t(`views.${v}`)}
            </Link>
          ))}
          {views.map((v) => (
            <Link
              key={v.id}
              href={`/reservations?${new URLSearchParams(v.filters as Record<string, string>).toString()}`}
              className={cn(pill(false), "bg-accent-soft text-accent-soft-foreground")}
            >
              ★ {v.name}
            </Link>
          ))}
        </div>
      </PageHeader>

      <Card>
        <form method="get">
          <FormRow>
            <Select
              name="dateType"
              label={t("dateType")}
              defaultValue={sp.dateType ?? "arrival"}
              className="w-40"
            >
              <option value="arrival">{t("dateTypes.arrival")}</option>
              <option value="departure">{t("dateTypes.departure")}</option>
              <option value="stay">{t("dateTypes.stay")}</option>
              <option value="booked">{t("dateTypes.booked")}</option>
            </Select>
            <DateInput name="from" label={t("from")} defaultValue={sp.from} className="w-44" />
            <DateInput name="to" label={t("to")} defaultValue={sp.to} className="w-44" />
            <Input
              name="channel"
              placeholder={t("channel")}
              aria-label={t("channel")}
              defaultValue={sp.channel}
              className="w-40"
            />
            <Input
              name="q"
              placeholder={t("search")}
              aria-label={t("search")}
              defaultValue={sp.q}
              data-testid="search"
              className="w-64"
            />
            <Button type="submit" variant="secondary">
              {t("filter")}
            </Button>
            <AnchorButton href={`/api/v1/reservations/export?${qs}`}>CSV</AnchorButton>
          </FormRow>
        </form>
        <form action={saveViewAction} className="mt-3 flex flex-wrap items-center gap-2">
          <input
            type="hidden"
            name="filters"
            value={JSON.stringify(Object.fromEntries(Object.entries(sp).filter(([, v]) => v)))}
          />
          <Input
            name="name"
            placeholder={t("saveViewAs")}
            aria-label={t("saveViewAs")}
            className="w-64"
            variant="secondary"
          />
          <Button type="submit" variant="ghost" size="sm">
            {t("saveView")}
          </Button>
        </form>
      </Card>

      <Card>
        <DataTable
          testId="reservations-table"
          columns={[
            t("guest"),
            t("property"),
            t("dates"),
            t("channel"),
            t("status"),
            t("unit"),
            { label: t("total"), align: "end" },
            { label: t("balance"), align: "end" },
          ]}
          rowKey={(_, i) => rows[i]!.id}
          rows={rows.map((r) => [
            <span
              key="g"
              className="inline-flex flex-wrap items-center gap-1.5"
              data-booking={r.id}
            >
              <Link href={`/reservations/${r.id}`} className="font-medium hover:underline">
                {r.guestName}
              </Link>
              {r.unacknowledged ? (
                <Chip color="warning" size="sm">
                  {t("modified")}
                </Chip>
              ) : null}
              {r.mappingState !== "mapped" ? (
                <Chip color="danger" size="sm">
                  {t("unmapped")}
                </Chip>
              ) : null}
            </span>,
            r.propertyTitle,
            <span key="d" className="whitespace-nowrap tabular-nums">
              {r.arrivalDate} → {r.departureDate} <span className="text-muted">· {r.nights}n</span>
            </span>,
            <span key="c">
              {r.otaName ?? "—"} <span className="text-xs text-muted">{r.otaReservationCode}</span>
            </span>,
            <Chip key="s" color={r.status === "cancelled" ? "default" : "success"} size="sm">
              {r.status}
            </Chip>,
            <span key="u">
              {r.unitNames ?? (r.unassignedRooms > 0 ? t("unassigned") : "—")}
              {r.credentials > 0 ? " · 🔑" : ""}
            </span>,
            money(r.totalAmountMinor, r.currency),
            <span key="b" className={r.balanceMinor > 0 ? "text-danger" : "text-muted"}>
              {money(r.balanceMinor, r.currency)}
            </span>,
          ])}
          empty={t("noResults")}
          dense
        />
      </Card>
    </div>
  );
}
