"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import {
  changeDatesAction,
  issueCredentialAction,
  openGuestPortalAction,
  revealCredential,
  revealGuestPii,
  revealInstrument,
  type ChangeDatesState,
} from "../reservations.actions";
import { Alert, Button, DateInput, Select, SubmitButton } from "@/components/ui";
import { money } from "@/lib/format";

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

const KINDS = ["door_code", "smart_lock", "lockbox", "key_handover"] as const;
/** "14 Nov 15:00": the same reading as the server-rendered validity (UTC clock time). */
const whenUtc = (iso: string, locale: string) =>
  `${new Intl.DateTimeFormat(locale === "en" ? "en-GB" : locale, { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(iso))} ${iso.slice(11, 16)}`;

/** The door code tile: masked until revealed (audited per view), or issued here. */
export function DoorCodeTile({
  bookingId,
  propertyId,
  credential,
  status,
  labels,
  locale,
}: {
  bookingId: string;
  propertyId: string;
  credential: { id: string; valueMasked: string; validity: string } | null;
  status: string;
  labels: {
    title: string;
    issue: string;
    reveal: string;
    notIssued: string;
    validity: string;
    /** What the select is for ("Kind of access"). */
    kind: string;
    /** One word per kind of access, keyed door_code, smart_lock, lockbox, key_handover. */
    kinds: Record<string, string>;
  };
  locale: string;
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
                        .replace("{from}", whenUtc(r.validFrom, locale))
                        .replace("{to}", whenUtc(r.validTo, locale)),
                    });
                  })
                }
              >
                {labels.issue}
              </Button>
              <details className="text-xs text-muted">
                <summary className="cursor-pointer hover:text-foreground">
                  {labels.kinds[type] ?? type} <span aria-hidden="true">▾</span>
                </summary>
                <Select
                  value={type}
                  onChange={(v) => setType(v)}
                  size="sm"
                  className="w-full"
                  label={labels.kind}
                >
                  {KINDS.map((k) => (
                    <option key={k} value={k}>
                      {labels.kinds[k] ?? k}
                    </option>
                  ))}
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
  currency,
  locale,
  words,
}: {
  bookingId: string;
  count: number;
  label: string;
  currency: string;
  locale: string;
  /** "expires {expiry}", "Virtual card balance {amount} until {date}". */
  words: { expires: string; vcc: string };
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
            {i.cardType} {i.maskedNumber} · {words.expires.replace("{expiry}", i.expiry ?? "?")}
            {i.vccBalanceMinor !== null
              ? ` · ${words.vcc
                  .replace("{amount}", money(i.vccBalanceMinor, currency, locale))
                  .replace("{date}", i.vccEffectiveTo ?? "?")}`
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

/**
 * Change the dates of a direct booking. The answer comes back on the form: a stay that cannot
 * be sold says why, in words, next to the button (no error page), and the dates the host typed
 * stay where they are.
 */
export function ChangeDatesForm({
  bookingId,
  propertyId,
  arrivalDate,
  departureDate,
  labels,
}: {
  bookingId: string;
  propertyId: string;
  arrivalDate: string;
  departureDate: string;
  labels: { checkIn: string; checkOut: string; hint: string; save: string; saving: string };
}) {
  const [state, action] = useActionState<ChangeDatesState, FormData>(changeDatesAction, {});
  const [arrival, setArrival] = useState(arrivalDate);
  const nextDay = (iso: string) => {
    const d = new Date(`${iso}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
  };
  return (
    <form
      action={action}
      className="mt-3 flex flex-col gap-2"
      onChange={(e) => {
        const el = e.target as unknown as HTMLInputElement;
        if (el.name === "arrivalDate" && el.value) setArrival(el.value);
      }}
    >
      <input type="hidden" name="bookingId" value={bookingId} />
      <input type="hidden" name="propertyId" value={propertyId} />
      <div className="grid grid-cols-2 gap-2">
        <DateInput name="arrivalDate" defaultValue={arrivalDate} label={labels.checkIn} required />
        <DateInput
          name="departureDate"
          defaultValue={departureDate}
          min={nextDay(arrival)}
          label={labels.checkOut}
          required
        />
      </div>
      <p className="text-xs text-muted">{labels.hint}</p>
      {state.error ? (
        <Alert data-testid="change-dates-error">
          {state.error}
          {state.reasons?.length ? (
            <ul className="mt-1 list-disc ps-4">
              {state.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          ) : null}
        </Alert>
      ) : null}
      <SubmitButton size="sm" pendingLabel={labels.saving} testId="save-dates">
        {labels.save}
      </SubmitButton>
    </form>
  );
}
