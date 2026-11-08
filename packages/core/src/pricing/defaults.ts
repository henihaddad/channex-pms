import { Money } from "../shared/money.js";

/**
 * Pricing defaults per property (spec 06 §6.6, "Pricing & availability"): what each OTA
 * adds on top of the local rate, how a sent price is rounded, and the length-of-stay and
 * booking-window discounts. Local state stays authoritative (rule 6): these are settings
 * kept with the property; nothing here talks to a channel.
 *
 * Persona: the `revenue_manager` of spec 02 and the owner-operator who prices by hand.
 */

/** The channels a markup can be set for. Direct always sells at the local price. */
export const OTA_CHANNELS = ["airbnb", "booking_com", "vrbo", "expedia"] as const;
export type OtaChannel = (typeof OTA_CHANNELS)[number];
export type ChannelKey = OtaChannel | "direct" | "other";

/** How a price with a markup is rounded before it is shown or sent. */
export const PRICE_ROUNDINGS = ["none", "unit", "five"] as const;
export type PriceRounding = (typeof PRICE_ROUNDINGS)[number];

export interface PricingDiscounts {
  /** Basis points off for stays of 7 nights or more (800 = 8 %). */
  weeklyBps: number | null;
  /** Basis points off for stays of 28 nights or more. */
  monthlyBps: number | null;
  earlyBirdBps: number | null;
  /** Booked at least this many days ahead. */
  earlyBirdDays: number;
  lastMinuteBps: number | null;
  /** Booked at most this many days ahead. */
  lastMinuteDays: number;
}

export interface PricingDefaults {
  /** Basis points added per OTA (1550 = +15.5 %). A missing channel adds nothing. */
  markupBps: Partial<Record<OtaChannel, number>>;
  rounding: PriceRounding;
  discounts: PricingDiscounts;
}

export const DEFAULT_PRICING: PricingDefaults = {
  markupBps: {},
  rounding: "unit",
  discounts: {
    weeklyBps: null,
    monthlyBps: null,
    earlyBirdBps: null,
    earlyBirdDays: 90,
    lastMinuteBps: null,
    lastMinuteDays: 3,
  },
};

/** A markup above 100 % or a discount above 90 % is a typo, not a strategy. */
export const MAX_MARKUP_BPS = 10_000;
export const MAX_DISCOUNT_BPS = 9_000;

const bps = (v: unknown, max: number): number | null =>
  typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= max ? v : null;
const days = (v: unknown, fallback: number): number =>
  typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 730 ? v : fallback;

/**
 * Read stored settings defensively: anything missing or out of range falls back to the
 * default, so a hand-edited or older row can never produce a negative or absurd price.
 */
export function parsePricingDefaults(raw: unknown): PricingDefaults {
  const o = (raw ?? {}) as Record<string, unknown>;
  const m = (o.markupBps ?? {}) as Record<string, unknown>;
  const markupBps: Partial<Record<OtaChannel, number>> = {};
  for (const ch of OTA_CHANNELS) {
    const v = bps(m[ch], MAX_MARKUP_BPS);
    if (v !== null) markupBps[ch] = v;
  }
  const d = (o.discounts ?? {}) as Record<string, unknown>;
  const D = DEFAULT_PRICING.discounts;
  return {
    markupBps,
    rounding: PRICE_ROUNDINGS.includes(o.rounding as PriceRounding)
      ? (o.rounding as PriceRounding)
      : DEFAULT_PRICING.rounding,
    discounts: {
      weeklyBps: bps(d.weeklyBps, MAX_DISCOUNT_BPS),
      monthlyBps: bps(d.monthlyBps, MAX_DISCOUNT_BPS),
      earlyBirdBps: bps(d.earlyBirdBps, MAX_DISCOUNT_BPS),
      earlyBirdDays: days(d.earlyBirdDays, D.earlyBirdDays),
      lastMinuteBps: bps(d.lastMinuteBps, MAX_DISCOUNT_BPS),
      lastMinuteDays: days(d.lastMinuteDays, D.lastMinuteDays),
    },
  };
}

/**
 * "+15.5%", "−8 %", "8,5" → basis points (1550, 800, 850), read exactly as typed with no
 * floats; the sign is ignored because the field says whether it adds or takes off. Empty or
 * unreadable is null, meaning "not set".
 */
export function parsePercentBps(text: string | null | undefined): number | null {
  const v = (text ?? "").replace(/[\s%+−-]/g, "").replace(",", ".");
  const m = /^(\d{1,5})(?:\.(\d{1,2}))?$/.exec(v);
  return m ? Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0")) : null;
}

/**
 * Which channel a booking or connection belongs to, from whatever name the OTA or the
 * adapter uses ("Booking.com", "BookingCom", "AirBNB", "Offline"...). Staff, website and
 * empty sources are direct.
 */
export function channelKey(raw: string | null | undefined): ChannelKey {
  const s = (raw ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (["", "direct", "staff", "manual", "website", "phone", "walkin", "offline", "be"].includes(s))
    return "direct";
  if (s.includes("booking")) return "booking_com";
  if (s.includes("airbnb")) return "airbnb";
  if (s.includes("vrbo") || s.includes("homeaway")) return "vrbo";
  if (s.includes("expedia") || s.includes("hotelscom")) return "expedia";
  return "other";
}

/**
 * What the guest sees on a channel: the local rate plus that channel's markup, rounded
 * the way the property asked. Half-up, so a markup never rounds a price below the local
 * rate; rounding to whole units never goes below the exact marked-up amount either.
 */
export function guestPrice(
  rate: Money,
  markupBps: number,
  rounding: PriceRounding = "unit",
): Money {
  const raised = rate.multiply(10_000 + markupBps, 10_000, "half-up");
  if (rounding === "none" || markupBps === 0) return raised;
  const unit = 10 ** Money.exponent(rate.currency) * (rounding === "five" ? 5 : 1);
  const up = Math.ceil(raised.minor / unit) * unit;
  return Money.of(up, rate.currency);
}
