import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { DrizzleRateImportRepository, rawRows, sql, type RateImportSettings } from "@pms/db";
import { withPermission } from "@/server/with-permission";
import {
  Alert,
  Breadcrumbs,
  Button,
  Card,
  Chip,
  Field,
  Label,
  PageHeader,
  Select,
} from "@/components/ui";
import { ImportForm } from "./import-form";
import { saveRateImportAction } from "./pricing.actions";

const loadPricing = withPermission<
  [{ propertyId: string }],
  {
    title: string;
    currency: string;
    settings: RateImportSettings;
    ratePlans: Array<{ id: string; title: string }>;
  } | null
>(
  "yield_rule:read",
  {
    scope: "property",
    resolveScope: (i) => ({ kind: "property", id: i.propertyId }),
    audit: false,
  },
  async (ctx, { propertyId }) => {
    const [p] = await rawRows<{ title: string; currency: string }>(
      ctx.tx,
      sql`select title, currency from property where id = ${propertyId} and archived_at is null`,
    );
    if (!p) return null;
    return {
      title: p.title,
      currency: p.currency,
      settings: await new DrizzleRateImportRepository(ctx.tx, ctx.orgId).get(propertyId),
      ratePlans: await rawRows<{ id: string; title: string }>(
        ctx.tx,
        sql`select id, title from rate_plan where property_id = ${propertyId} and archived_at is null order by title`,
      ),
    };
  },
);

/**
 * Rate import (spec 06 §6.5b): prices from PriceLabs, Wheelhouse or a spreadsheet, through
 * the guard rails and the same dry run and undo as a bulk edit. The page leads with the
 * guard rails, because they are what makes handing pricing to a machine safe.
 */
export default async function PricingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await loadPricing({ propertyId: id });
  if (!d) notFound();
  const t = await getTranslations("pricing");
  const tp = await getTranslations("properties");
  const s = d.settings;
  const refs = Object.keys(s.mapping);
  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { href: "/properties", label: tp("title") },
          { href: `/properties/${id}`, label: d.title },
          { label: t("title") },
        ]}
      />
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {t("title")}
            <Chip color={s.enabled ? "success" : "default"} data-testid="import-state">
              {s.enabled ? t("scheduledOn") : t("manualOnly")}
            </Chip>
          </span>
        }
        description={t("intro")}
      />

      {s.lastError ? (
        <Alert tone="error" title={t("lastFailed")} data-testid="import-last-error">
          {s.lastError}
        </Alert>
      ) : null}

      <Card title={t("railsTitle")} description={t("railsBody")}>
        <form action={saveRateImportAction} className="grid gap-3 sm:grid-cols-3">
          <input type="hidden" name="propertyId" value={id} />
          <Field
            label={t("floor", { currency: d.currency })}
            name="floorMinor"
            type="number"
            min={0}
            required={false}
            defaultValue={s.guardRails.floorMinor ?? ""}
            testId="floor-minor"
          />
          <Field
            label={t("ceiling", { currency: d.currency })}
            name="ceilingMinor"
            type="number"
            min={0}
            required={false}
            defaultValue={s.guardRails.ceilingMinor ?? ""}
            testId="ceiling-minor"
          />
          <Field
            label={t("maxChange")}
            name="maxChangePercent"
            type="number"
            min={0}
            required={false}
            defaultValue={s.guardRails.maxChangeBps == null ? "" : s.guardRails.maxChangeBps / 100}
            testId="max-change"
          />
          <Field
            label={t("holdHours")}
            name="holdHours"
            type="number"
            min={0}
            required={false}
            defaultValue={s.holdHours}
            description={t("holdHoursHint")}
          />
          <div>
            <Label htmlFor="provider">{t("provider")}</Label>
            <Select id="provider" name="provider" defaultValue={s.provider}>
              <option value="csv">{t("providerCsv")}</option>
              <option value="pricelabs">PriceLabs</option>
              <option value="wheelhouse">Wheelhouse</option>
            </Select>
          </div>
          <Field
            label={t("providerRef")}
            name="providerRef"
            required={false}
            defaultValue={s.providerRef ?? ""}
            description={t("providerRefHint")}
          />
          <div className="sm:col-span-3 space-y-2">
            <Label className="flex items-center gap-2 font-normal">
              <input type="checkbox" name="enabled" defaultChecked={s.enabled} />
              {t("enabled")}
            </Label>
            <Label className="flex items-center gap-2 font-normal">
              <input type="checkbox" name="autoApply" defaultChecked={s.autoApply} />
              {t("autoApply")}
            </Label>
            <p className="text-xs text-muted">{t("autoApplyHint")}</p>
          </div>
          {refs.length > 0 ? (
            <div className="sm:col-span-3">
              <p className="mb-2 text-sm font-medium">{t("mapping")}</p>
              <div className="grid gap-2 sm:grid-cols-2" data-testid="listing-mapping">
                {refs.map((ref) => (
                  <div key={ref}>
                    <Label htmlFor={`map.${ref}`}>{ref || t("allRows")}</Label>
                    <Select id={`map.${ref}`} name={`map.${ref}`} defaultValue={s.mapping[ref]}>
                      <option value="">—</option>
                      {d.ratePlans.map((rp) => (
                        <option key={rp.id} value={rp.id}>
                          {rp.title}
                        </option>
                      ))}
                    </Select>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          <div className="sm:col-span-3">
            <Button type="submit" data-testid="save-pricing">
              {t("save")}
            </Button>
          </div>
        </form>
      </Card>

      <ImportForm
        propertyId={id}
        ratePlans={d.ratePlans}
        labels={{
          heading: t("importTitle"),
          intro: t("importBody"),
          paste: t("paste"),
          dryRun: t("dryRun"),
          running: t("running"),
          apply: t("apply"),
          override: t("override"),
          nothingRead: t("nothingRead"),
          cells: t("cells"),
          noChange: t("noChange"),
          applied: t("appliedTitle"),
          undo: t("undo"),
          refused: t("refused"),
          unmapped: t("unmapped"),
          held: t("held"),
          outside: t("outside"),
          parseErrors: t("parseErrors"),
          readColumns: t("readColumns"),
          before: t("before"),
          after: t("after"),
          mapTitle: t("mapFirstTitle"),
          mapBody: t("mapFirstBody"),
          allRows: t("allRows"),
          saveMapping: t("saveMapping"),
        }}
      />
    </div>
  );
}
