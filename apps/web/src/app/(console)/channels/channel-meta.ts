/** The channels a host recognises, in the order the design shows them, with their brand dot colour. */
export const CHANNELS = [
  {
    key: "airbnb",
    name: "Airbnb",
    color: "#ff385c",
    match: (code: string) => /airbnb/i.test(code),
  },
  {
    key: "booking",
    name: "Booking.com",
    color: "#003580",
    match: (code: string) => /booking/i.test(code),
  },
  { key: "direct", name: "Direct", color: "#0f766e", match: () => false },
  {
    key: "expedia",
    name: "Expedia",
    color: "#fbc02d",
    match: (code: string) => /expedia/i.test(code),
  },
  {
    key: "vrbo",
    name: "Vrbo",
    color: "#3b5ba9",
    match: (code: string) => /vrbo|homeaway/i.test(code),
  },
] as const;

export type ChannelKey = (typeof CHANNELS)[number]["key"] | "other";

export function channelOf(adapterCode: string): { key: ChannelKey; name: string; color: string } {
  const hit = CHANNELS.find((c) => c.match(adapterCode));
  return hit
    ? { key: hit.key, name: hit.name, color: hit.color }
    : { key: "other", name: adapterCode, color: "#4b5553" };
}
