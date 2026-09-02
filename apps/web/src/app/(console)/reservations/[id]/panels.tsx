"use client";

import { useState, useTransition } from "react";
import {
  issueCredentialAction,
  revealCredential,
  revealGuestPii,
  revealInstrument,
} from "../reservations.actions";
import { Button, Select } from "@/components/ui";

export function CredentialPanel({
  bookingId,
  propertyId,
  credentials,
  status,
  labels,
}: {
  bookingId: string;
  propertyId: string;
  credentials: Array<{ id: string; valueMasked: string }>;
  status: string;
  labels: { issue: string; reveal: string; revoke: string };
}) {
  const [shown, setShown] = useState<Record<string, string>>({});
  const [issued, setIssued] = useState<string>("");
  const [type, setType] = useState("door_code");
  const [pending, start] = useTransition();
  return (
    <div className="space-y-2 text-sm">
      {status !== "cancelled" ? (
        <div className="flex items-center gap-2">
          <Select value={type} onChange={(e) => setType(e.target.value)} className="h-8 w-40">
            <option value="door_code">door code</option>
            <option value="smart_lock">smart lock</option>
            <option value="lockbox">lockbox</option>
            <option value="key_handover">key handover</option>
          </Select>
          <Button
            className="h-8"
            disabled={pending}
            data-testid="issue-code"
            onClick={() =>
              start(async () => {
                const fd = new FormData();
                fd.set("bookingId", bookingId);
                fd.set("propertyId", propertyId);
                fd.set("type", type);
                const r = await issueCredentialAction(fd);
                setIssued(
                  `${r.value} (valid ${r.validFrom.slice(0, 16)} → ${r.validTo.slice(0, 16)})`,
                );
              })
            }
          >
            {labels.issue}
          </Button>
        </div>
      ) : null}
      {issued ? (
        <p
          className="rounded bg-emerald-50 p-2 font-mono text-emerald-800"
          data-testid="issued-code"
        >
          {issued}
        </p>
      ) : null}
      {credentials.map((c) => (
        <p key={c.id} className="text-xs">
          {shown[c.id] ? (
            <span className="font-mono" data-testid="revealed-code">
              {shown[c.id]}
            </span>
          ) : (
            <button
              className="underline"
              onClick={() =>
                start(async () => {
                  const v = await revealCredential({ bookingId, credentialId: c.id });
                  if (v) setShown({ ...shown, [c.id]: v });
                })
              }
            >
              {labels.reveal} {c.valueMasked}
            </button>
          )}
        </p>
      ))}
    </div>
  );
}

export function GuestPanel({
  bookingId,
  guest,
  label,
}: {
  bookingId: string;
  guest: {
    id: string;
    country: string | null;
    language: string | null;
    hasEmail: boolean;
    hasPhone: boolean;
  } | null;
  label: string;
}) {
  const [pii, setPii] = useState<{
    name: string;
    surname: string;
    email: string | null;
    phone: string | null;
  } | null>(null);
  const [pending, start] = useTransition();
  if (!guest) return <p className="text-sm text-slate-500">—</p>;
  return (
    <div className="text-sm">
      <p className="text-slate-600">
        {guest.country ?? "—"} · {guest.language ?? "—"} ·{" "}
        {guest.hasEmail ? "email on file" : "no email"} ·{" "}
        {guest.hasPhone ? "phone on file" : "no phone"}
      </p>
      {pii ? (
        <p className="mt-1" data-testid="guest-pii">
          {pii.name} {pii.surname} · {pii.email ?? "—"} · {pii.phone ?? "—"}
        </p>
      ) : (
        <Button
          variant="secondary"
          className="mt-2 h-8"
          disabled={pending}
          data-testid="reveal-pii"
          onClick={() =>
            start(async () => setPii(await revealGuestPii({ bookingId, guestId: guest.id })))
          }
        >
          {label}
        </Button>
      )}
    </div>
  );
}

export function InstrumentPanel({
  bookingId,
  count,
  label,
}: {
  bookingId: string;
  count: number;
  label: string;
}) {
  const [rows, setRows] = useState<Array<{
    id: string;
    cardType: string | null;
    maskedNumber: string | null;
    expiry: string | null;
    vccBalanceMinor: number | null;
    vccEffectiveTo: string | null;
  }> | null>(null);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  if (count === 0) return null;
  return (
    <div className="mt-3 text-sm">
      {rows ? (
        rows.map((i) => (
          <p key={i.id} className="font-mono text-xs">
            {i.cardType} {i.maskedNumber} exp {i.expiry}
            {i.vccBalanceMinor !== null
              ? ` · VCC balance ${(i.vccBalanceMinor / 100).toFixed(2)} until ${i.vccEffectiveTo ?? "?"}`
              : ""}
          </p>
        ))
      ) : (
        <Button
          variant="secondary"
          className="h-8"
          disabled={pending}
          onClick={() =>
            start(async () => {
              try {
                setRows(await revealInstrument({ bookingId }));
              } catch (e) {
                setError(e instanceof Error ? e.message : String(e));
              }
            })
          }
        >
          {label} ({count})
        </Button>
      )}
      {error ? <p className="text-xs text-rose-700">{error}</p> : null}
    </div>
  );
}
