import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { SHIPPED_VIEWS, type ReservationFilters } from "@pms/db";
import { Button, Card, Input, PageTitle, Select } from "@/components/ui";
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
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <PageTitle>{t("title")}</PageTitle>
        <div className="flex gap-2">
          <Link href="/reservations/unmapped">
            <Button variant="secondary">{t("unmappedQueue")}</Button>
          </Link>
          <Link href="/reservations/new">
            <Button data-testid="new-booking">{t("newBooking")}</Button>
          </Link>
        </div>
      </div>
      <div className="flex flex-wrap gap-1 text-xs" data-testid="shipped-views">
        {Object.keys(SHIPPED_VIEWS).map((v) => (
          <Link
            key={v}
            href={`/reservations?view=${v}`}
            className={`rounded-full border px-3 py-1 ${sp.view === v ? "border-emerald-600 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-white"}`}
          >
            {t(`views.${v}`)}
          </Link>
        ))}
        {views.map((v) => (
          <Link
            key={v.id}
            href={`/reservations?${new URLSearchParams(v.filters as Record<string, string>).toString()}`}
            className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-sky-800"
          >
            ★ {v.name}
          </Link>
        ))}
      </div>
      <Card>
        <form method="get" className="grid grid-cols-6 items-end gap-2 text-sm">
          <Select name="dateType" defaultValue={sp.dateType ?? "arrival"}>
            <option value="arrival">Arrival</option>
            <option value="departure">Departure</option>
            <option value="stay">Stay</option>
            <option value="booked">Booked</option>
          </Select>
          <Input name="from" type="date" defaultValue={sp.from} />
          <Input name="to" type="date" defaultValue={sp.to} />
          <Input name="channel" placeholder="Channel" defaultValue={sp.channel} />
          <Input name="q" placeholder={t("search")} defaultValue={sp.q} data-testid="search" />
          <div className="flex gap-2">
            <Button type="submit" variant="secondary">
              {t("filter")}
            </Button>
            <a href={`/api/v1/reservations/export?${qs}`}>
              <Button type="button" variant="secondary">
                CSV
              </Button>
            </a>
          </div>
        </form>
        <form action={saveViewAction} className="mt-2 flex items-center gap-2 text-xs">
          <input
            type="hidden"
            name="filters"
            value={JSON.stringify(Object.fromEntries(Object.entries(sp).filter(([, v]) => v)))}
          />
          <Input name="name" placeholder={t("saveViewAs")} className="h-8 max-w-xs" />
          <Button type="submit" variant="secondary" className="h-8">
            {t("saveView")}
          </Button>
        </form>
      </Card>
      <Card>
        <p className="mb-2 text-xs text-slate-500">
          {total} {t("results")}
        </p>
        <table className="w-full text-sm" data-testid="reservations-table">
          <thead className="text-xs uppercase text-slate-500">
            <tr>
              <th className="py-1 text-start">{t("guest")}</th>
              <th className="text-start">{t("property")}</th>
              <th className="text-start">{t("dates")}</th>
              <th className="text-start">{t("channel")}</th>
              <th className="text-start">{t("status")}</th>
              <th className="text-start">{t("unit")}</th>
              <th className="text-end">{t("total")}</th>
              <th className="text-end">{t("balance")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-slate-100" data-booking={r.id}>
                <td className="py-2">
                  <Link href={`/reservations/${r.id}`} className="font-medium hover:underline">
                    {r.guestName}
                  </Link>
                  {r.unacknowledged ? (
                    <span className="ms-2 rounded bg-amber-100 px-1.5 text-[10px] text-amber-800">
                      {t("modified")}
                    </span>
                  ) : null}
                  {r.mappingState !== "mapped" ? (
                    <span className="ms-2 rounded bg-rose-100 px-1.5 text-[10px] text-rose-800">
                      {t("unmapped")}
                    </span>
                  ) : null}
                </td>
                <td className="text-slate-600">{r.propertyTitle}</td>
                <td className="text-slate-600">
                  {r.arrivalDate} → {r.departureDate} · {r.nights}n
                </td>
                <td className="text-slate-600">
                  {r.otaName ?? "—"}{" "}
                  <span className="text-xs text-slate-400">{r.otaReservationCode}</span>
                </td>
                <td>
                  <span
                    className={`rounded px-1.5 py-0.5 text-xs ${r.status === "cancelled" ? "bg-slate-100 text-slate-600" : "bg-emerald-100 text-emerald-800"}`}
                  >
                    {r.status}
                  </span>
                </td>
                <td className="text-xs text-slate-600">
                  {r.unitNames ?? (r.unassignedRooms > 0 ? t("unassigned") : "—")}
                  {r.credentials > 0 ? " · 🔑" : ""}
                </td>
                <td className="text-end">{money(r.totalAmountMinor, r.currency)}</td>
                <td
                  className={`text-end ${r.balanceMinor > 0 ? "text-rose-700" : "text-slate-600"}`}
                >
                  {money(r.balanceMinor, r.currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
