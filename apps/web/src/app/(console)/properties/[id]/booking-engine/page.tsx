import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { DrizzleBookingEngineRepository, rawRows, sql } from "@pms/db";
import { withPermission } from "@/server/with-permission";
import { container } from "@/server/container";
import { Button, Card, Field, Input, Label, PageTitle, Select } from "@/components/ui";
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
    const [p] = await rawRows<{ title: string }>(
      ctx.tx,
      sql`select title from property where id = ${propertyId} and archived_at is null`,
    );
    if (!p) return null;
    const repo = new DrizzleBookingEngineRepository(ctx.tx, ctx.orgId, c.crypto);
    return {
      title: p.title,
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

/** Per-property engine configuration (spec 10 §10.3–10.5): channel on/off, guarantee, taxes, theme, promo codes, extras, direct-only plans, embed. */
export default async function BookingEnginePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await loadEngine({ propertyId: id });
  if (!d) notFound();
  const t = await getTranslations("engine");
  const s = d.settings;
  const g = s.guarantee;
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <PageTitle>
          {t("title")} · {d.title}
        </PageTitle>
        <div className="flex items-center gap-3 text-sm">
          <span
            className={`rounded px-2 py-0.5 text-xs ${s.enabled ? "bg-mint-soft text-mint-deep" : "bg-canvas"}`}
            data-testid="engine-state"
            data-enabled={s.enabled ? "1" : "0"}
          >
            {s.enabled ? t("enabled") : t("disabled")}
          </span>
          <form action={toggleEngineAction}>
            <input type="hidden" name="propertyId" value={id} />
            <input type="hidden" name="enabled" value={s.enabled ? "0" : "1"} />
            <Button
              type="submit"
              variant="secondary"
              className="h-7 text-xs"
              data-testid="toggle-engine"
            >
              {s.enabled ? t("toggleOff") : t("toggleOn")}
            </Button>
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
      <Card>
        <h2 className="mb-2 font-semibold">{t("settings")}</h2>
        <form action={saveEngineSettingsAction} className="grid gap-3 sm:grid-cols-3">
          <input type="hidden" name="propertyId" value={id} />
          <div>
            <Label htmlFor="guarantee">{t("guarantee")}</Label>
            <Select id="guarantee" name="guarantee" defaultValue={g.kind}>
              {[
                "pay_at_property",
                "card_on_file",
                "deposit_fixed",
                "deposit_percent",
                "prepay",
              ].map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </Select>
          </div>
          <Field
            label="Deposit amount (minor)"
            name="depositAmount"
            type="number"
            required={false}
            defaultValue={g.kind === "deposit_fixed" ? String(g.amountMinor) : ""}
          />
          <Field
            label="Deposit (bps)"
            name="depositBps"
            type="number"
            required={false}
            defaultValue={g.kind === "deposit_percent" ? String(g.percentBps) : ""}
          />
          <Field
            label={t("vatBps")}
            name="vatBps"
            type="number"
            required={false}
            defaultValue={String(s.taxes.vatBps)}
          />
          <Field
            label={t("cityTax")}
            name="cityTax"
            type="number"
            required={false}
            defaultValue={String(s.taxes.cityTaxPerPersonNightMinor)}
          />
          <Field
            label={t("cityTaxMax")}
            name="cityTaxMax"
            type="number"
            required={false}
            defaultValue={s.taxes.cityTaxMaxNights === null ? "" : String(s.taxes.cityTaxMaxNights)}
          />
          <Field
            label={t("accessReveal")}
            name="accessRevealHours"
            type="number"
            required={false}
            defaultValue={String(s.accessRevealHours)}
          />
          <Field label={t("lat")} name="lat" required={false} defaultValue={s.lat ?? ""} />
          <Field label={t("lng")} name="lng" required={false} defaultValue={s.lng ?? ""} />
          <Field
            label={t("themeColour")}
            name="colour"
            required={false}
            defaultValue={s.theme.colour ?? ""}
            placeholder="#0f766e"
          />
          <div className="sm:col-span-2">
            <Field
              label={t("attributes")}
              name="attributes"
              required={false}
              defaultValue={s.attributes.join(", ")}
            />
          </div>
          <div className="sm:col-span-3">
            <Label htmlFor="description">{t("description")}</Label>
            <textarea
              id="description"
              name="description"
              rows={2}
              className="w-full rounded border border-line-strong p-2 text-sm"
              defaultValue={s.description ?? ""}
            />
          </div>
          <div className="sm:col-span-3">
            <Label htmlFor="houseManual">{t("houseManual")}</Label>
            <textarea
              id="houseManual"
              name="houseManual"
              rows={3}
              className="w-full rounded border border-line-strong p-2 text-sm"
              defaultValue={s.houseManual ?? ""}
            />
          </div>
          <label className="flex items-center gap-2 text-sm sm:col-span-3">
            <input type="checkbox" name="abandonment" defaultChecked={s.abandonmentEmails} />{" "}
            {t("abandonment")}
          </label>
          <div>
            <Button type="submit" data-testid="save-engine-settings">
              {t("save")}
            </Button>
          </div>
        </form>
      </Card>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-2 font-semibold">{t("promoCodes")}</h2>
          <ul className="mb-3 space-y-1 text-sm" data-testid="promo-list">
            {d.promos.map((p) => (
              <li key={p.id} data-testid="promo-row">
                <code>{p.code}</code> ·{" "}
                {p.kind === "percent" ? `${String(p.value)}%` : `${String(p.value)} minor`} ·{" "}
                {String(p.uses)} {t("uses")}
                {p.singleUse ? ` · ${t("singleUse")}` : ""}
              </li>
            ))}
          </ul>
          <form action={savePromoAction} className="grid gap-2 sm:grid-cols-3">
            <input type="hidden" name="propertyId" value={id} />
            <Field label={t("code")} name="code" />
            <div>
              <Label htmlFor="kind">{t("kind")}</Label>
              <Select id="kind" name="kind" defaultValue="percent">
                <option value="percent">{t("percent")}</option>
                <option value="amount">{t("amount")}</option>
              </Select>
            </div>
            <Field label={t("value")} name="value" type="number" />
            <Field label={t("validFrom")} name="validFrom" type="date" required={false} />
            <Field label={t("validTo")} name="validTo" type="date" required={false} />
            <Field label={t("maxUses")} name="maxUses" type="number" required={false} />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="singleUse" /> {t("singleUse")}
            </label>
            <div>
              <Button type="submit" data-testid="add-promo">
                {t("addPromo")}
              </Button>
            </div>
          </form>
        </Card>
        <Card>
          <h2 className="mb-2 font-semibold">{t("extras")}</h2>
          <ul className="mb-3 space-y-1 text-sm" data-testid="extra-list">
            {d.extras.map((e) => (
              <li key={e.id} data-testid="extra-row">
                {e.name} · {String(e.priceMinor)} / {e.per}
              </li>
            ))}
          </ul>
          <form action={saveExtraAction} className="grid gap-2 sm:grid-cols-3">
            <input type="hidden" name="propertyId" value={id} />
            <Field label={t("extraName")} name="name" />
            <Field label={t("price")} name="priceMinor" type="number" />
            <div>
              <Label htmlFor="per">{t("per")}</Label>
              <Select id="per" name="per" defaultValue="stay">
                <option value="stay">{t("perStay")}</option>
                <option value="night">{t("perNight")}</option>
                <option value="person">{t("perPerson")}</option>
              </Select>
            </div>
            <div>
              <Button type="submit" data-testid="add-extra">
                {t("addExtra")}
              </Button>
            </div>
          </form>
        </Card>
      </div>
      <Card>
        <h2 className="mb-2 font-semibold">{t("ratePlans")}</h2>
        <ul className="space-y-1 text-sm" data-testid="rate-plan-list">
          {d.ratePlans.map((rp) => (
            <li
              key={rp.id}
              className="flex items-center justify-between"
              data-direct-only={rp.direct_only ? "1" : "0"}
            >
              <span>
                {rp.title} · {rp.direct_only ? t("directOnly") : t("everywhere")}
              </span>
              <form action={setDirectOnlyAction}>
                <input type="hidden" name="propertyId" value={id} />
                <input type="hidden" name="ratePlanId" value={rp.id} />
                <input type="hidden" name="directOnly" value={rp.direct_only ? "0" : "1"} />
                <Button
                  type="submit"
                  variant="secondary"
                  className="h-7 text-xs"
                  data-testid="toggle-direct-only"
                >
                  {rp.direct_only ? t("makeShared") : t("makeDirectOnly")}
                </Button>
              </form>
            </li>
          ))}
        </ul>
      </Card>
      <Card>
        <h2 className="mb-1 font-semibold">{t("embedTitle")}</h2>
        <p className="mb-2 text-xs text-muted">{t("embedHint")}</p>
        <pre
          className="overflow-x-auto rounded bg-ink p-3 text-xs text-white/80"
          data-testid="embed-snippet"
        >
          {`<div id="book"></div>\n<script src="${d.appUrl}/widget.js" data-property="${id}" data-target="#book"></script>`}
        </pre>
        <p className="mt-2 text-xs text-muted">
          <Input readOnly value={`${d.appUrl}/book/${id}`} aria-label="storefront url" />
        </p>
      </Card>
    </div>
  );
}
