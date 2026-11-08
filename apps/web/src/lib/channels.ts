import { channelKey, type ChannelKey } from "@pms/core";

/**
 * How a channel reads and looks on screen (design canvas, lib.py `channel`): its name and
 * its colour, the same on a booking bar, a chip or a dot.
 */
const NAME: Record<ChannelKey, string> = {
  airbnb: "Airbnb",
  booking_com: "Booking.com",
  vrbo: "Vrbo",
  expedia: "Expedia",
  direct: "Direct",
  other: "Other",
};
const COLOUR: Record<ChannelKey, string> = {
  airbnb: "#ff385c",
  booking_com: "#003580",
  vrbo: "#3b5ba9",
  expedia: "#fbc02d",
  direct: "#0f766e",
  other: "#4b5553",
};
/** Text on the channel colour: dark on Expedia's yellow, white elsewhere. */
const INK: Record<ChannelKey, string> = { ...mapAll("#ffffff"), expedia: "#141716" };
function mapAll(v: string): Record<ChannelKey, string> {
  return { airbnb: v, booking_com: v, vrbo: v, expedia: v, direct: v, other: v };
}

export { channelKey };
/** "Airbnb", "Booking.com", "Direct"; an unknown OTA keeps its own name. */
export function channelName(raw: string | null | undefined): string {
  const k = channelKey(raw);
  return k === "other" && raw ? raw : NAME[k];
}
export const channelNameOf = (k: ChannelKey): string => NAME[k];
export const channelColour = (raw: string | null | undefined): string => COLOUR[channelKey(raw)];
export const channelInk = (raw: string | null | undefined): string => INK[channelKey(raw)];
