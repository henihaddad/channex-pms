"use client";

import { useRouter } from "next/navigation";

/** A select whose options are pages: choosing one opens it. */
export function NavSelect({
  label,
  value,
  options,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string; href: string }>;
}) {
  const router = useRouter();
  return (
    <select
      aria-label={label}
      value={value}
      className="h-[38px] rounded-full border border-border bg-surface px-4 text-[13px] font-semibold"
      onChange={(e) => {
        const o = options.find((x) => x.value === e.target.value);
        if (o) router.push(o.href);
      }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
