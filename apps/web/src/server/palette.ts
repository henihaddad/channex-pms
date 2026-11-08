import type { ReservationRow } from "@pms/db";
import { channelLabel, daysFrom, dayMonth, money } from "@/lib/format";

export interface PaletteHit {
  id: string;
  title: string;
  /** Text after the bold title on the same line ("Alfama Loft · 14–17 Nov"). */
  inline?: string;
  subtitle: string;
  href: string;
  /** Two letters for the avatar. */
  initials?: string;
  /** The guest's name, for the contextual actions ("Reply to Ana Silva"). */
  guestName?: string;
  /** The property id, for "Calendar · <property>". */
  propertyId?: string;
}

export interface PaletteResults {
  reservations: PaletteHit[];
  properties: PaletteHit[];
}

export interface PaletteRowLabels {
  arrivesIn: (n: number) => string;
  arrivesToday: string;
  inHouse: string;
  checkedOut: string;
  confirmed: string;
  cancelled: string;
  due: (amount: string) => string;
  direct: string;
  live: string;
}

/** The palette's rows (design canvas ⌘K board): who, where and when, then channel, reference and what is open. */
export function paletteRows(
  query: string,
  reservations: ReservationRow[],
  properties: Array<{ id: string; title: string; state: string }>,
  today: string,
  L: PaletteRowLabels,
): PaletteResults {
  const needle = query.toLowerCase();
  return {
    reservations: reservations.map((r) => {
      const until = daysFrom(today, r.arrivalDate);
      const left = daysFrom(today, r.departureDate);
      const when =
        r.status === "cancelled"
          ? null
          : until > 0
            ? L.arrivesIn(until)
            : until === 0
              ? L.arrivesToday
              : left > 0
                ? L.inHouse
                : L.checkedOut;
      const bits = [
        channelLabel(r.otaName, L.direct),
        r.otaReservationCode,
        r.status === "cancelled" ? L.cancelled : L.confirmed,
        r.balanceMinor > 0 ? L.due(money(r.balanceMinor, r.currency)) : when,
      ].filter(Boolean);
      return {
        id: r.id,
        title: r.guestName,
        inline: `${r.propertyTitle} · ${dayMonth(r.arrivalDate)}–${dayMonth(r.departureDate)}`,
        subtitle: bits.join(" · "),
        href: `/reservations/${r.id}`,
        initials: r.guestName
          .split(/\s+/)
          .filter(Boolean)
          .map((w) => w[0] ?? "")
          .join("")
          .slice(0, 2)
          .toUpperCase(),
        guestName: r.guestName,
        propertyId: r.propertyId,
      };
    }),
    properties: properties
      .filter((p) =>
        needle.split(/\s+/).some((w) => w.length >= 2 && p.title.toLowerCase().includes(w)),
      )
      .slice(0, 5)
      .map((p) => ({
        id: p.id,
        title: p.title,
        subtitle: p.state === "live" ? L.live : p.state,
        href: `/properties/${p.id}`,
        propertyId: p.id,
      })),
  };
}
