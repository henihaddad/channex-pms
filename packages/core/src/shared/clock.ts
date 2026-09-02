import { Temporal } from "temporal-polyfill";
import { LocalDate } from "./local-date.js";

/** Every domain service takes a Clock; no Date.now() in domain code. */
export interface Clock {
  now(): Temporal.Instant;
  /** Today's calendar date in the given IANA zone (a property's zone, never the server's). */
  today(timeZone: string): LocalDate;
}

export class SystemClock implements Clock {
  now(): Temporal.Instant {
    return Temporal.Now.instant();
  }
  today(timeZone: string): LocalDate {
    return LocalDate.today(timeZone);
  }
}

/** Deterministic clock for tests and simulations. */
export class FakeClock implements Clock {
  private current: Temporal.Instant;

  constructor(start: string | Temporal.Instant = "2026-01-01T00:00:00Z") {
    this.current = typeof start === "string" ? Temporal.Instant.from(start) : start;
  }

  now(): Temporal.Instant {
    return this.current;
  }

  today(timeZone: string): LocalDate {
    const zdt = this.current.toZonedDateTimeISO(timeZone);
    return LocalDate.of(zdt.year, zdt.month, zdt.day);
  }

  advance(duration: Temporal.DurationLike): void {
    this.current = this.current.add(duration);
  }

  set(instant: string | Temporal.Instant): void {
    this.current = typeof instant === "string" ? Temporal.Instant.from(instant) : instant;
  }
}
