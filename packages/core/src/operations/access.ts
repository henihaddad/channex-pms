import type { RevisionDiff } from "../reservations/types.js";
import { localToInstant } from "./routing.js";
import type { CredentialType, CredentialWindow, LockProvider } from "./types.js";

/** The validity window: from check-in minus a grace period to check-out plus one (spec 03 §3.5 AccessCredential). */
export function credentialWindow(input: {
  arrivalDate: string;
  departureDate: string;
  timezone: string;
  checkInTime?: string;
  checkOutTime?: string;
  graceMinutes?: number;
}): CredentialWindow {
  const from =
    localToInstant(input.arrivalDate, input.checkInTime ?? "15:00", input.timezone) -
    (input.graceMinutes ?? 60) * 60_000;
  const to =
    localToInstant(input.departureDate, input.checkOutTime ?? "10:00", input.timezone) +
    (input.graceMinutes ?? 60) * 60_000;
  return { validFrom: new Date(from).toISOString(), validTo: new Date(to).toISOString() };
}

export type CredentialAction = "none" | "revoke" | "reissue";

/**
 * INV-14: a cancellation revokes; moved dates revoke and reissue. Anything else
 * leaves the credential alone. Pure so the job that runs within a minute of the
 * revision applying is trivially testable.
 */
export function credentialActionForDiff(
  diff: RevisionDiff,
  hasCredential: boolean,
): CredentialAction {
  if (!hasCredential) return "none";
  if (diff.statusChanged?.to === "cancelled") return "revoke";
  if (
    diff.datesChanged &&
    diff.datesChanged.from &&
    (diff.datesChanged.from.arrival !== diff.datesChanged.to.arrival ||
      diff.datesChanged.from.departure !== diff.datesChanged.to.departure)
  )
    return "reissue";
  return "none";
}

/** Deterministic codes for tests and for properties without a smart lock (manual door codes). */
export class FakeLockProvider implements LockProvider {
  readonly issued: Array<{ unitRef: string; bookingId: string; value: string }> = [];
  readonly revoked: Array<{ unitRef: string; providerRef: string | null }> = [];
  constructor(private readonly random: () => number = Math.random) {}
  async issue(input: {
    unitRef: string;
    bookingId: string;
    window: CredentialWindow;
    type: CredentialType;
  }): Promise<{ value: string; providerRef: string | null }> {
    const value = String(Math.floor(this.random() * 900_000) + 100_000);
    this.issued.push({ unitRef: input.unitRef, bookingId: input.bookingId, value });
    return {
      value,
      providerRef:
        input.type === "smart_lock"
          ? `fake-lock:${input.unitRef}:${String(this.issued.length)}`
          : null,
    };
  }
  async revoke(input: { unitRef: string; providerRef: string | null }): Promise<void> {
    this.revoked.push(input);
  }
}

/** Never logged, never shown whole by default (spec 08 §8.2): mask all but the last two characters. */
export const maskCredential = (value: string): string =>
  value.length <= 2 ? "••" : "•".repeat(value.length - 2) + value.slice(-2);
