/**
 * A booking's channel as the design shows it: a name and its brand colour as a dot
 * ("● Airbnb"). Channex's `ota_name` comes in several spellings; staff, phone and walk-in
 * bookings are direct.
 */
export interface ChannelLook {
  label: string;
  color: string;
  direct: boolean;
}

const KNOWN: Array<[RegExp, ChannelLook]> = [
  [/^airbnb/, { label: "Airbnb", color: "#ff385c", direct: false }],
  [/^booking/, { label: "Booking.com", color: "#003580", direct: false }],
  [/^expedia/, { label: "Expedia", color: "#fbc02d", direct: false }],
  [/^(vrbo|homeaway)/, { label: "Vrbo", color: "#3b5ba9", direct: false }],
  [
    /^(direct|staff|phone|walkin|website|bookingengine|be)$/,
    { label: "Direct", color: "#0f766e", direct: true },
  ],
];

export function channelLook(otaName: string | null | undefined): ChannelLook {
  const key = (otaName ?? "direct").toLowerCase().replace(/[^a-z]/g, "");
  for (const [re, look] of KNOWN) if (re.test(key)) return look;
  return { label: otaName ?? "—", color: "#94a3b8", direct: false };
}
