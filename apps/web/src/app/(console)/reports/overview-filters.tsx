"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Select } from "@/components/ui";

/** Period and property for the Reports overview; a change reloads the page with the new query. */
export function OverviewFilters({
  days,
  propertyId,
  periods,
  properties,
  labels,
}: {
  days: number;
  propertyId: string;
  periods: Array<{ value: number; label: string }>;
  properties: Array<{ id: string; title: string }>;
  labels: { period: string; property: string; allProperties: string };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const go = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.push(`${pathname}?${next.toString()}`);
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        aria-label={labels.period}
        value={String(days)}
        onChange={(v) => go("days", v)}
        className="w-40"
      >
        {periods.map((p) => (
          <option key={p.value} value={String(p.value)}>
            {p.label}
          </option>
        ))}
      </Select>
      <Select
        aria-label={labels.property}
        value={propertyId}
        onChange={(v) => go("property", v)}
        className="w-48"
      >
        <option value="">{labels.allProperties}</option>
        {properties.map((p) => (
          <option key={p.id} value={p.id}>
            {p.title}
          </option>
        ))}
      </Select>
    </div>
  );
}
