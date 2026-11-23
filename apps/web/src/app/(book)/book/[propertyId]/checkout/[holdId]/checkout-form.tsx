"use client";

import type React from "react";
import { useActionState, useEffect, useRef } from "react";
import { confirmAction, type ConfirmState } from "../../../book.actions";
import { Alert, Button, Field, TextareaField } from "@/components/ui";
import { CardChallenge, CardField } from "@/components/card-field";

const FORM_ID = "checkout-form";

/** A numbered white section of the checkout ("1 · Who is staying"). */
function Section({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3.5 rounded-2xl border border-border bg-surface p-5">
      {title ? <h2 className="text-[17px] font-semibold text-foreground">{title}</h2> : null}
      {children}
    </section>
  );
}

type Guest = {
  name: string;
  surname: string;
  email: string;
  phone: string | null;
  requests?: string | null;
  consent?: boolean;
};

/**
 * One form, one idempotency key (BE-6): a double click sends the same key twice and
 * gets the same booking. A declined card gets a fresh key so the retry is a new
 * attempt. The card is entered in Stripe's hosted field mounted on the marked element
 * and never reaches us; with no publishable key the field takes a token, which is what
 * the fake provider expects (spec 10 §10.4). The guest accepts the rate's terms before
 * paying (BE-1: nothing about the cancellation policy is a surprise). What went wrong
 * shows next to the button that was pressed, and takes the focus so a phone scrolls to it.
 */
export function CheckoutForm({
  holdId,
  idempotencyKey,
  needsPayment,
  guest,
  publishableKey,
  paymentLine,
  acceptLine,
  labels,
}: {
  holdId: string;
  idempotencyKey: string;
  needsPayment: boolean;
  guest: Guest | null;
  publishableKey: string | null;
  paymentLine: string;
  acceptLine: string;
  labels: Record<string, string>;
}) {
  const [state, action, pending] = useActionState<ConfirmState, FormData>(confirmAction, {});
  const key = state.idempotencyKey ?? idempotencyKey;
  // React resets a form after its action; remount the fields with what the guest typed
  const g: Guest | null = state.guest ?? guest;
  const problem =
    state.error ?? (state.declined ? labels.declined!.replace("{reason}", state.declined) : null);
  const problemRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!problem || !problemRef.current) return;
    problemRef.current.scrollIntoView({ block: "center", behavior: "smooth" });
    problemRef.current.focus({ preventScroll: true });
  }, [state, problem]);
  const problemAlert = problem ? (
    <div ref={problemRef} tabIndex={-1} className="outline-none" role="alert">
      <Alert live={false}>
        {state.declined ? <span data-testid="declined">{problem}</span> : problem}
      </Alert>
    </div>
  ) : null;
  return (
    <form id={FORM_ID} action={action} className="flex flex-col gap-5" data-testid="checkout-form">
      <input type="hidden" name="holdId" value={holdId} />
      <input type="hidden" name="idempotencyKey" value={key} />
      {state.requiresAction ? (
        <Section title={labels.payment}>
          <p className="text-sm" data-testid="requires-action">
            {labels.requiresAction}
          </p>
          <CardChallenge
            formId={FORM_ID}
            clientSecret={state.requiresAction}
            publishableKey={publishableKey}
            errorLabel={labels.cardError!}
          />
          {problemAlert}
          <Button type="submit" disabled={pending} data-testid="complete-3ds">
            {labels.completeVerification}
          </Button>
        </Section>
      ) : (
        <>
          <Section title={labels.whoIsStaying}>
            <div className="grid gap-3.5 sm:grid-cols-2" key={key}>
              <Field
                label={labels.firstName!}
                name="firstName"
                autoComplete="given-name"
                defaultValue={g?.name}
              />
              <Field
                label={labels.lastName!}
                name="lastName"
                autoComplete="family-name"
                defaultValue={g?.surname}
              />
              <Field
                label={labels.email!}
                name="email"
                type="email"
                autoComplete="email"
                spellCheck={false}
                defaultValue={g?.email}
                description={labels.emailHint}
              />
              <Field
                label={labels.phone!}
                name="phone"
                type="tel"
                required={false}
                autoComplete="tel"
                defaultValue={g?.phone ?? undefined}
              />
            </div>
            <div className="flex flex-col gap-3.5" key={`${key}-more`}>
              <TextareaField
                label={labels.requests!}
                name="requests"
                rows={2}
                placeholder={labels.requestsPlaceholder}
                defaultValue={g?.requests ?? undefined}
              />
              <label className="inline-flex items-center gap-2.5 text-[13px] text-muted">
                <input
                  type="checkbox"
                  name="consent"
                  defaultChecked={g?.consent ?? false}
                  className="size-4 accent-accent"
                />
                {labels.consent}
              </label>
            </div>
          </Section>
          <Section title={needsPayment ? labels.payment : undefined}>
            <p className="text-[13px] leading-relaxed text-muted">{paymentLine}</p>
            {needsPayment ? (
              <div data-payment-mount>
                <CardField
                  formId={FORM_ID}
                  name="cardToken"
                  label={labels.cardToken!}
                  publishableKey={publishableKey}
                  errorLabel={labels.cardError!}
                />
              </div>
            ) : null}
          </Section>
          <Section>
            <label className="flex items-start gap-2.5 text-[13px] leading-normal">
              <input
                type="checkbox"
                name="accept"
                required
                className="mt-0.5 size-4 shrink-0 accent-accent"
                data-testid="accept-terms"
              />
              <span>{acceptLine}</span>
            </label>
          </Section>
          {problemAlert}
          <Button
            type="submit"
            size="lg"
            disabled={pending}
            aria-busy={pending || undefined}
            fullWidth
            className="h-12 text-base"
            data-testid="confirm-booking"
          >
            {pending ? labels.confirming : labels.confirm}
          </Button>
          <p className="text-xs text-muted">{labels.afterConfirm}</p>
        </>
      )}
    </form>
  );
}
