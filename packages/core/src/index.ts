// @pms/core: the domain layer. Framework-free by rule (spec 14 §14.3, C1).
// Value objects first (spec 15, "first two weeks"), services and ports follow at M0/M1.

export { Money, CurrencyMismatchError, type Rounding } from "./money/money.js";
export { LocalDate } from "./dates/local-date.js";
export { DateRange } from "./dates/date-range.js";
