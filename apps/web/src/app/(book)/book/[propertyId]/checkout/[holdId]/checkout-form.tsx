"use client";

import type React from "react";
import { useActionState } from "react";
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

/**
 * One form, one idempotency key (BE-6): a double click sends the same key twice and
 * gets the same booking. A declined card gets a fresh key so the retry is a new
 * attempt. The card is entered in Stripe's hosted field mounted on the marked element
 * and never reaches us; with no publishable key the field takes a token, which is what
 * the fake provider expects (spec 10 §10.4). The guest accepts the rate's terms before
 * paying (BE-1: nothing about the cancellation policy is a surprise).
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
  guest: { name: string; surname: string; email: string; phone: string | null } | null;
  publishableKey: string | null;
  paymentLine: string;
  acceptLine: string;
  labels: Record<string, string>;
}) {
  const [state, action, pending] = useActionState<ConfirmState, FormData>(confirmAction, {});
  const key = state.idempotencyKey ?? idempotencyKey;
  // React resets a form after its action; remount the fields with what the guest typed
  const g = state.guest ?? guest;
  return (
    <form id={FORM_ID} action={action} className="flex flex-col gap-5" data-testid="checkout-form">
      <input type="hidden" name="holdId" value={holdId} />
      <input type="hidden" name="idempotencyKey" value={key} />
      {state.error ? (
        <Alert>{state.error === "hold_gone" ? labels.holdExpired : state.error}</Alert>
      ) : null}
      {state.declined ? (
        <Alert>
          <span data-testid="declined">{labels.declined!.replace("{reason}", state.declined)}</span>
        </Alert>
      ) : null}
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
            <TextareaField
              label={labels.requests!}
              name="requests"
              rows={2}
              placeholder={labels.requestsPlaceholder}
            />
            <label className="inline-flex items-center gap-2.5 text-[13px] text-muted">
              <input type="checkbox" name="consent" className="size-4 accent-accent" />
              {labels.consent}
            </label>
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
          <Button
            type="submit"
            size="lg"
            disabled={pending}
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
