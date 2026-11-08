import type React from "react";
import { Checkbox, DateInput, cn } from "@/components/ui";

export interface SearchParams {
  arrival?: string;
  departure?: string;
  adults?: string;
  children?: string;
  promo?: string;
  attributes?: string | string[];
  embed?: string;
  error?: string;
}

const bare =
  "h-7 min-h-0 rounded-none border-0 bg-transparent px-0 text-[15px] font-semibold shadow-none focus:border-0 focus-visible:ring-0";

/** One soft cell of the search pill: a small label over a borderless control. */
function Cell({
  label,
  htmlFor,
  className,
  children,
}: {
  label: string;
  htmlFor?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-1 rounded-[14px] bg-background px-4 py-2.5 focus-within:ring-2 focus-within:ring-accent/30",
        className,
      )}
    >
      <label htmlFor={htmlFor} className="text-xs font-semibold text-muted">
        {label}
      </label>
      {children}
    </div>
  );
}

/**
 * The search pill (spec 10 §10.3): a plain GET form, so it works without JavaScript,
 * deep-links, and keeps one tab stop per field (BE-10). Dates, guests and a promo code;
 * the attribute filters sit under it when the portfolio has any.
 */
export function SearchForm({
  action,
  sp,
  labels,
  attributes,
}: {
  action: string;
  sp: SearchParams & { org?: string };
  labels: Record<
    | "dates"
    | "arrival"
    | "departure"
    | "guests"
    | "adults"
    | "children"
    | "promo"
    | "optional"
    | "search"
    | "attributes",
    string
  > & { adultCount: (n: number) => string; childCount: (n: number) => string };
  attributes?: string[];
}) {
  const picked = ([] as string[])
    .concat(sp.attributes ?? [])
    .flatMap((a) => a.split(","))
    .filter(Boolean);
  const adults = Number(sp.adults ?? 2);
  const children = Number(sp.children ?? 0);
  return (
    <form
      action={action}
      method="get"
      role="search"
      aria-label={labels.search}
      className="flex flex-col gap-3"
      data-testid="search"
    >
      <div className="flex flex-wrap items-stretch gap-1.5 rounded-[20px] border border-border bg-surface p-2.5 shadow-[0_12px_32px_rgba(20,23,22,0.06)]">
        {sp.embed ? <input type="hidden" name="embed" value="1" /> : null}
        {sp.org ? <input type="hidden" name="org" value={sp.org} /> : null}
        <Cell label={labels.dates} htmlFor="date-arrival" className="flex-[1_1_260px]">
          <span className="flex items-center gap-2">
            <DateInput
              name="arrival"
              required
              defaultValue={sp.arrival}
              aria-label={labels.arrival}
              className={cn(bare, "w-auto min-w-0 flex-1")}
            />
            <span aria-hidden="true" className="text-muted">
              →
            </span>
            <DateInput
              name="departure"
              required
              defaultValue={sp.departure}
              aria-label={labels.departure}
              className={cn(bare, "w-auto min-w-0 flex-1")}
            />
          </span>
        </Cell>
        <Cell label={labels.guests} htmlFor="adults" className="flex-[1_1_140px]">
          <span className="flex items-center gap-2">
            <select
              id="adults"
              name="adults"
              defaultValue={String(adults)}
              aria-label={labels.adults}
              className={cn(bare, "min-w-0 flex-1 appearance-none")}
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {labels.adultCount(n)}
                </option>
              ))}
            </select>
            <select
              name="children"
              defaultValue={String(children)}
              aria-label={labels.children}
              className={cn(bare, "min-w-0 flex-1 appearance-none font-medium text-muted")}
            >
              {Array.from({ length: 9 }, (_, i) => i).map((n) => (
                <option key={n} value={n}>
                  {labels.childCount(n)}
                </option>
              ))}
            </select>
          </span>
        </Cell>
        <Cell label={labels.promo} htmlFor="promo" className="flex-[1_1_140px]">
          <input
            id="promo"
            name="promo"
            defaultValue={sp.promo}
            autoComplete="off"
            placeholder={labels.optional}
            className={cn(
              bare,
              "w-full placeholder:font-medium placeholder:text-muted/80 focus:outline-none",
            )}
          />
        </Cell>
        <button
          type="submit"
          className="inline-flex min-h-12 flex-[0_0_auto] items-center justify-center gap-2 rounded-[14px] bg-accent px-6 text-[15px] font-bold text-accent-foreground hover:bg-accent/90 max-sm:w-full sm:min-w-[150px]"
          data-testid="search-submit"
        >
          <svg viewBox="0 0 16 16" className="size-4" aria-hidden="true" fill="none">
            <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.8" />
            <path
              d="m10.5 10.5 3 3"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
          {labels.search}
        </button>
      </div>
      {attributes && attributes.length > 0 ? (
        <details className="group text-sm" open={picked.length > 0}>
          <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-full border border-border bg-surface px-3.5 py-1.5 text-[13px] font-semibold text-foreground hover:bg-default">
            {labels.attributes}
            {picked.length > 0 ? ` · ${picked.length}` : ""}
            <span aria-hidden="true" className="text-muted group-open:rotate-180">
              ▾
            </span>
          </summary>
          <fieldset className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
            <legend className="sr-only">{labels.attributes}</legend>
            {attributes.map((a) => (
              <Checkbox key={a} name="attributes" value={a} defaultChecked={picked.includes(a)}>
                {a}
              </Checkbox>
            ))}
          </fieldset>
        </details>
      ) : null}
    </form>
  );
}
