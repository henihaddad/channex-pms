// @pms/core: the domain layer. Framework-free by rule (spec 14 §14.3, C1).
// shared/: value objects and primitives used by every module.
// <module>/: one directory per module of spec 04 §4.2, importable only via its index.

export { Money, CurrencyMismatchError, type Rounding } from "./shared/money.js";
export { LocalDate } from "./shared/local-date.js";
export { DateRange } from "./shared/date-range.js";
export { Occupancy, type OccupancyLimits } from "./shared/occupancy.js";
export { Id } from "./shared/id.js";
export { SystemClock, FakeClock, type Clock } from "./shared/clock.js";
export { ok, err, DomainError, type Result } from "./shared/result.js";
export type { DomainEvent } from "./shared/domain-event.js";

export * from "./identity/index.js";
export * from "./audit/index.js";
export * from "./inventory/index.js";
export * from "./connectivity/index.js";
export * from "./reservations/index.js";
export * from "./properties/index.js";
export * from "./channels/index.js";
export * from "./operations/index.js";
export * from "./messaging/index.js";
