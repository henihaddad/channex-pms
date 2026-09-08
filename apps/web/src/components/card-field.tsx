"use client";

import { useEffect, useRef, useState } from "react";
import { Input, Label } from "@/components/ui";

/**
 * Card entry through Stripe.js: the number never touches our servers or our DOM,
 * only Stripe's iframe. On submit the element is exchanged for a payment method
 * id, which is what our adapters send (`payment_method` on an intent, `attach`
 * on a subscription). A challenge (3-D Secure, mandatory in Europe) is answered
 * in place through `handleNextAction` and the form is submitted again.
 *
 * Without a publishable key — a self-hosted install with no Stripe, the test
 * hooks, development — the field is a plain token input and the fake provider
 * accepts it, so nothing depends on Stripe being configured.
 */
export function CardField({
  formId,
  name,
  label,
  hint,
  publishableKey,
  errorLabel,
  setupUrl,
}: {
  formId: string;
  name: string;
  label: string;
  hint?: string;
  publishableKey: string | null;
  errorLabel: string;
  /**
   * Where to ask for a card-setup client secret. Given one, the card is set up through a
   * SetupIntent: the 3-D Secure challenge a European card needs is answered here, once, so
   * the invoices that follow are charged off-session. Without it (a guest paying now) the
   * element is exchanged for a payment method and the intent carries its own challenge.
   */
  setupUrl?: string;
}) {
  const mount = useRef<HTMLDivElement>(null);
  const hidden = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!publishableKey) return;
    let element: StripeElement | null = null;
    let stripe: StripeJs | null = null;
    let cancelled = false;
    const form = document.getElementById(formId) as HTMLFormElement | null;

    const onSubmit = (e: Event) => {
      const input = hidden.current;
      if (!input || !stripe || !element || input.value !== "") return;
      e.preventDefault();
      e.stopPropagation();
      setError(null);
      const s = stripe;
      const el = element;
      void tokenFor(s, el, setupUrl)
        .then((methodId) => {
          input.value = methodId;
          form?.requestSubmit();
        })
        .catch((err: unknown) => {
          setError(err instanceof Error ? err.message : errorLabel);
        });
    };

    void loadStripe(publishableKey).then((s) => {
      if (cancelled || !mount.current) return;
      stripe = s;
      const elements = s.elements();
      element = elements.create("card", {
        hidePostalCode: true,
        style: {
          base: {
            fontSize: "14px",
            fontFamily: "inherit",
            color: "#0f172a",
            "::placeholder": { color: "#94a3b8" },
          },
        },
      });
      element.mount(mount.current);
      element.on("change", (ev) => {
        setError(ev.error?.message ?? null);
        if (hidden.current) hidden.current.value = "";
      });
      setReady(true);
      form?.addEventListener("submit", onSubmit, true);
    });

    return () => {
      cancelled = true;
      form?.removeEventListener("submit", onSubmit, true);
      element?.unmount();
    };
  }, [publishableKey, formId, errorLabel, setupUrl]);

  if (!publishableKey)
    return (
      <div>
        <Label htmlFor={name}>{label}</Label>
        <Input id={name} name={name} placeholder="tok_visa" autoComplete="off" required />
        {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
      </div>
    );

  return (
    <div data-testid="card-field">
      <Label htmlFor={name}>{label}</Label>
      <div
        ref={mount}
        className="rounded-xl border border-border bg-background px-3 py-3"
        aria-busy={!ready}
      />
      <input ref={hidden} type="hidden" name={name} />
      {error ? (
        <p className="mt-1 text-xs text-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1 text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

/**
 * The 3-D Secure challenge, answered in place. Stripe hands us the intent's client
 * secret as the next step; the modal opens on mount and the form is submitted again
 * when the guest is through, so the server confirms an intent that is already good.
 * The button stays as the manual way out if the modal was dismissed or blocked.
 */
export function CardChallenge({
  formId,
  clientSecret,
  publishableKey,
  errorLabel,
}: {
  formId: string;
  clientSecret: string;
  publishableKey: string | null;
  errorLabel: string;
}) {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // "3ds:fake" and a redirect url are not client secrets: nothing for Stripe.js to run
    if (!publishableKey || !clientSecret.includes("_secret_")) return;
    let cancelled = false;
    void loadStripe(publishableKey)
      .then((s) => s.handleNextAction({ clientSecret }))
      .then((r) => {
        if (cancelled) return;
        if (r.error) {
          setError(r.error.message ?? errorLabel);
          return;
        }
        (document.getElementById(formId) as HTMLFormElement | null)?.requestSubmit();
      })
      .catch(() => {
        if (!cancelled) setError(errorLabel);
      });
    return () => {
      cancelled = true;
    };
  }, [publishableKey, clientSecret, formId, errorLabel]);

  if (!error) return null;
  return (
    <p className="mt-1 text-xs text-danger" role="alert">
      {error}
    </p>
  );
}

// ---- the sliver of Stripe.js we use, typed here so the app needs no SDK ----

interface StripeElement {
  mount(node: HTMLElement): void;
  unmount(): void;
  on(event: "change", cb: (e: { error?: { message?: string } }) => void): void;
}

interface StripeJs {
  elements(): { create(kind: "card", opts?: unknown): StripeElement };
  createPaymentMethod(opts: {
    type: "card";
    card: StripeElement;
  }): Promise<{ paymentMethod?: { id: string }; error?: { message?: string } }>;
  confirmCardSetup(
    clientSecret: string,
    data: { payment_method: { card: StripeElement } },
  ): Promise<{ setupIntent?: { payment_method?: string }; error?: { message?: string } }>;
  handleNextAction(opts: { clientSecret: string }): Promise<{ error?: { message?: string } }>;
}

/** The payment-method id the form posts: through a SetupIntent when we have one. */
async function tokenFor(
  stripe: StripeJs,
  element: StripeElement,
  setupUrl: string | undefined,
): Promise<string> {
  if (setupUrl) {
    const res = await fetch(setupUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    const body = (await res.json()) as { clientSecret?: string; detail?: string };
    if (!res.ok || !body.clientSecret) throw new Error(body.detail ?? "setup failed");
    const r = await stripe.confirmCardSetup(body.clientSecret, {
      payment_method: { card: element },
    });
    if (r.error || !r.setupIntent?.payment_method)
      throw new Error(r.error?.message ?? "setup failed");
    return r.setupIntent.payment_method;
  }
  const r = await stripe.createPaymentMethod({ type: "card", card: element });
  if (r.error || !r.paymentMethod) throw new Error(r.error?.message ?? "card failed");
  return r.paymentMethod.id;
}

declare global {
  interface Window {
    Stripe?: (key: string) => StripeJs;
  }
}

let loading: Promise<StripeJs> | null = null;

/** One script tag per page, whichever field asks for it first. */
function loadStripe(key: string): Promise<StripeJs> {
  loading ??= new Promise<StripeJs>((resolve, reject) => {
    if (window.Stripe) {
      resolve(window.Stripe(key));
      return;
    }
    const el = document.createElement("script");
    el.src = "https://js.stripe.com/v3/";
    el.async = true;
    el.onload = () => {
      if (window.Stripe) resolve(window.Stripe(key));
      else reject(new Error("Stripe.js did not load"));
    };
    el.onerror = () => reject(new Error("Stripe.js did not load"));
    document.head.appendChild(el);
  });
  return loading;
}
