"use client";

import { useEffect, useState, useTransition } from "react";
import {
  issueCredentialAction,
  openGuestPortalAction,
  revealCredential,
  revealGuestPii,
  revealInstrument,
} from "../reservations.actions";
import { Button, Select } from "@/components/ui";

/** A small key hint next to a button ("C"). */
export function Kbd({ children }: { children: string }) {
  return (
    <kbd className="ms-1 rounded-md border border-current/25 px-1.5 py-px font-sans text-[11px] font-semibold opacity-70">
      {children}
    </kbd>
  );
}

/**
 * The page's single keys (Shortcuts board): C check in, D change dates, $ record a payment,
 * O open the guest portal. Each presses the visible control marked `data-hotkey`, so a key does
 * exactly what the button does. Nothing fires while typing, with a modifier, or as the second
 * key of the console's "g" chord.
 */
export function ReservationHotkeys() {
  useEffect(() => {
    let lastG = 0;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (
        el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.tagName === "SELECT" ||
          el.isContentEditable)
      )
        return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key === "$" ? "$" : e.key.toLowerCase();
      if (k === "g") {
        lastG = Date.now();
        return;
      }
      if (Date.now() - lastG < 1200) return;
      if (!["c", "d", "$", "o"].includes(k)) return;
      const target = document.querySelector<HTMLElement>(`[data-hotkey="${k}"]`);
      if (!target || target.getAttribute("aria-disabled") === "true") return;
      e.preventDefault();
      target.click();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return null;
}

/** The door code tile: masked until revealed (audited per view), or issued here. */
const KIND: Record<string, string> = {
  door_code: "Door code",
  smart_lock: "Smart lock",
  lockbox: "Lockbox",
  key_handover: "Key handover",
};
/** "14 Nov 15:00": the same reading as the server-rendered validity (UTC clock time). */
const whenUtc = (iso: string) =>
  `${new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(iso))} ${iso.slice(11, 16)}`;

export function DoorCodeTile({
  bookingId,
  propertyId,
  credential,
  status,
  labels,
}: {
  bookingId: string;
  propertyId: string;
  credential: { id: string; valueMasked: string; validity: string } | null;
  status: string;
  labels: { title: string; issue: string; reveal: string; notIssued: string; validity: string };
}) {
  const [shown, setShown] = useState<string>("");
  const [issued, setIssued] = useState<{ value: string; validity: string } | null>(null);
  const [type, setType] = useState("door_code");
  const [pending, start] = useTransition();
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-card border border-border p-4">
      <span className="text-xs font-semibold text-muted">{labels.title}</span>
      {issued ? (
        <>
          <strong
            className="font-display text-2xl font-bold tracking-tight tabular-nums"
            data-testid="issued-code"
          >
            {issued.value}
          </strong>
          <span className="text-xs text-muted">{issued.validity}</span>
        </>
      ) : credential ? (
        <>
          {shown ? (
            <strong
              className="font-display text-2xl font-bold tracking-tight tabular-nums"
              data-testid="revealed-code"
            >
              {shown}
            </strong>
          ) : (
            <button
              type="button"
              className="text-start"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const v = await revealCredential({ bookingId, credentialId: credential.id });
                  if (v) setShown(v);
                })
              }
            >
              <strong className="block font-display text-2xl font-bold tracking-tight">
                {credential.valueMasked}
              </strong>
              <span className="text-xs font-semibold text-accent underline">{labels.reveal}</span>
            </button>
          )}
          <span className="text-xs text-muted">{credential.validity}</span>
        </>
      ) : (
        <>
          <strong className="font-display text-lg font-bold text-muted">{labels.notIssued}</strong>
          {status !== "cancelled" ? (
            <div className="mt-1 flex flex-col items-start gap-1.5">
              <Button
                size="sm"
                disabled={pending}
                data-testid="issue-code"
                onClick={() =>
                  start(async () => {
                    const fd = new FormData();
                    fd.set("bookingId", bookingId);
                    fd.set("propertyId", propertyId);
                    fd.set("type", type);
                    const r = await issueCredentialAction(fd);
                    setIssued({
                      value: r.value,
                      validity: labels.validity
                        .replace("{from}", whenUtc(r.validFrom))
                        .replace("{to}", whenUtc(r.validTo)),
                    });
                  })
                }
              >
                {labels.issue}
              </Button>
              <details className="text-xs text-muted">
                <summary className="cursor-pointer hover:text-foreground">
                  {KIND[type] ?? type} ▾
                </summary>
                <Select
                  value={type}
                  onChange={(v) => setType(v)}
                  className="h-8 w-full text-xs"
                  aria-label={labels.issue}
                >
                  <option value="door_code">Door code</option>
                  <option value="smart_lock">Smart lock</option>
                  <option value="lockbox">Lockbox</option>
                  <option value="key_handover">Key handover</option>
                </Select>
              </details>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

/** Contact details stay sealed until a `booking:read_pii` reader asks; every reveal is audited. */
export function GuestContact({
  bookingId,
  guestId,
  hasEmail,
  hasPhone,
  labels,
}: {
  bookingId: string;
  guestId: string;
  hasEmail: boolean;
  hasPhone: boolean;
  labels: {
    email: string;
    phone: string;
    onFile: string;
    none: string;
    reveal: string;
    revealedFor: string;
  };
}) {
  const [pii, setPii] = useState<{
    name: string;
    surname: string;
    email: string | null;
    phone: string | null;
  } | null>(null);
  const [pending, start] = useTransition();
  const value = (v: string | null | undefined, has: boolean) =>
    pii ? (v ?? labels.none) : has ? labels.onFile : labels.none;
  const reveal =
    !pii && (hasEmail || hasPhone) ? (
      <button
        type="button"
        className="ms-2 text-xs font-semibold text-accent underline"
        disabled={pending}
        data-testid="reveal-pii"
        onClick={() => start(async () => setPii(await revealGuestPii({ bookingId, guestId })))}
      >
        {labels.reveal}
      </button>
    ) : null;
  return (
    <>
      <dt className="text-muted">{labels.email}</dt>
      <dd className="min-w-0 truncate">
        {value(pii?.email, hasEmail)}
        {hasEmail ? reveal : null}
      </dd>
      <dt className="text-muted">{labels.phone}</dt>
      <dd className="min-w-0">
        {value(pii?.phone, hasPhone)}
        {!hasEmail ? reveal : null}
        {pii ? (
          <span className="block text-xs text-muted" data-testid="guest-pii">
            {labels.revealedFor.replace("{name}", `${pii.name} ${pii.surname}`)}
          </span>
        ) : null}
      </dd>
    </>
  );
}

/** "O": a fresh one-hour portal session for this booking, opened in a new tab. */
export function OpenPortalButton({ bookingId, label }: { bookingId: string; label: string }) {
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  return (
    <>
      <button
        type="button"
        className="font-semibold text-accent hover:underline"
        data-hotkey="o"
        data-testid="open-portal"
        disabled={pending}
        onClick={() => {
          // open the tab inside the click, so the browser does not block it as a popup
          const tab = window.open("about:blank", "_blank");
          start(async () => {
            try {
              const { url } = await openGuestPortalAction({ bookingId });
              if (tab) tab.location.href = url;
              else window.location.href = url;
            } catch (e) {
              tab?.close();
              setError(e instanceof Error ? e.message : String(e));
            }
          });
        }}
      >
        {label}
        <Kbd>O</Kbd>
      </button>
      {error ? <span className="block text-xs text-danger">{error}</span> : null}
    </>
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
    <div className="text-sm">
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
          size="sm"
          variant="ghost"
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
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}
