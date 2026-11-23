import { cache } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import {
  Card,
  Checkbox,
  DateInput,
  Field,
  Input,
  Label,
  PageHeader,
  Select,
  SubmitButton,
} from "@/components/ui";
import { guard } from "@/server/guard";
import { EXPENSE_CATEGORIES } from "@/server/owners";
import { money, percent } from "@/lib/format";
import {
  addDocumentAction,
  generateStatementAction,
  grantPortalAction,
  loadOwner,
  saveAgreementAction,
  setPayoutDetailsAction,
} from "../owners.actions";

/** One load per request: the title and the page read the same owner. */
const ownerFor = cache((id: string) => guard(() => loadOwner({ id })));

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [v, t] = await Promise.all([ownerFor(id), getTranslations("owners")]);
  return { title: v?.owner.name ?? t("owner") };
}

/** A language named in itself ("Français"); the code when the runtime does not know it. */
const languageName = (code: string): string => {
  try {
    const n = new Intl.DisplayNames([code], { type: "language" }).of(code) ?? code;
    return n.charAt(0).toLocaleUpperCase(code) + n.slice(1);
  } catch {
    return code;
  }
};

/**
 * Owner detail: agreements with every term visible, portal access, payout destination, documents,
 * statements. Persona: the portfolio manager who reports to owners (spec 02).
 */
