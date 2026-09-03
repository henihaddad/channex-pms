import Link from "next/link";
import { getTranslations } from "next-intl/server";
import {
  Button,
  Card,
  DateInput,
  PageTitle,
  Select,
  TBody,
  THead,
  Table,
  Td,
  Th,
  Tr,
} from "@/components/ui";
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
          <p className="text-sm text-muted">{t("noHotel")}</p>
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
        <form method="get" className="flex flex-wrap items-end gap-2">
          <Select
            name="propertyId"
            defaultValue={propertyId}

            size="sm"
          >
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </Select>{" "}
          <DateInput name="date" defaultValue={date} className="w-44" />
          <Button type="submit" variant="secondary" size="sm">
            Go
          </Button>
        </form>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Card title={`${t("arrivals")} (${fd.today.arrivals.length})`}>
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
        <Card title={`${t("departures")} (${fd.today.departures.length})`}>
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
        <Card title={t("inHouse")}>
          <p className="text-3xl font-bold">{fd.today.inHouse}</p>
        </Card>
      </div>
      <Card title={t("roomRack")}>
        <div className="overflow-x-auto">
          <Table data-testid="room-rack">
            <THead>
              <Tr>
                <Th>Room</Th>
                {days.map((d) => (
                  <Th key={d} className="font-normal">
                    {d.slice(5)}
                  </Th>
                ))}
              </Tr>
            </THead>
            <TBody>
              {fd.rack.map((u) => (
                <Tr key={u.unitId}>
                  <Td>
                    {u.unitName} <span className="text-xs text-muted">{u.status}</span>
                  </Td>
                  {days.map((d) => {
                    const stay = u.stays.find((s) => s.from <= d && d < s.to);
                    const block = u.blocks.find((b) => b.from <= d && d < b.to);
                    const cls = block
                      ? "bg-separator-tertiary"
                      : stay
                        ? stay.from === d
                          ? "bg-accent/30"
                          : stay.to === shiftDay(d)
                            ? "bg-success/30"
                            : "bg-success-soft"
                        : u.status === "dirty"
                          ? "bg-warning-soft"
                          : "";
                    return (
                      <Td
                        key={d}
                        className={`h-6 w-10 border text-center ${cls}`}
                        title={stay ? `${stay.guest} ${stay.state}` : (block?.reason ?? "")}
                      >
                        {stay ? stay.guest.slice(0, 3) : block ? "✕" : ""}
                      </Td>
                    );
                  })}
                </Tr>
              ))}
            </TBody>
          </Table>
        </div>
        <p className="mt-1 text-xs text-muted">
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
