import type { Id } from "../shared/id.js";

export type TaskType = "changeover" | "departure" | "mid_stay" | "deep" | "inspection" | "linen";
export type TaskState =
  "planned" | "assigned" | "accepted" | "on_site" | "done" | "inspected" | "cancelled";

/** A stay on a unit, the input of turnover planning (spec 08 §8.6). */
export interface Stay {
  bookingId: string;
  unitId: string;
  arrivalDate: string;
  departureDate: string;
  status: "new" | "modified" | "cancelled";
}

/** What planning produces: one task per (unit, date, type) (spec 03 §3.6 TurnoverTask). */
export interface PlannedTask {
  unitId: string;
  date: string;
  type: TaskType;
  /** Local times "HH:MM" on `date`; the hard window for same-day changeovers. */
  windowFrom: string;
  windowTo: string;
  isSameDay: boolean;
  departingBookingId: string | null;
  arrivingBookingId: string | null;
}

export interface PlanningOptions {
  checkOutTime?: string;
  checkInTime?: string;
  /** Mid-stay clean every N nights for long stays; 0 disables. */
  midStayCadenceNights?: number;
  /** Minutes a standard clean takes; the same-day window ends this long before check-in plus travel. */
  cleanMinutes?: number;
  travelMinutes?: number;
}

export interface ExistingTask extends PlannedTask {
  id: string;
  state: TaskState;
  assigneeId: string | null;
}

export interface ReplanResult {
  create: PlannedTask[];
  cancel: ExistingTask[];
  /** Kept tasks whose window or booking links changed; assignees must hear about it (OPS-3). */
  changed: Array<{ task: ExistingTask; next: PlannedTask }>;
  unchanged: ExistingTask[];
}

export interface ChecklistItem {
  key: string;
  label: string;
  requiresPhoto: boolean;
}
export interface ChecklistProgress {
  key: string;
  done: boolean;
  photoRef?: string;
}

export interface RoutePoint {
  id: string;
  lat: number;
  lng: number;
  /** ISO instant by which the task must be done. */
  deadline: string;
  durationMinutes: number;
}
export interface RouteWorker {
  id: string;
  lat: number;
  lng: number;
  /** ISO instant the worker can start. */
  startsAt: string;
  capacityMinutes: number;
}
export interface RouteStop {
  taskId: string;
  sequence: number;
  travelMinutesEstimate: number;
  etaStart: string;
  etaEnd: string;
  late: boolean;
}
export interface RoutePlan {
  workerId: string;
  stops: RouteStop[];
}

export type CredentialType = "door_code" | "lockbox" | "smart_lock" | "key_handover";
export interface CredentialWindow {
  validFrom: string;
  validTo: string;
}

/** The lock port (spec 08 §8.4): a smart-lock integration or manual code entry. */
export interface LockProvider {
  issue(input: {
    unitRef: string;
    bookingId: string;
    window: CredentialWindow;
    type: CredentialType;
  }): Promise<{ value: string; providerRef: string | null }>;
  revoke(input: { unitRef: string; providerRef: string | null }): Promise<void>;
}

export type FolioLineKind =
  | "room"
  | "extra"
  | "cleaning_fee"
  | "tourist_tax"
  | "tax"
  | "damage"
  | "cancellation_fee"
  | "no_show_fee"
  | "adjustment";
export interface FolioLine {
  id: Id;
  kind: FolioLineKind;
  description: string;
  date: string;
  /** Minor units; negative for credits. */
  amountMinor: number;
  /** For room lines: the night this posts for; the idempotency key of daily close. */
  postingKey?: string;
}
export type PaymentMethod = "card" | "cash" | "bank_transfer" | "ota_collected" | "virtual_card";
export interface Payment {
  id: Id;
  method: PaymentMethod;
  amountMinor: number;
  receivedAt: string;
  /** Captured, or a held deposit (pre-authorisation) not yet captured. */
  state: "captured" | "held" | "released" | "refunded";
  reason?: string;
}

export interface TouristTaxRule {
  /** Per person per night in minor units. */
  perPersonPerNightMinor: number;
  /** Guests younger than this pay nothing. */
  exemptUnderAge?: number;
  /** Nights after this many are free. */
  maxNights?: number;
}