export default async function OwnerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getTranslations("owners");
  const tf = await getTranslations("financials");
  const locale = await getLocale();
  const v = await ownerFor(id);
  if (!v) notFound();
  const fmt = (minor: number, currency: string) => money(minor, currency, locale);
  const pct = (bps: number) => percent(bps / 10_000, { locale });
  const label = (group: string, k: string) =>
    t.has(`${group}.${k}`) ? t(`${group}.${k}`) : k.replace(/_/g, " ");
  const describeModel = (
    m: { kind: string; rateBps?: number; amountMinor?: number },
    currency: string,
  ): string =>
    m.kind === "commission_pct"
      ? t("modelPct", { pct: pct(m.rateBps ?? 0) })
      : m.kind === "fixed_fee"
        ? t("splitFixedFee", { amount: fmt(m.amountMinor ?? 0, currency) })
        : m.kind === "guaranteed_rent"
          ? t("splitGuaranteed", { amount: fmt(m.amountMinor ?? 0, currency) })
          : t("modelKind.tiered");
  const lastMonth = new Date();
  lastMonth.setUTCDate(1);
  lastMonth.setUTCMonth(lastMonth.getUTCMonth() - 1);
  const defaultPeriod = lastMonth.toISOString().slice(0, 10);
  return (
    <div className="flex flex-col gap-5" data-testid="owner-detail">
      <PageHeader
        title={v.owner.name}
        tabs={false}
        crumb={[{ href: "/owners", label: t("title") }, { label: v.owner.name }]}
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="space-y-3 text-sm">
          <p>
            {label("ownerType", v.owner.type)} · {v.owner.email ?? "—"} · {v.owner.phone ?? "—"} ·{" "}
            {languageName(v.owner.locale)}
          </p>
          <p>
            {t("payoutDestination")}:{" "}
            <code data-testid="payout-masked">{v.owner.payoutDetailsMasked ?? "—"}</code>
          </p>
          <form action={setPayoutDetailsAction} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="ownerId" value={v.owner.id} />
            <Field
              label={t("payoutDetails")}
              name="payoutDetails"
              placeholder={t("payoutPlaceholder")}
              description={t("payoutHint")}
              autoComplete="off"
              spellCheck={false}
              required={false}
              className="min-w-64 flex-1"
            />
            <SubmitButton variant="secondary" testId="save-payout-details" size="sm">
              {t("save")}
            </SubmitButton>
          </form>
          <div className="flex flex-wrap items-center gap-2">
            {v.owner.userId ? (
              <span
                className="rounded bg-success-soft px-2 py-0.5 text-xs text-success-soft-foreground"
                data-testid="portal-granted"
              >
                {t("portalOn")}
              </span>
            ) : (
              <form action={grantPortalAction}>
                <input type="hidden" name="ownerId" value={v.owner.id} />
                <SubmitButton variant="secondary" testId="grant-portal" size="sm">
                  {t("grantPortal")}
                </SubmitButton>
              </form>
            )}
            <span className="text-xs text-muted">{t("portalHint")}</span>
          </div>
          <div>
            <p className="font-medium">{t("documents")}</p>
            {v.documents.length === 0 ? (
              <p className="text-xs text-muted">{t("noDocuments")}</p>
            ) : null}
            {v.documents.map((d) => (
              <p key={d.id} className="text-xs">
                {label("docKind", d.kind)}: {d.filename}{" "}
                {d.expiresAt ? `· ${t("expires")} ${d.expiresAt}` : ""}{" "}
                {d.expiringSoon ? (
                  <span className="text-warning-soft-foreground">⚠ {t("expiringSoon")}</span>
                ) : null}
              </p>
            ))}
            <form
              action={addDocumentAction}
              className="mt-2 flex flex-wrap items-center gap-2 text-xs"
            >
              <input type="hidden" name="ownerId" value={v.owner.id} />
              <Select name="kind" className="w-36" size="sm" aria-label={t("documentKind")}>
                {(["contract", "insurance", "tax_form", "other"] as const).map((k) => (
                  <option key={k} value={k}>
                    {label("docKind", k)}
                  </option>
                ))}
              </Select>
              <input type="file" name="file" className="text-xs" aria-label={t("documentFile")} />
              <DateInput name="expiresAt" aria-label={t("expiresOn")} />
              <SubmitButton variant="secondary" size="sm">
                {t("addDocument")}
              </SubmitButton>
            </form>
          </div>
        </Card>
        <Card className="space-y-2 text-sm" title={t("agreements")}>
          {v.agreements.length === 0 ? (
            <p className="text-xs text-muted">{t("noAgreements")}</p>
          ) : null}
          {v.agreements.map((a) => (
            <div
              key={a.id}
              className="rounded border border-border p-2 text-xs"
              data-testid="agreement-row"
            >
              <p className="font-medium">
                {a.propertyTitle} · {t("version", { n: a.version })} · {a.effectiveFrom} →{" "}
                {a.effectiveTo ?? t("openEnded")}
              </p>
              <p>
                {describeModel(
                  a.model as { kind: string; rateBps?: number; amountMinor?: number },
                  a.currency,
                )}{" "}
                · {t("basis")}: <strong>{label("basisLabel", a.commissionBasis)}</strong> ·{" "}
                {t("cleaning")}: {label("cleaningKind", a.cleaningFees.kind)} · {t("ownerStays")}:{" "}
                {label("ownerStayKind", a.ownerStays.kind)}
                {a.ownerStayAllowanceNights !== null
                  ? ` (${t("nightsFreeN", { n: a.ownerStayAllowanceNights })})`
                  : ""}{" "}
                ·{" "}
                {t("payoutTerms", {
                  frequency: label("frequency", a.payout.frequency),
                  min: fmt(a.payout.minimumMinor, a.currency),
                  holdBack: pct(a.payout.holdBackBps),
                })}
              </p>
              <form
                action={generateStatementAction}
                className="mt-1 flex flex-wrap items-center gap-1"
              >
                <input type="hidden" name="agreementKey" value={a.agreementKey} />
                <Input
                  type="month"
                  name="periodMonth"
                  defaultValue={defaultPeriod.slice(0, 7)}
                  aria-label={t("period")}
                  data-testid="period-month"
                />
                <SubmitButton variant="secondary" testId="generate-statement" size="sm">
                  {t("generateStatement")}
                </SubmitButton>
              </form>
            </div>
          ))}
          <p className="font-medium">{t("statements")}</p>
          {v.statements.length === 0 ? (
            <p className="text-xs text-muted">{t("noStatements")}</p>
          ) : null}
          {v.statements.map((s) => (
            <p key={s.id} className="text-xs">
              <Link className="underline" href={`/owners/statements/${s.id}`}>
                {s.periodFrom.slice(0, 7)} · {s.propertyTitle}
              </Link>{" "}
              · {label("statementState", s.state)} · {fmt(Number(s.totals.netDue ?? 0), s.currency)}
            </p>
          ))}
        </Card>
      </div>
      <Card title={t("newAgreement")}>
        <form
          action={saveAgreementAction}
          className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3"
          data-testid="agreement-form"
        >
          <input type="hidden" name="ownerId" value={v.owner.id} />
          <Select label={t("property")} name="propertyId" required>
            {v.properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title} ({p.currency})
              </option>
            ))}
          </Select>
          <Select label={t("newVersionOf")} name="agreementKey" defaultValue="">
            <option value="">{t("newAgreementOption")}</option>
            {[...new Map(v.agreements.map((a) => [a.agreementKey, a])).values()].map((a) => (
              <option key={a.agreementKey} value={a.agreementKey}>
                {a.propertyTitle} ({t("version", { n: a.version })})
              </option>
            ))}
          </Select>
          <Field label={t("effectiveFrom")} name="effectiveFrom" type="date" />
          <Select label={t("model")} name="model" defaultValue="commission_pct">
            {(["commission_pct", "fixed_fee", "tiered", "guaranteed_rent"] as const).map((k) => (
              <option key={k} value={k}>
                {label("modelKind", k)}
              </option>
            ))}
          </Select>
          <Field
            label={t("commissionPct")}
            name="commissionPct"
            type="number"
            inputMode="decimal"
            defaultValue="20"
            required={false}
          />
          <Select label={t("basis")} name="commissionBasis" defaultValue="net_of_ota_commission">
            {(["gross", "net_of_ota_commission", "net_of_tax"] as const).map((k) => (
              <option key={k} value={k}>
                {label("basisLabel", k)}
              </option>
            ))}
          </Select>
          <Field label={t("fixedFee")} name="fixedFee" type="number" required={false} />
          <Field label={t("guaranteedRent")} name="guaranteedRent" type="number" required={false} />
          <Field label={t("tier1Upto")} name="tier1Upto" type="number" required={false} />
          <Field label={t("tier1Rate")} name="tier1Rate" type="number" required={false} />
          <Field label={t("tier2Rate")} name="tier2Rate" type="number" required={false} />
          <fieldset className="grid grid-cols-2 gap-3 text-xs sm:col-span-2 sm:grid-cols-3 lg:col-span-3 lg:grid-cols-5">
            <legend className="mb-1 font-medium">{t("deductibles")}</legend>
            {EXPENSE_CATEGORIES.map((c) => {
              const category = tf.has(`category.${c}`) ? tf(`category.${c}`) : c;
              return (
                <div key={c} className="flex flex-col gap-1.5">
                  <Label htmlFor={`deductible_${c}`}>{category}</Label>
                  <Select
                    id={`deductible_${c}`}
                    name={`deductible_${c}`}
                    defaultValue={c === "consumables" ? "absorbed" : "at_cost"}
                    size="sm"
                  >
                    {(["at_cost", "marked_up", "absorbed"] as const).map((k) => (
                      <option key={k} value={k}>
                        {label("passThrough", k)}
                      </option>
                    ))}
                  </Select>
                  <Input
                    name={`markup_${c}`}
                    type="number"
                    inputMode="decimal"
                    placeholder={t("markupPct")}
                    aria-label={t("markupFor", { category })}
                  />
                </div>
              );
            })}
          </fieldset>
          <div className="flex flex-col gap-1.5">
            <Select label={t("cleaning")} name="cleaningFees" defaultValue="kept">
              {(["kept", "passed", "split"] as const).map((k) => (
                <option key={k} value={k}>
                  {label("cleaningKind", k)}
                </option>
              ))}
            </Select>
            <Input
              name="cleaningOwnerPct"
              type="number"
              inputMode="decimal"
              placeholder={t("ownerPctPlaceholder")}
              aria-label={t("cleaningOwnerPct")}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Select label={t("ownerStays")} name="ownerStays" defaultValue="free">
              {(["free", "at_cost", "rate"] as const).map((k) => (
                <option key={k} value={k}>
                  {label("ownerStayKind", k)}
                </option>
              ))}
            </Select>
            <Input
              name="ownerStayNightly"
              type="number"
              inputMode="decimal"
              placeholder={t("perNight")}
              aria-label={t("ownerStayNightly")}
            />
          </div>
          <Field
            label={t("allowance")}
            name="ownerStayAllowanceNights"
            type="number"
            required={false}
          />
          <Select label={t("payoutSchedule")} name="payoutFrequency" defaultValue="monthly">
            {(["monthly", "fortnightly"] as const).map((k) => (
              <option key={k} value={k}>
                {label("frequency", k)}
              </option>
            ))}
          </Select>
          <Field
            label={t("payoutDay")}
            name="payoutDay"
            type="number"
            defaultValue="5"
            required={false}
          />
          <Field
            label={t("payoutMinimum")}
            name="payoutMinimum"
            type="number"
            defaultValue="0"
            required={false}
          />
          <Field
            label={t("holdBackPct")}
            name="holdBackPct"
            type="number"
            defaultValue="0"
            required={false}
          />
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <Checkbox name="vatOnFee">{t("vatOnFee")}</Checkbox>
            <Input
              name="vatRate"
              type="number"
              inputMode="decimal"
              placeholder={t("vatPct")}
              aria-label={t("vatRate")}
              className="w-24"
            />
          </div>
          <fieldset className="flex flex-wrap gap-x-4 gap-y-2 text-xs sm:col-span-2 lg:col-span-3">
            <legend className="mb-1 font-medium">{t("units")}</legend>
            {v.units.map((u) => (
              <Checkbox key={u.id} name="unitIds" value={u.id}>
                {u.name}
              </Checkbox>
            ))}
          </fieldset>
          <div className="sm:col-span-2 lg:col-span-3">
            <SubmitButton testId="save-agreement">{t("saveAgreement")}</SubmitButton>
          </div>
        </form>
      </Card>
    </div>
  );
}
