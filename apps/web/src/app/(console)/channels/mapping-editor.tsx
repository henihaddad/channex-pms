"use client";

import {
  coverageWarnings,
  type MappingRow,
  type OurRatePlan,
  type Suggestion,
  type TheirRoom,
} from "@pms/core";
import { Select, TBody, THead, Table, Td, Th, Tr } from "@/components/ui";

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
      <Table>
        <THead className="uppercase">
          <Tr>
            <Th>Our rate plan</Th>
            <Th>Channel room / rate</Th>
            <Th>Suggestion</Th>
          </Tr>
        </THead>
        <TBody>
          {ours.map((rp) => {
            const row = rows.find((r) => r.ratePlanId === rp.id);
            const s = suggestions.find((x) => x.ratePlanId === rp.id);
            return (
              <Tr key={rp.id}>
                <Td>
                  {rp.roomTypeTitle} · {rp.title}{" "}
                  <span className="text-xs text-muted">
                    occ {rp.occupancy}
                    {rp.isDerived ? " · derived" : ""}
                  </span>
                </Td>
                <Td>
                  <Select
                    value={row ? `${row.roomCode}::${row.rateCode}` : ""}
                    onChange={(v) => set(rp.id, v)}
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
                </Td>
                <Td>
                  {s
                    ? `${Math.round(s.confidence * 100)}% · ${s.reasons.join(", ") || "name similarity"}`
                    : "—"}
                </Td>
              </Tr>
            );
          })}
        </TBody>
      </Table>
      {warnings.length > 0 ? (
        <div
          className="rounded-md border border-warning/50 bg-warning-soft p-2 text-xs text-warning-soft-foreground"
          data-testid="coverage-warnings"
        >
          {warnings.map((w) => (
            <p key={w.code + w.ref}>{w.message}</p>
          ))}
        </div>
      ) : (
        <p className="text-xs text-success-soft-foreground">
          Full coverage: every room type, rate plan and channel room is mapped.
        </p>
      )}
    </div>
  );
}
