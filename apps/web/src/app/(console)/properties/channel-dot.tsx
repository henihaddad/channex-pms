/** Channel names as guests know them, from Channex adapter codes ("AirBNB" → "Airbnb"). */
const NAMES: Record<string, string> = {
  AirBNB: "Airbnb",
  BookingCom: "Booking.com",
  Expedia: "Expedia",
  VRBO: "Vrbo",
  Agoda: "Agoda",
  direct: "Direct",
};

/** The design's channel colours (lib.py `channel`). */
const COLOURS: Record<string, string> = {
  Airbnb: "#ff385c",
  "Booking.com": "#003580",
  Direct: "#0f766e",
  Expedia: "#fbc02d",
  Vrbo: "#3b5ba9",
};

export function channelName(code: string): string {
  return NAMES[code] ?? code;
}

/** A coloured dot and the channel's name, as the property cards and the detail page show them. */
export function ChannelDot({ code, label }: { code: string; label?: string }) {
  const name = label ?? channelName(code);
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap" data-channel={code}>
      <span
        aria-hidden="true"
        className="h-2 w-2 shrink-0 rounded-full"
        style={{ background: COLOURS[channelName(code)] ?? "var(--muted)" }}
      />
      {name}
    </span>
  );
}
