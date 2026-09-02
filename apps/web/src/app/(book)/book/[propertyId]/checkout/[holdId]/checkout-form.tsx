"use client";

import { useActionState } from "react";
import { confirmAction, type ConfirmState } from "../../../book.actions";
import { Alert, Button, Field, Label } from "@/components/ui";

/**
 * One form, one idempotency key (BE-6): a double click sends the same key twice and
 * gets the same booking. A declined card gets a fresh key so the retry is a new
 * attempt. Card fields are the provider's hosted elements mounted on the marked
 * element; the fake provider takes a token directly (spec 10 §10.4).
 */
export function CheckoutForm({
  holdId,
  idempotencyKey,
  needsPayment,
  guest,
  labels,
}: {
  holdId: string;
  idempotencyKey: string;
  needsPayment: boolean;
  guest: { name: string; surname: string; email: string; phone: string | null } | null;
  labels: Record<string, string>;
}) {
  const [state, action, pending] = useActionState<ConfirmState, FormData>(confirmAction, {});
  const key = state.idempotencyKey ?? idempotencyKey;
  // React resets a form after its action; remount the fields with what the guest typed
  const g = state.guest ?? guest;
  return (
    <form action={action} className="space-y-4" data-testid="checkout-form">
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
        <fieldset className="rounded border border-amber-300 bg-amber-50 p-3 text-sm">
          <legend>{labels.payment}</legend>
          <p data-testid="requires-action">{labels.requiresAction}</p>
          <Button type="submit" disabled={pending} className="mt-2" data-testid="complete-3ds">
            {labels.completeVerification}
          </Button>
        </fieldset>
      ) : (
        <>
          <fieldset className="grid gap-3 sm:grid-cols-2" key={key}>
            <legend className="mb-1 font-semibold">{labels.guestDetails}</legend>
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
            />
            <Field
              label={labels.phone!}
              name="phone"
              type="tel"
              required={false}
              autoComplete="tel"
              defaultValue={g?.phone ?? undefined}
            />
            <div className="sm:col-span-2">
              <Label htmlFor="requests">{labels.requests!}</Label>
              <textarea
                id="requests"
                name="requests"
                rows={2}
                className="w-full rounded border border-slate-300 p-2 text-sm"
              />
            </div>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" name="consent" /> {labels.consent}
            </label>
          </fieldset>
          {needsPayment ? (
            <fieldset className="space-y-2">
              <legend className="mb-1 font-semibold">{labels.payment}</legend>
              <div data-payment-mount>
                <Field
                  label={labels.cardToken!}
                  name="cardToken"
                  autoComplete="off"
                  placeholder="tok_visa"
                />
              </div>
              <p className="text-xs text-slate-500">{labels.paymentHint}</p>
            </fieldset>
          ) : null}
          <Button type="submit" disabled={pending} className="w-full" data-testid="confirm-booking">
            {pending ? labels.confirming : labels.confirm}
          </Button>
        </>
      )}
    </form>
  );
}
