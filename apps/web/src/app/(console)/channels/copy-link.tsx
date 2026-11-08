"use client";

import { useState } from "react";

/** The iCal row's control: pick a property, copy its feed link. */
export function IcalCopy({
  feeds,
  labels,
}: {
  feeds: Array<{ propertyId: string; title: string; url: string }>;
  labels: { copy: string; copied: string; pick: string };
}) {
  const [id, setId] = useState(feeds[0]?.propertyId ?? "");
  const [done, setDone] = useState(false);
  const url = feeds.find((f) => f.propertyId === id)?.url ?? "";
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      {feeds.length > 1 ? (
        <select
          aria-label={labels.pick}
          value={id}
          onChange={(e) => {
            setId(e.target.value);
            setDone(false);
          }}
          className="h-8 rounded-full border border-[#d5d9d7] bg-surface px-3 text-xs"
        >
          {feeds.map((f) => (
            <option key={f.propertyId} value={f.propertyId}>
              {f.title}
            </option>
          ))}
        </select>
      ) : null}
      <button
        type="button"
        className="text-sm font-semibold text-accent hover:underline"
        data-testid="ical-copy"
        data-url={url}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            setDone(true);
          } catch {
            window.prompt(labels.copy, url);
          }
        }}
      >
        {done ? labels.copied : labels.copy}
      </button>
    </span>
  );
}
