import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Card, PageTitle } from "@/components/ui";
import { guard } from "@/server/guard";
import { listProperties } from "../properties/properties.actions";
import { loadFrontDesk } from "../operations/operations.actions";

/** Front desk (spec 08 §8.10): hotel-kind properties only; an STR portfolio never sees one. */
export default async function FrontDeskPage({
  searchParams,
}: {
  searchParams: Promise<{ propertyId?: string; date?: string }>;
}) {
  const sp = await searchParams;
  const t = await getTranslations("operations");
  const properties = (await guard(() => listProperties())).filter((p) => p.kind === "hotel");
  const propertyId = sp.propertyId ?? properties[0]?.id;
  const date = sp.date ?? new Date().toISOString().slice(0, 10);
  if (!propertyId)
    return (
      <div className="space-y-4">
        <PageTitle>{t("frontDesk")}</PageTitle>
        <Card>
          <p className="text-sm text-slate-500">{t("noHotel")}</p>
        </Card>
      </div>
    );
  const fd = await guard(() => loadFrontDesk({ propertyId, date }));
  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(`${date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  });
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <PageTitle>{t("frontDesk")}</PageTitle>
        <form method="get" className="text-sm">
          <select
            name="propertyId"
            defaultValue={propertyId}
            className="h-8 rounded border border-slate-300"
          >
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>{" "}
          <input
            type="date"
            name="date"
            defaultValue={date}
            className="h-8 rounded border border-slate-300"
          />{" "}
          <button className="underline">Go</button>
        </form>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <h2 className="font-semibold">
            {t("arrivals")} ({fd.today.arrivals.length})
          </h2>
          <ul className="text-sm">
            {fd.today.arrivals.map((a) => (
              <li key={a.bookingId}>
                <Link href={`/reservations/${a.bookingId}`} className="hover:underline">
                  {a.guest}
                </Link>{" "}
                · {a.unitName ?? t("unassigned")} · unit {a.unitStatus ?? "?"}
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <h2 className="font-semibold">
            {t("departures")} ({fd.today.departures.length})
          </h2>
          <ul className="text-sm">
            {fd.today.departures.map((a) => (
              <li key={a.bookingId}>
                <Link href={`/reservations/${a.bookingId}`} className="hover:underline">
                  {a.guest}
                </Link>{" "}
                · {a.unitName ?? "—"}
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <h2 className="font-semibold">{t("inHouse")}</h2>
          <p className="text-3xl font-bold">{fd.today.inHouse}</p>
        </Card>
      </div>
      <Card>
        <h2 className="mb-2 font-semibold">{t("roomRack")}</h2>
        <div className="overflow-x-auto">
          <table className="text-xs" data-testid="room-rack">
            <thead>
              <tr>
                <th className="pe-2 text-start">Room</th>
                {days.map((d) => (
                  <th key={d} className="px-1 font-normal text-slate-500">
                    {d.slice(5)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {fd.rack.map((u) => (
                <tr key={u.unitId} className="border-t border-slate-100">
                  <td className="pe-2 py-1 font-medium">
                    {u.unitName} <span className="text-[10px] text-slate-400">{u.status}</span>
                  </td>
                  {days.map((d) => {
                    const stay = u.stays.find((s) => s.from <= d && d < s.to);
                    const block = u.blocks.find((b) => b.from <= d && d < b.to);
                    const cls = block
                      ? "bg-slate-300"
                      : stay
                        ? stay.from === d
                          ? "bg-sky-200"
                          : stay.to === shiftDay(d)
                            ? "bg-emerald-200"
                            : "bg-emerald-100"
                        : u.status === "dirty"
                          ? "bg-amber-50"
                          : "";
                    return (
                      <td
                        key={d}
                        className={`h-6 w-10 border border-slate-100 text-center ${cls}`}
                        title={stay ? `${stay.guest} ${stay.state}` : (block?.reason ?? "")}
                      >
                        {stay ? stay.guest.slice(0, 3) : block ? "✕" : ""}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-1 text-[11px] text-slate-500">
          blue arriving · green in house · light green departing · grey blocked · amber dirty
        </p>
      </Card>
    </div>
  );
}
function shiftDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
