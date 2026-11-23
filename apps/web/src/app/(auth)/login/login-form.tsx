"use client";

import Link from "next/link";
import { useActionState } from "react";
import { loginAction, requestSignInLinkAction } from "../auth.actions";
import { Alert, Button, Field, Input, Label } from "@/components/ui";

/**
 * One email field, two ways in: the password, or a sign-in link sent to that address.
 * The link button submits the same form to its own action without asking for the
 * password, so a forgotten password is one click away from a way in. A failed attempt
 * keeps the email; only the password is typed again.
 */
export function LoginForm({
  labels,
  linkOnly,
  next = "",
}: {
  labels: Record<
    "email" | "password" | "submit" | "submitting" | "forgot" | "or" | "emailLink" | "sending",
    string
  >;
  linkOnly: boolean;
  /** The page to return to after signing in. */
  next?: string;
}) {
  const [state, action, pending] = useActionState(loginAction, {});
  const [link, linkAction, linkPending] = useActionState(requestSignInLinkAction, {});
  const error = state.error ?? link.error;
  // the most recent answer decides what the email field shows again
  const email = link.values?.email ?? state.values?.email;
  return (
    <form action={action} className="flex flex-col gap-[18px]">
      {error ? <Alert>{error}</Alert> : null}
      {link.message ? <Alert tone="success">{link.message}</Alert> : null}
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <Field
        label={labels.email}
        name="email"
        type="email"
        autoComplete="email"
        spellCheck={false}
        defaultValue={email}
      />
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
              aria-invalid={state.error ? true : undefined}
            />
          </div>
          {/* two actions share the form, so each button follows its own action's pending state */}
          <Button
            type="submit"
            size="lg"
            disabled={pending}
            aria-busy={pending || undefined}
            fullWidth
          >
            {pending ? labels.submitting : labels.submit}
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
        aria-busy={linkPending || undefined}
        fullWidth
        data-testid="send-sign-in-link"
      >
        {linkPending ? labels.sending : labels.emailLink}
      </Button>
    </form>
  );
}
