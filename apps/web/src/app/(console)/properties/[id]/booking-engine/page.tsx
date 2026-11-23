import Link from "next/link";
import { cache } from "react";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { DrizzleBookingEngineRepository, rawRows, sql } from "@pms/db";
import { withPermission } from "@/server/with-permission";
import { container } from "@/server/container";
import {
  Alert,
  Card,
  Checkbox,
  Field,
  Input,
  PageTitle,
  Select,
  SubmitButton,
  TextareaField,
} from "@/components/ui";
import { money, percent } from "@/lib/format";
import { bpsToPercent, minorToDecimal } from "@/lib/amounts";
import {
  saveEngineSettingsAction,
  saveExtraAction,
  savePromoAction,
  setDirectOnlyAction,
  toggleEngineAction,
} from "./booking-engine.actions";

const loadEngine = withPermission<
  [{ propertyId: string }],
  {
    title: string;
    currency: string;
    settings: Awaited<ReturnType<DrizzleBookingEngineRepository["settings"]>>;
    promos: Awaited<ReturnType<DrizzleBookingEngineRepository["listPromos"]>>;
    extras: Awaited<ReturnType<DrizzleBookingEngineRepository["extras"]>>;
    ratePlans: Array<{ id: string; title: string; direct_only: boolean }>;
    appUrl: string;
  } | null
>(
  "channel:read",
  {
    scope: "property",
    resolveScope: (i) => ({ kind: "property", id: i.propertyId }),
    audit: false,
  },
  async (ctx, { propertyId }) => {
    const c = await container();
    const [p] = await rawRows<{ title: string; currency: string }>(
      ctx.tx,
      sql`select title, currency from property where id = ${propertyId} and archived_at is null`,
    );
    if (!p) return null;
    const repo = new DrizzleBookingEngineRepository(ctx.tx, ctx.orgId, c.crypto);
    return {
      title: p.title,
      currency: p.currency,
      settings: await repo.settings(propertyId),
      promos: (await repo.listPromos()).filter((x) => !x.propertyId || x.propertyId === propertyId),
      extras: await repo.extras(propertyId),
      ratePlans: await rawRows<{ id: string; title: string; direct_only: boolean }>(
        ctx.tx,
        sql`select id, title, direct_only from rate_plan where property_id = ${propertyId} and archived_at is null order by title`,
      ),
      appUrl: c.config.NEXT_PUBLIC_APP_URL,
    };
  },
);

/** One load per request, shared by the title and the page. */
const load = cache((propertyId: string) => loadEngine({ propertyId }));

const GUARANTEES = [
  "pay_at_property",
  "card_on_file",
  "deposit_fixed",
  "deposit_percent",
  "prepay",
] as const;
/** Fields the action can send back as unreadable (`?invalid=`), by the label they carry here. */
const INVALID = ["depositAmount", "depositPercent", "vatPercent", "cityTax", "value", "price"];

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [d, t] = await Promise.all([load(id), getTranslations("engine")]);
  return { title: d ? `${t("title")} · ${d.title}` : t("title") };
}

