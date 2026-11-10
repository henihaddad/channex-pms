import { DateRange } from "../shared/date-range.js";
import { LocalDate } from "../shared/local-date.js";
import { err, ok, DomainError, type Result } from "../shared/result.js";
import type { RestrictionValues } from "../inventory/ari.js";

/** The longest run of nights one API call may touch (a year and a day). */
export const MAX_NIGHTS_PER_CALL = 366;
/** The calendar edit endpoints take at most this many cells per request. */
export const MAX_CELLS_PER_CALL = 2000;

export interface NightCellEdit {
  ratePlanId: string;
  /** A night (rule 5): a LocalDate, never an instant. */
  date: string;
  values: RestrictionValues;
}

/**
 * The nights from `firstNight` to `lastNight`, both included, as a half-open range
 * [firstNight, lastNight + 1). The API and the MCP tools speak in first and last night
 * because that is how a host says it ("the 12th to the 14th"); the range is the rule.
 */
export function nightRange(firstNight: string, lastNight: string): Result<DateRange> {
  let first: LocalDate;
  let last: LocalDate;
  try {
    first = LocalDate.parse(firstNight);
    last = LocalDate.parse(lastNight);
  } catch {
    return err(new DomainError("nights.invalid_date", "Dates must be YYYY-MM-DD"));
  }
  if (last.isBefore(first))
    return err(new DomainError("nights.reversed", "The last night is before the first night"));
  const range = DateRange.of(first, last.plusDays(1));
  if (range.nights() > MAX_NIGHTS_PER_CALL)
    return err(
      new DomainError(
        "nights.too_many",
        `At most ${String(MAX_NIGHTS_PER_CALL)} nights per call; split the range`,
      ),
    );
  return ok(range);
}

/** Every night of a range, in order. */
export function nightsOf(range: DateRange): string[] {
  const out: string[] = [];
  for (let d = range.start; d.isBefore(range.end); d = d.plusDays(1)) out.push(d.toString());
  return out;
}

/**
 * One cell edit per rate plan and night, the same values on each: what "set the price to 120
 * from the 12th to the 14th" means to the calendar. Refuses rather than truncates.
 */
export function nightEdits(input: {
  ratePlanIds: readonly string[];
  firstNight: string;
  lastNight: string;
  values: RestrictionValues;
}): Result<NightCellEdit[]> {
  if (input.ratePlanIds.length === 0)
    return err(new DomainError("nights.no_rate_plan", "No rate plan to edit"));
  const range = nightRange(input.firstNight, input.lastNight);
  if (!range.ok) return range;
  const nights = nightsOf(range.value);
  if (nights.length * input.ratePlanIds.length > MAX_CELLS_PER_CALL)
    return err(
      new DomainError(
        "nights.too_many_cells",
        `At most ${String(MAX_CELLS_PER_CALL)} rate-plan nights per call; narrow the range or the rate plans`,
      ),
    );
  const edits: NightCellEdit[] = [];
  for (const ratePlanId of new Set(input.ratePlanIds))
    for (const date of nights) edits.push({ ratePlanId, date, values: { ...input.values } });
  return ok(edits);
}
