"use client";

import {
  coverageWarnings,
  type MappingRow,
  type OurRatePlan,
  type Suggestion,
  type TheirRoom,
} from "@pms/core";
import { Select } from "@/components/ui";

/** The mapping screen (spec 07 §7.3): two panes, one row per rate plan, suggestions with confidence, coverage warnings live. */
export function MappingEditor({
  ours,
  theirs,
  suggestions,
  rows,
  onChange,
}: {
  ours: OurRatePlan[];
  theirs: TheirRoom[];
  suggestions: Suggestion[];
  rows: MappingRow[];
  onChange: (rows: MappingRow[]) => void;
}) {
  const warnings = coverageWarnings(ours, theirs, rows);
  const set = (ratePlanId: string, value: string) => {
    const others = rows.filter((r) => r.ratePlanId !== ratePlanId);
    if (!value) return onChange(others);
    const [roomCode, rateCode] = value.split("::");
    const rate = theirs.find((r) => r.code === roomCode)?.rates.find((x) => x.code === rateCode);
    onChange([
      ...others,
      {
        ratePlanId,
        roomCode: roomCode!,
        rateCode: rateCode!,
        ...(rate?.occupancy !== undefined ? { occupancy: rate.occupancy } : {}),
      },
    ]);
  };
  return (
    <div className="space-y-3" data-testid="mapping-editor">
      <table className="w-full text-sm">
        <thead className="text-xs uppercase text-slate-500">
          <tr>
            <th className="text-start">Our rate plan</th>
            <th className="text-start">Channel room / rate</th>
            <th className="text-start">Suggestion</th>
          </tr>
        </thead>
        <tbody>
          {ours.map((rp) => {
            const row = rows.find((r) => r.ratePlanId === rp.id);
            const s = suggestions.find((x) => x.ratePlanId === rp.id);
            return (
              <tr key={rp.id} className="border-t border-slate-100">
                <td className="py-1">
                  {rp.roomTypeTitle} · {rp.title}{" "}
                  <span className="text-xs text-slate-400">
                    occ {rp.occupancy}
                    {rp.isDerived ? " · derived" : ""}
                  </span>
                </td>
                <td>
                  <Select
                    value={row ? `${row.roomCode}::${row.rateCode}` : ""}
                    onChange={(e) => set(rp.id, e.target.value)}
                    data-testid={`map-${rp.id}`}
                  >
                    <option value="">— not mapped —</option>
                    {theirs.map((room) =>
                      room.rates.map((rate) => (
                        <option
                          key={`${room.code}::${rate.code}`}
                          value={`${room.code}::${rate.code}`}
                        >
                          {room.title} / {rate.title}
                          {rate.occupancy ? ` (occ ${rate.occupancy})` : ""}
                        </option>
                      )),
                    )}
                  </Select>
                </td>
                <td className="text-xs text-slate-500">
                  {s
                    ? `${Math.round(s.confidence * 100)}% · ${s.reasons.join(", ") || "name similarity"}`
                    : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {warnings.length > 0 ? (
        <div
          className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800"
          data-testid="coverage-warnings"
        >
          {warnings.map((w) => (
            <p key={w.code + w.ref}>{w.message}</p>
          ))}
        </div>
      ) : (
        <p className="text-xs text-emerald-700">
          Full coverage: every room type, rate plan and channel room is mapped.
        </p>
      )}
    </div>
  );
}