/** Per-property booking site (spec 10 §10.3–10.5): on/off, guarantee, taxes, theme, promo codes, extras, direct-only plans, embed. */
export default async function BookingEnginePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ invalid?: string }>;
}) {
  const { id } = await params;
  const { invalid } = await searchParams;
  const d = await load(id);
  if (!d) notFound();
  const [t, locale] = await Promise.all([getTranslations("engine"), getLocale()]);
  const s = d.settings;
  const g = s.guarantee;
  const cur = d.currency;
  const bad = invalid && INVALID.includes(invalid) ? invalid : null;
  const err = (field: string) => (bad === field ? t("invalidAmount") : undefined);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageTitle>
          {t("title")} · {d.title}
        </PageTitle>
        <div className="flex items-center gap-3 text-sm">
          <span
            className={`rounded px-2 py-0.5 text-xs ${s.enabled ? "bg-success-soft text-success-soft-foreground" : "bg-background"}`}
            data-testid="engine-state"
            data-enabled={s.enabled ? "1" : "0"}
          >
            {s.enabled ? t("enabled") : t("disabled")}
          </span>
          <form action={toggleEngineAction}>
            <input type="hidden" name="propertyId" value={id} />
            <input type="hidden" name="enabled" value={s.enabled ? "0" : "1"} />
            <SubmitButton variant="secondary" testId="toggle-engine" size="sm">
              {s.enabled ? t("toggleOff") : t("toggleOn")}
            </SubmitButton>
          </form>
          {s.enabled ? (
            <Link
              href={`/book/${id}`}
              className="underline"
              target="_blank"
              data-testid="open-storefront"
            >
              {t("openStorefront")}
            </Link>
          ) : null}
        </div>
      </div>
      {bad ? (
        <Alert tone="error" live={false}>
          {t("invalidBanner")}
        </Alert>
      ) : null}
      <Card title={t("settings")}>
        <form action={saveEngineSettingsAction} className="grid gap-3 sm:grid-cols-3">
          <input type="hidden" name="propertyId" value={id} />
          <div>
            <Select label={t("guarantee")} name="guarantee" defaultValue={g.kind}>
              {GUARANTEES.map((k) => (
                <option key={k} value={k}>
                  {t(`guarantees.${k}`)}
                </option>
              ))}
            </Select>
          </div>
          <Field
            label={t("depositAmount", { currency: cur })}
            name="depositAmount"
            inputMode="decimal"
            required={false}
            defaultValue={g.kind === "deposit_fixed" ? minorToDecimal(g.amountMinor, cur) : ""}
            description={t("depositAmountHint")}
            error={err("depositAmount")}
          />
          <Field
            label={t("depositPercent")}
            name="depositPercent"
            inputMode="decimal"
            required={false}
            defaultValue={g.kind === "deposit_percent" ? bpsToPercent(g.percentBps) : ""}
            description={t("depositPercentHint")}
            error={err("depositPercent")}
          />
          <Field
            label={t("vatBps")}
            name="vatPercent"
            inputMode="decimal"
            required={false}
            defaultValue={bpsToPercent(s.taxes.vatBps)}
            error={err("vatPercent")}
          />
          <Field
            label={t("cityTax", { currency: cur })}
            name="cityTax"
            inputMode="decimal"
            required={false}
            defaultValue={minorToDecimal(s.taxes.cityTaxPerPersonNightMinor, cur)}
            error={err("cityTax")}
          />
          <Field
            label={t("cityTaxMax")}
            name="cityTaxMax"
            type="number"
            min={0}
            required={false}
            defaultValue={s.taxes.cityTaxMaxNights === null ? "" : String(s.taxes.cityTaxMaxNights)}
          />
          <Field
            label={t("accessReveal")}
            name="accessRevealHours"
            type="number"
            min={0}
            required={false}
            defaultValue={String(s.accessRevealHours)}
          />
          <Field
            label={t("lat")}
            name="lat"
            inputMode="decimal"
            required={false}
            defaultValue={s.lat ?? ""}
          />
          <Field
            label={t("lng")}
            name="lng"
            inputMode="decimal"
            required={false}
            defaultValue={s.lng ?? ""}
          />
          <Field
            label={t("themeColour")}
            name="colour"
            required={false}
            defaultValue={s.theme.colour ?? ""}
            placeholder="#0f766e"
            spellCheck={false}
          />
          <div className="sm:col-span-2">
            <Field
              label={t("attributes")}
              name="attributes"
              required={false}
              defaultValue={s.attributes.join(", ")}
            />
          </div>
          <TextareaField
            className="sm:col-span-3"
            label={t("description")}
            name="description"
            rows={2}
            defaultValue={s.description ?? ""}
          />
          <TextareaField
            className="sm:col-span-3"
            label={t("houseManual")}
            name="houseManual"
            rows={3}
            defaultValue={s.houseManual ?? ""}
            description={
              <>
                {t("houseManualHint")}{" "}
                <Link
                  href={`/properties/${id}/guide?section=arrival`}
                  className="font-semibold text-accent hover:underline"
                >
                  {t("openGuide")}
                </Link>
              </>
            }
          />
          <Checkbox
            name="abandonment"
            defaultChecked={s.abandonmentEmails}
            className="sm:col-span-3"
          >
            {t("abandonment")}
          </Checkbox>
          <div>
            <SubmitButton testId="save-engine-settings" pendingLabel={t("saving")}>
              {t("save")}
            </SubmitButton>
          </div>
        </form>
      </Card>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title={t("promoCodes")}>
          <ul className="mb-3 space-y-1 text-sm" data-testid="promo-list">
            {d.promos.map((p) => (
              <li key={p.id} data-testid="promo-row">
                <code>{p.code}</code> ·{" "}
                {p.kind === "percent"
                  ? percent(p.value, { ratio: false, locale })
                  : money(p.value, cur, locale)}{" "}
                · {t("usesCount", { n: p.uses })}
                {p.singleUse ? ` · ${t("singleUse")}` : ""}
              </li>
            ))}
          </ul>
          <form action={savePromoAction} className="grid gap-2 sm:grid-cols-3">
            <input type="hidden" name="propertyId" value={id} />
            <Field label={t("code")} name="code" spellCheck={false} />
            <div>
              <Select label={t("kind")} name="kind" defaultValue="percent">
                <option value="percent">{t("percent")}</option>
                <option value="amount">{t("amountIn", { currency: cur })}</option>
              </Select>
            </div>
            <Field
              label={t("value")}
              name="value"
              inputMode="decimal"
              description={t("valueHint", { currency: cur })}
              error={err("value")}
            />
            <Field label={t("validFrom")} name="validFrom" type="date" required={false} />
            <Field label={t("validTo")} name="validTo" type="date" required={false} />
            <Field label={t("maxUses")} name="maxUses" type="number" min={1} required={false} />
            <Checkbox name="singleUse">{t("singleUse")}</Checkbox>
            <div>
              <SubmitButton testId="add-promo" pendingLabel={t("adding")}>
                {t("addPromo")}
              </SubmitButton>
            </div>
          </form>
        </Card>
        <Card title={t("extras")}>
          <ul className="mb-3 space-y-1 text-sm" data-testid="extra-list">
            {d.extras.map((e) => (
              <li key={e.id} data-testid="extra-row">
                {e.name} · {money(e.priceMinor, cur, locale)} /{" "}
                {e.per === "night"
                  ? t("perNight")
                  : e.per === "person"
                    ? t("perPerson")
                    : t("perStay")}
              </li>
            ))}
          </ul>
          <form action={saveExtraAction} className="grid gap-2 sm:grid-cols-3">
            <input type="hidden" name="propertyId" value={id} />
            <Field label={t("extraName")} name="name" />
            <Field
              label={t("price", { currency: cur })}
              name="price"
              inputMode="decimal"
              error={err("price")}
            />
            <div>
              <Select label={t("per")} name="per" defaultValue="stay">
                <option value="stay">{t("perStay")}</option>
                <option value="night">{t("perNight")}</option>
                <option value="person">{t("perPerson")}</option>
              </Select>
            </div>
            <div>
              <SubmitButton testId="add-extra" pendingLabel={t("adding")}>
                {t("addExtra")}
              </SubmitButton>
            </div>
          </form>
        </Card>
      </div>
      <Card title={t("ratePlans")}>
        <ul className="space-y-1 text-sm" data-testid="rate-plan-list">
          {d.ratePlans.map((rp) => (
            <li
              key={rp.id}
              className="flex items-center justify-between gap-3"
              data-direct-only={rp.direct_only ? "1" : "0"}
            >
              <span>
                {rp.title} · {rp.direct_only ? t("directOnly") : t("everywhere")}
              </span>
              <form action={setDirectOnlyAction}>
                <input type="hidden" name="propertyId" value={id} />
                <input type="hidden" name="ratePlanId" value={rp.id} />
                <input type="hidden" name="directOnly" value={rp.direct_only ? "0" : "1"} />
                <SubmitButton
                  variant="secondary"
                  testId="toggle-direct-only"
                  size="sm"
                  aria-label={`${rp.direct_only ? t("makeShared") : t("makeDirectOnly")}: ${rp.title}`}
                >
                  {rp.direct_only ? t("makeShared") : t("makeDirectOnly")}
                </SubmitButton>
              </form>
            </li>
          ))}
        </ul>
      </Card>
      <Card title={t("embedTitle")}>
        <p className="mb-2 text-xs text-muted">{t("embedHint")}</p>
        <pre
          className="overflow-x-auto rounded bg-foreground p-3 text-xs text-background"
          data-testid="embed-snippet"
        >
          {`<div id="book"></div>\n<script src="${d.appUrl}/widget.js" data-property="${id}" data-target="#book"></script>`}
        </pre>
        <p className="mt-2 text-xs text-muted">
          <Input readOnly value={`${d.appUrl}/book/${id}`} aria-label={t("bookingSiteUrl")} />
        </p>
      </Card>
    </div>
  );
}
