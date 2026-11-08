"use client";

import Link from "next/link";
import { useActionState } from "react";
import { loginAction, requestSignInLinkAction } from "../auth.actions";
import { Alert, Button, Field, Input, Label } from "@/components/ui";

/**
 * One email field, two ways in: the password, or a sign-in link sent to that address.
 * The link button submits the same form to its own action without asking for the
 * password, so a forgotten password is one click away from a way in.
 */
export function LoginForm({
  labels,
  linkOnly,
}: {
  labels: Record<"email" | "password" | "submit" | "forgot" | "or" | "emailLink", string>;
  linkOnly: boolean;
}) {
  const [state, action, pending] = useActionState(loginAction, {});
  const [link, linkAction, linkPending] = useActionState(requestSignInLinkAction, {});
  const error = state.error ?? link.error;
  return (
    <form action={action} className="flex flex-col gap-[18px]">
      {error ? <Alert>{error}</Alert> : null}
      {link.message ? <Alert tone="success">{link.message}</Alert> : null}
      <Field label={labels.email} name="email" type="email" autoComplete="email" />
      {linkOnly ? null : (
        <>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between">
              <Label htmlFor="field-password">{labels.password}</Label>
              <Link
                href="/login?link=1"
                className="text-sm font-medium text-accent hover:text-accent-soft-foreground"
              >
                {labels.forgot}
              </Link>
            </div>
            <Input
              id="field-password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
            />
          </div>
          <Button type="submit" size="lg" disabled={pending} fullWidth>
            {labels.submit}
          </Button>
          <div className="flex items-center gap-3 text-xs text-muted" aria-hidden="true">
            <span className="h-px flex-1 bg-border" />
            {labels.or}
            <span className="h-px flex-1 bg-border" />
          </div>
        </>
      )}
      <Button
        type="submit"
        variant={linkOnly ? "primary" : "secondary"}
        size="lg"
        formAction={linkAction}
        formNoValidate
        disabled={linkPending}
        fullWidth
        data-testid="send-sign-in-link"
      >
        {labels.emailLink}
      </Button>
    </form>
  );
}
