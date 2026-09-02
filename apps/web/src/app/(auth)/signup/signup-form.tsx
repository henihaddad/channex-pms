"use client";

import { useActionState } from "react";
import { signUpAction } from "../auth.actions";
import { Alert, Button, Field } from "@/components/ui";

type Labels = Record<
  "name" | "email" | "password" | "organizationName" | "slug" | "country" | "currency" | "submit",
  string
>;

export function SignupForm({ labels }: { labels: Labels }) {
  const [state, action, pending] = useActionState(signUpAction, {});
  return (
    <form action={action} className="space-y-4">
      {state.error ? <Alert>{state.error}</Alert> : null}
      <Field label={labels.name} name="name" autoComplete="name" />
      <Field label={labels.email} name="email" type="email" autoComplete="email" />
      <Field label={labels.password} name="password" type="password" autoComplete="new-password" />
      <Field label={labels.organizationName} name="organizationName" autoComplete="organization" />
      <Field label={labels.slug} name="slug" placeholder="coastal-stays" />
      <div className="grid grid-cols-2 gap-3">
        <Field label={labels.country} name="country" placeholder="PT" />
        <Field label={labels.currency} name="currency" placeholder="EUR" />
      </div>
      <Button type="submit" disabled={pending} className="w-full">
        {labels.submit}
      </Button>
    </form>
  );
}
