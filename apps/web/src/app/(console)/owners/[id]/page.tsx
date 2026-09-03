import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Button, Card, DateInput, Field, Input, Label, PageTitle, Select } from "@/components/ui";
import { guard } from "@/server/guard";
import { EXPENSE_CATEGORIES, money } from "@/server/owners";
import {
  addDocumentAction,
  generateStatementAction,
  grantPortalAction,
  loadOwner,
  saveAgreementAction,
  setPayoutDetailsAction,
} from "../owners.actions";

const describeModel = (
  m: { kind: string; rateBps?: number; amountMinor?: number },
  currency: string,
): string =>
  m.kind === "commission_pct"
    ? `${String((m.rateBps ?? 0) / 100)}% commission`
    : m.kind === "fixed_fee"
      ? `fixed fee ${money(m.amountMinor ?? 0, currency)}`
      : m.kind === "guaranteed_rent"
        ? `guaranteed rent ${money(m.amountMinor ?? 0, currency)}`
        : "tiered";

/** Owner detail: agreements with every term visible, portal access, payout destination, documents, statements. */
export default async function OwnerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getTranslations("owners");
  const v = await guard(() => loadOwner({ id }));
  if (!v) notFound();
  const lastMonth = new Date();
  lastMonth.setUTCDate(1);
  lastMonth.setUTCMonth(lastMonth.getUTCMonth() - 1);
  const defaultPeriod = lastMonth.toISOString().slice(0, 10);
  return (
    <div className="space-y-4" data-testid="owner-detail">
      <PageTitle>{v.owner.name}</PageTitle>
      <div className="grid grid-cols-2 gap-4">
        <Card className="space-y-3 text-sm">
          <p>
            {v.owner.type} · {v.owner.email ?? "—"} · {v.owner.phone ?? "—"} · {v.owner.locale}
          </p>
          <p>
            {t("payoutDestination")}:{" "}
            <code data-testid="payout-masked">{v.owner.payoutDetailsMasked ?? "—"}</code>
          </p>
          <form action={setPayoutDetailsAction} className="flex gap-2">
            <input type="hidden" name="ownerId" value={v.owner.id} />
            <Input name="payoutDetails" placeholder={t("payoutPlaceholder")} />
            <Button type="submit" variant="secondary" data-testid="save-payout-details" size="sm">
              {t("save")}
            </Button>
          </form>
          <div className="flex items-center gap-2">
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
                <Button type="submit" variant="secondary" data-testid="grant-portal" size="sm">
                  {t("grantPortal")}
                </Button>
              </form>
            )}
            <span className="text-xs text-muted">{t("portalHint")}</span>
          </div>
          <div>
            <p className="font-medium">{t("documents")}</p>
            {v.documents.map((d) => (
              <p key={d.id} className="text-xs">
                {d.kind}: {d.filename} {d.expiresAt ? `· ${t("expires")} ${d.expiresAt}` : ""}{" "}
                {d.expiringSoon ? (
                  <span className="text-warning-soft-foreground">⚠ {t("expiringSoon")}</span>
                ) : null}
              </p>
            ))}
            <form
              action={addDocumentAction}
              className="mt-1 flex flex-wrap items-center gap-1 text-xs"
            >
              <input type="hidden" name="ownerId" value={v.owner.id} />
              <Select name="kind" className="w-28" size="sm">
                <option value="contract">contract</option>
                <option value="insurance">insurance</option>
                <option value="tax_form">tax form</option>
                <option value="other">other</option>
              </Select>
              <input type="file" name="file" className="text-xs" />
              <DateInput name="expiresAt" />
              <Button type="submit" variant="secondary" size="sm">
                {t("addDocument")}
              </Button>
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
                {a.propertyTitle} · v{a.version} · {a.effectiveFrom} → {a.effectiveTo ?? "open"}
              </p>
              <p>
                {describeModel(
                  a.model as { kind: string; rateBps?: number; amountMinor?: number },
                  a.currency,
                )}{" "}
                · {t("basis")}: <strong>{a.commissionBasis.replace(/_/g, " ")}</strong> ·{" "}
                {t("cleaning")}: {a.cleaningFees.kind} · {t("ownerStays")}: {a.ownerStays.kind}
                {a.ownerStayAllowanceNights !== null
                  ? ` (${String(a.ownerStayAllowanceNights)} ${t("nightsFree")})`
                  : ""}{" "}
                · {a.payout.frequency}, min {money(a.payout.minimumMinor, a.currency)}, hold-back{" "}
                {String(a.payout.holdBackBps / 100)}%
              </p>
              <form action={generateStatementAction} className="mt-1 flex items-center gap-1">
                <input type="hidden" name="agreementKey" value={a.agreementKey} />
                <Input
                  type="month"
                  name="periodMonth"
                  defaultValue={defaultPeriod.slice(0, 7)}
                  data-testid="period-month"
                />
                <Button
                  type="submit"
                  variant="secondary"
                  data-testid="generate-statement"
                  size="sm"
                >
                  {t("generateStatement")}
                </Button>
              </form>
            </div>
          ))}
          <p className="font-medium">{t("statements")}</p>
          {v.statements.map((s) => (
            <p key={s.id} className="text-xs">
              <Link className="underline" href={`/owners/statements/${s.id}`}>
                {s.periodFrom.slice(0, 7)} · {s.propertyTitle}
              </Link>{" "}
              · {s.state} · {money(Number(s.totals.netDue ?? 0), s.currency)}
            </p>
          ))}
        </Card>
      </div>
      <Card>
        <form
          action={saveAgreementAction}
          className="grid grid-cols-3 gap-3 text-sm"
          data-testid="agreement-form"
        >
          <input type="hidden" name="ownerId" value={v.owner.id} />
          <p className="col-span-3 font-medium">{t("newAgreement")}</p>
          <div>
            <Select label={t("property")} name="propertyId" required>
              {v.properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title} ({p.currency})
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Select label={t("newVersionOf")} name="agreementKey" defaultValue="">
              <option value="">{t("newAgreementOption")}</option>
              {[...new Map(v.agreements.map((a) => [a.agreementKey, a])).values()].map((a) => (
                <option key={a.agreementKey} value={a.agreementKey}>
                  {a.propertyTitle} (v{a.version})
                </option>
              ))}
            </Select>
          </div>
          <Field label={t("effectiveFrom")} name="effectiveFrom" type="date" />
          <div>
            <Select label={t("model")} name="model" defaultValue="commission_pct">
              <option value="commission_pct">commission %</option>
              <option value="fixed_fee">fixed fee</option>
              <option value="tiered">tiered</option>
              <option value="guaranteed_rent">guaranteed rent</option>
            </Select>
          </div>
          <Field
            label={t("commissionPct")}
            name="commissionPct"
            type="number"
            defaultValue="20"
            required={false}
          />
          <div>
            <Select label={t("basis")} name="commissionBasis" defaultValue="net_of_ota_commission">
              <option value="gross">gross</option>
              <option value="net_of_ota_commission">net of OTA commission</option>
              <option value="net_of_tax">net of tax</option>
            </Select>
          </div>
          <Field label={t("fixedFee")} name="fixedFee" type="number" required={false} />
          <Field label={t("guaranteedRent")} name="guaranteedRent" type="number" required={false} />
          <Field label={t("tier1Upto")} name="tier1Upto" type="number" required={false} />
          <Field label={t("tier1Rate")} name="tier1Rate" type="number" required={false} />
          <Field label={t("tier2Rate")} name="tier2Rate" type="number" required={false} />
          <fieldset className="col-span-3 grid grid-cols-5 gap-2 text-xs">
            <legend className="font-medium">{t("deductibles")}</legend>
            {EXPENSE_CATEGORIES.map((c) => (
              <div key={c}>
                <Label htmlFor={`deductible_${c}`}>{c}</Label>
                <Select
                  id={`deductible_${c}`}
                  name={`deductible_${c}`}
                  defaultValue={c === "consumables" ? "absorbed" : "at_cost"}

                  size="sm"
                >
                  <option value="at_cost">at cost</option>
                  <option value="marked_up">marked up</option>
                  <option value="absorbed">absorbed</option>
                </Select>
                <Input name={`markup_${c}`} type="number" placeholder="markup %" />
              </div>
            ))}
          </fieldset>
          <div>
            <Select label={t("cleaning")} name="cleaningFees" defaultValue="kept">
              <option value="kept">kept by manager</option>
              <option value="passed">passed to owner</option>
              <option value="split">split</option>
            </Select>
            <Input name="cleaningOwnerPct" type="number" placeholder="owner %" />
          </div>
          <div>
            <Select label={t("ownerStays")} name="ownerStays" defaultValue="free">
              <option value="free">free</option>
              <option value="at_cost">at cost</option>
              <option value="rate">at a rate</option>
            </Select>
            <Input name="ownerStayNightly" type="number" placeholder="per night" />
          </div>
          <Field
            label={t("allowance")}
            name="ownerStayAllowanceNights"
            type="number"
            required={false}
          />
          <div>
            <Select label={t("payoutSchedule")} name="payoutFrequency" defaultValue="monthly">
              <option value="monthly">monthly</option>
              <option value="fortnightly">fortnightly</option>
            </Select>
          </div>
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
          <div className="flex items-end gap-2 text-xs">
            <Label>
              <input type="checkbox" name="vatOnFee" /> {t("vatOnFee")}
            </Label>
            <Input name="vatRate" type="number" placeholder="VAT %" className="w-20" />
          </div>
          <fieldset className="col-span-3 text-xs">
            <legend className="font-medium">{t("units")}</legend>
            {v.units.map((u) => (
              <Label key={u.id}>
                <input type="checkbox" name="unitIds" value={u.id} /> {u.name}
              </Label>
            ))}
          </fieldset>
          <div className="col-span-3">
            <Button type="submit" data-testid="save-agreement">
              {t("saveAgreement")}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
