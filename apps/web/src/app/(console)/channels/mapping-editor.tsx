"use client";

import {
  coverageWarnings,
  type MappingRow,
  type OurRatePlan,
  type Suggestion,
  type TheirRoom,
} from "@pms/core";
import { Select, TBody, THead, Table, Td, Th, Tr } from "@/components/ui";
import { fill } from "./fill";

/** Raw messages from `channels.mapping` (see mapping-labels.ts), filled here. */
export interface MappingLabels {
  colOurs: string;
  colTheirs: string;
  colSuggestion: string;
  guests: string;
  derived: string;
  notMatched: string;
  match: string;
  allMatched: string;
}

/** The mapping screen (spec 07 §7.3): two panes, one row per rate plan, suggestions with confidence, coverage warnings live. */
export function MappingEditor({
  ours,
  theirs,
  suggestions,
  rows,
  onChange,
  labels: L,
}: {
  labels: MappingLabels;
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
        <THead>
          <Tr className="hover:bg-transparent">
            <Th>{L.colOurs}</Th>
            <Th>{L.colTheirs}</Th>
            <Th>{L.colSuggestion}</Th>
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
                    {fill(L.guests, { n: rp.occupancy })}
                    {rp.isDerived ? ` · ${L.derived}` : ""}
                  </span>
                </Td>
                <Td>
                  <Select
                    value={row ? `${row.roomCode}::${row.rateCode}` : ""}
                    onChange={(v) => set(rp.id, v)}
                    data-testid={`map-${rp.id}`}
                    aria-label={`${L.colTheirs}: ${rp.roomTypeTitle} · ${rp.title}`}
                  >
                    <option value="">{L.notMatched}</option>
                    {theirs.map((room) =>
                      room.rates.map((rate) => (
                        <option
                          key={`${room.code}::${rate.code}`}
                          value={`${room.code}::${rate.code}`}
                        >
                          {room.title}, {rate.title}
                          {rate.occupancy ? ` (${fill(L.guests, { n: rate.occupancy })})` : ""}
                        </option>
                      )),
                    )}
                  </Select>
                </Td>
                <Td className="tabular-nums">
                  {s ? fill(L.match, { pct: Math.round(s.confidence * 100) }) : "—"}
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
        <p className="text-xs text-success-soft-foreground">{L.allMatched}</p>
      )}
    </div>
  );
}
