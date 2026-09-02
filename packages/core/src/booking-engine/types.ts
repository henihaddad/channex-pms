import type { RateCell } from "../inventory/ari.js";

/** Spec 10 §10.2: what the guest asked for. */
export interface SearchQuery {
  arrivalDate: string;
  departureDate: string;
  adults: number;
  children: number;
  childAges?: number[];
  promoCode?: string | null;
}

/** One sellable room type × rate plan for the query, priced for the party (BE-1, BE-4). */
export interface Offer {
  propertyId: string;
  roomTypeId: string;
  roomTypeTitle: string;
  ratePlanId: string;
  ratePlanTitle: string;
  currency: string;
  nights: number;
  nightly: Record<string, number>;
  roomMinor: number;
  /** Rooms of this type left for every night of the stay, after bookings, blocks and holds. */
  available: number;
  directOnly: boolean;
  mealPlan: string | null;
}

export interface PromoCode {
  code: string;
  kind: "percent" | "amount";
  value: number;
  validFrom: string | null;
  validTo: string | null;
  stayFrom: string | null;
  stayTo: string | null;
  minNights: number | null;
  maxUses: number | null;
  uses: number;
  singleUse: boolean;
  active: boolean;
  propertyId: string | null;
}

export interface Extra {
  id: string;
  name: string;
  priceMinor: number;
  per: "stay" | "night" | "person";
}

export interface TaxRules {
  /** VAT-style percentage on room and extras, basis points. */
  vatBps: number;
  /** City or tourist tax per person per night, minor units. */
  cityTaxPerPersonNightMinor: number;
  /** Cap on taxed nights for the city tax (many cities cap at 7); null = uncapped. */
  cityTaxMaxNights: number | null;
}

export type GuaranteePolicy =
  | { kind: "card_on_file" }
  | { kind: "deposit_fixed"; amountMinor: number }
  | { kind: "deposit_percent"; percentBps: number }
  | { kind: "prepay" }
  | { kind: "pay_at_property" };

/** Everything itemised before payment (BE-1). */
export interface Quote {
  currency: string;
  nights: number;
  roomMinor: number;
  extrasMinor: number;
  extras: Array<{ id: string; name: string; quantity: number; amountMinor: number }>;
  discountMinor: number;
  promoCode: string | null;
  vatMinor: number;
  cityTaxMinor: number;
  totalMinor: number;
  dueNowMinor: number;
  dueNowLabel: string;
}

export interface Hold {
  id: string;
  roomTypeId: string;
  arrivalDate: string;
  departureDate: string;
  rooms: number;
  expiresAt: string;
  state: "held" | "converted" | "expired" | "released";
}

export interface SearchableRoomType {
  roomTypeId: string;
  title: string;
  maxOccupancy: number;
  /** availability_day.available per date (after bookings, blocks and holds). */
  availability: ReadonlyMap<string, number>;
  ratePlans: Array<{
    ratePlanId: string;
    title: string;
    currency: string;
    directOnly: boolean;
    mealPlan: string | null;
    cells: readonly RateCell[];
  }>;
}
