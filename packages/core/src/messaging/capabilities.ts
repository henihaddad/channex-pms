import type { ChannelCapabilities } from "./types.js";

/**
 * What each channel's messaging API supports (spec 09 §9.2 "capability awareness").
 * The UI shows attachment upload, thread closing and Booking.com's "no reply needed"
 * only where the provider supports them; `direct` threads go out over our own mail.
 */
const CAPS: Record<string, ChannelCapabilities> = {
  booking_com: { attachments: true, closeThread: true, noReplyNeeded: true, messaging: true },
  airbnb: { attachments: true, closeThread: false, noReplyNeeded: false, messaging: true },
  expedia: { attachments: false, closeThread: true, noReplyNeeded: false, messaging: true },
  direct: { attachments: true, closeThread: true, noReplyNeeded: false, messaging: true },
};
const NONE: ChannelCapabilities = {
  attachments: false,
  closeThread: false,
  noReplyNeeded: false,
  messaging: false,
};

/** Channex OTA names ("Booking.com", "AirBNB") and our own codes normalise to one provider code. */
export function providerCode(name: string | null | undefined): string {
  const n = (name ?? "").trim().toLowerCase();
  if (n === "") return "direct";
  if (n.includes("booking")) return "booking_com";
  if (n.includes("airbnb")) return "airbnb";
  if (n.includes("expedia") || n.includes("hotels.com") || n.includes("vrbo")) return "expedia";
  if (n === "direct" || n === "staff" || n === "manual" || n === "website") return "direct";
  return n.replace(/[^a-z0-9]+/g, "_");
}

export function channelCapabilities(provider: string): ChannelCapabilities {
  return CAPS[providerCode(provider)] ?? NONE;
}
