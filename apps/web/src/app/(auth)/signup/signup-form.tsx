"use client";

import { useActionState, useState } from "react";
import { signUpAction } from "../auth.actions";
import { Alert, Button, Field, Select } from "@/components/ui";
import type { IsoOption } from "@/lib/iso";

type Labels = Record<
  | "name"
  | "namePlaceholder"
  | "email"
  | "emailPlaceholder"
  | "password"
  | "passwordPlaceholder"
  | "organizationName"
  | "organizationPlaceholder"
  | "slug"
  | "slugBefore"
  | "slugAfter"
  | "country"
  | "currency"
  | "choose"
  | "submit",
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
 * The organization in one card. The slug follows the organization name until it is
 * edited in the helper line; the currency follows the country until it is picked.
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
  const [state, action, pending] = useActionState(signUpAction, {});
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [country, setCountry] = useState(defaults.country ?? "");
  const [currency, setCurrency] = useState(defaults.currency ?? "");
  const [currencyPicked, setCurrencyPicked] = useState(false);
  return (
    <form action={action} className="flex flex-col gap-4">
      {state.error ? <Alert>{state.error}</Alert> : null}
      <Field
        label={labels.name}
        name="name"
        autoComplete="name"
        placeholder={labels.namePlaceholder}
      />
      <Field
        label={labels.email}
        name="email"
        type="email"
        autoComplete="email"
        placeholder={labels.emailPlaceholder}
      />
      <Field
        label={labels.password}
        name="password"
        type="password"
        autoComplete="new-password"
        placeholder={labels.passwordPlaceholder}
      />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="field-organizationName" className="text-sm font-semibold text-foreground">
          {labels.organizationName}
        </label>
        <input
          id="field-organizationName"
          name="organizationName"
          required
          autoComplete="organization"
          placeholder={labels.organizationPlaceholder}
          onChange={(e) => {
            if (!slugEdited) setSlug(slugify(e.target.value));
          }}
          className="block h-10.5 w-full min-w-0 rounded-control border border-border bg-surface px-3.5 text-sm text-foreground placeholder:text-muted/80 focus:border-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
        />
        <p className="text-xs font-medium text-muted">
          {labels.slugBefore}{" "}
          <input
            name="slug"
            aria-label={labels.slug}
            required
            pattern="[a-z0-9-]{3,40}"
            value={slug}
            placeholder="coastal-stays"
            size={Math.max(14, slug.length + 1)}
            onChange={(e) => {
              setSlugEdited(true);
              setSlug(e.target.value.toLowerCase());
            }}
            className="rounded-md border border-transparent bg-transparent px-1 font-bold text-foreground hover:border-border focus:border-accent focus:outline-none"
          />{" "}
          {labels.slugAfter}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Select
          label={labels.country}
          name="country"
          id="field-country"
          required
          placeholder={labels.choose}
          value={country}
          onChange={(v) => {
            setCountry(v);
            if (!currencyPicked && currencyFor[v]) setCurrency(currencyFor[v]);
          }}
          options={countries}
        />
        <Select
          label={labels.currency}
          name="currency"
          id="field-currency"
          required
          placeholder={labels.choose}
          value={currency}
          onChange={(v) => {
            setCurrencyPicked(true);
            setCurrency(v);
          }}
          options={currencies}
        />
      </div>
      <Button type="submit" size="lg" disabled={pending} fullWidth className="mt-1">
        {labels.submit}
      </Button>
    </form>
  );
}
