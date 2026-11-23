"use client";

import { useActionState, useState } from "react";
import { signUpAction } from "../auth.actions";
import { Alert, Field, Select, SubmitButton } from "@/components/ui";
import type { IsoOption } from "@/lib/iso";

type Labels = Record<
  | "name"
  | "namePlaceholder"
  | "email"
  | "emailPlaceholder"
  | "password"
  | "passwordHint"
  | "organizationName"
  | "organizationPlaceholder"
  | "slugBefore"
  | "slugAfter"
  | "country"
  | "currency"
  | "choose"
  | "submit"
  | "submitting",
  string
>;

/** Lowercase, accents dropped, anything else a dash: what the server accepts as a slug. */
const slugify = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

/**
 * The organization in one card. The web address follows the organization name until it is
 * edited in the helper line; the currency follows the country until it is picked. A failed
 * attempt comes back with one message per field and everything typed except the password.
 */
export function SignupForm({
  labels,
  countries,
  currencies,
  defaults,
  currencyFor,
}: {
  labels: Labels;
  countries: IsoOption[];
  currencies: IsoOption[];
  defaults: { country: string | null; currency: string | null };
  currencyFor: Record<string, string>;
}) {
  const [state, action] = useActionState(signUpAction, {});
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [country, setCountry] = useState(defaults.country ?? "");
  const [currency, setCurrency] = useState(defaults.currency ?? "");
  const [currencyPicked, setCurrencyPicked] = useState(false);
  const v = state.values ?? {};
  const fe = state.fieldErrors ?? {};
  return (
    <form
      action={action}
      className="flex flex-col gap-4"
      // the organization name is a kit Field; its keystrokes reach the slug through the form
      onChange={(e) => {
        const target: EventTarget = e.target;
        if (target instanceof HTMLInputElement && target.name === "organizationName" && !slugEdited)
          setSlug(slugify(target.value));
      }}
    >
      {state.error ? <Alert>{state.error}</Alert> : null}
      <Field
        label={labels.name}
        name="name"
        autoComplete="name"
        placeholder={labels.namePlaceholder}
        defaultValue={v.name}
        error={fe.name}
      />
      <Field
        label={labels.email}
        name="email"
        type="email"
        autoComplete="email"
        spellCheck={false}
        placeholder={labels.emailPlaceholder}
        defaultValue={v.email}
        error={fe.email}
      />
      <Field
        label={labels.password}
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={12}
        description={labels.passwordHint}
        error={fe.password}
      />
      <div className="flex flex-col gap-1.5">
        <Field
          label={labels.organizationName}
          name="organizationName"
          autoComplete="organization"
          placeholder={labels.organizationPlaceholder}
          defaultValue={v.organizationName}
          error={fe.organizationName}
        />
        <p className="text-xs font-medium text-muted">
          <label htmlFor="field-slug">{labels.slugBefore}</label>{" "}
          <input
            id="field-slug"
            name="slug"
            aria-invalid={fe.slug ? true : undefined}
            aria-describedby={fe.slug ? "field-slug-err" : "field-slug-hint"}
            required
            pattern="[a-z0-9-]{3,40}"
            spellCheck={false}
            autoCapitalize="none"
            value={slug}
            placeholder="coastal-stays"
            size={Math.max(14, slug.length + 1)}
            onChange={(e) => {
              setSlugEdited(true);
              setSlug(e.target.value.toLowerCase());
            }}
            className="rounded-md border border-border-control bg-surface px-1.5 py-0.5 font-bold text-foreground focus:border-accent aria-invalid:border-danger"
          />{" "}
          <span id="field-slug-hint">{labels.slugAfter}</span>
        </p>
        {fe.slug ? (
          <p id="field-slug-err" aria-live="polite" className="text-xs font-medium text-danger">
            {fe.slug}
          </p>
        ) : null}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Select
          label={labels.country}
          name="country"
          id="field-country"
          required
          placeholder={labels.choose}
          value={country}
          onChange={(c) => {
            setCountry(c);
            if (!currencyPicked && currencyFor[c]) setCurrency(currencyFor[c]);
          }}
          options={countries}
          error={fe.country}
        />
        <Select
          label={labels.currency}
          name="currency"
          id="field-currency"
          required
          placeholder={labels.choose}
          value={currency}
          onChange={(c) => {
            setCurrencyPicked(true);
            setCurrency(c);
          }}
          options={currencies}
          error={fe.currency}
        />
      </div>
      <SubmitButton size="lg" fullWidth className="mt-1" pendingLabel={labels.submitting}>
        {labels.submit}
      </SubmitButton>
    </form>
  );
}
