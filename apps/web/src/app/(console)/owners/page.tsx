import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import type { AgreementModel } from "@pms/core";
import {
  Button,
  Card,
  Chip,
  DataTable,
  EmptyState,
  Field,
  LinkButton,
  PageHeader,
  Select,
  Stat,
} from "@/components/ui";
import { OwnersPreview } from "@/components/previews";
import { amounts } from "@/components/finance";
import { money } from "@/lib/format";
import { guard } from "@/server/guard";
import {
  createOwnerAction,
  generateDueStatementsAction,
  loadOwnersBoard,
  saveStatementScheduleAction,
} from "./owners.actions";

const monthOf = (iso: string, locale: string, month: "short" | "long" = "long") =>
  new Intl.DateTimeFormat(locale === "en" ? "en-GB" : locale, { month, timeZone: "UTC" }).format(
    new Date(`${iso.slice(0, 7)}-01T00:00:00Z`),
  );
/** The month before the one `today` is in: the period the 1st's statements cover. */
const lastMonth = (today: string) => {
  const d = new Date(`${today.slice(0, 7)}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toISOString().slice(0, 7);
};

const STATE_TONE: Record<string, "warning" | "info" | "success" | "default"> = {
  draft: "warning",
  approved: "info",
  sent: "success",
  paid: "success",
};

/**
 * Owners (spec 17 §17.1, design board "Owners"): each owner with their properties, the split
 * their agreement sets, what last month's statement owes them, where that statement stands
 * and whether they can sign in to the portal. Below, how a statement adds up and the
 * schedule statements follow, which is the one the nightly worker reads.
 */
export default async function OwnersPage() {
  const t = await getTranslations("owners");
  const locale = await getLocale();
  const b = await guard(() => loadOwnersBoard());
  const period = lastMonth(b.today);
  const periodName = monthOf(period, locale);
  const fmt = (minor: number, currency: string) => money(minor, currency, locale);
  const split = (m: AgreementModel, basis: string, currency: string): string => {
    const on = t(`splitBasis.${basis}`);
    if (m.kind === "commission_pct")
      return t("splitPct", {
        owner: (10_000 - m.rateBps) / 100,
        manager: m.rateBps / 100,
        basis: on,
      });
    if (m.kind === "fixed_fee") return t("splitFixedFee", { amount: fmt(m.amountMinor, currency) });
    if (m.kind === "guaranteed_rent")
      return t("splitGuaranteed", { amount: fmt(m.amountMinor, currency) });
    return t("splitTiered", { basis: on });
  };
  const ofPeriod = b.statements.filter((s) => s.periodFrom.startsWith(period));
  const drafts = ofPeriod.filter((s) => s.state === "draft").length;
  const unsent = b.statements.filter((s) => s.state === "draft" || s.state === "approved");
  const withPortal = b.owners.filter((o) => o.userId).length;

  const rows = b.owners.map((o) => {
    const current = b.agreements.filter(
      (a) => a.ownerId === o.id && (a.effectiveTo === null || a.effectiveTo > b.today),
    );
    const latestByKey = [...new Map(current.map((a) => [a.agreementKey, a] as const)).values()];
    const mine = b.statements.filter((s) => s.ownerId === o.id);
    const forPeriod = mine.filter((s) => s.periodFrom.startsWith(period));
    const latest = [...mine].sort((x, y) => (x.periodFrom < y.periodFrom ? 1 : -1))[0];
    const shown = forPeriod[0] ?? latest;
    const payable = amounts(
      forPeriod.map((s) => ({
        currency: s.currency,
        minor: Number(s.totals.payable ?? s.totals.netDue ?? 0),
      })),
      forPeriod[0]?.currency ?? "",
      locale,
    );
    return [
      <div key="o" data-testid="owner-row" className="min-w-0">
        <Link className="font-semibold text-foreground hover:underline" href={`/owners/${o.id}`}>
          {o.name}
        </Link>
        <span className="block truncate text-xs text-muted">
          {[o.email, t(o.type === "company" ? "company" : "individual")]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </div>,
      o.properties.length ? o.properties.join(" · ") : "—",
      latestByKey.length === 0 ? (
        <span key="s" className="text-muted">
          {t("noAgreementYet")}
        </span>
      ) : (
        latestByKey.map((a) => split(a.model, a.commissionBasis, a.currency)).join(" · ")
      ),
      forPeriod.length ? payable : "—",
      shown ? (
        <Link key="st" href={`/owners/statements/${shown.id}`}>
          <Chip color={STATE_TONE[shown.state] ?? "default"} size="sm">
            {t(`statementState.${shown.state}`)} · {monthOf(shown.periodFrom, locale, "short")}
          </Chip>
        </Link>
      ) : latestByKey.length ? (
        <Chip key="st" color="default" size="sm">
          {t("noneYet")}
        </Chip>
      ) : (
        "—"
      ),
      o.userId ? (
        <Link
          key="p"
          href={`/owners/${o.id}`}
          className="font-semibold text-accent hover:underline"
        >
          {t("portal")}
        </Link>
      ) : (
        <Link key="p" href={`/owners/${o.id}`} className="text-muted hover:text-foreground">
          {t("invite")}
        </Link>
      ),
    ];
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("title")}
        actions={
          <LinkButton href="#add-owner" variant="primary">
            + {t("addOwner")}
          </LinkButton>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="owners-stats">
        <Stat
          label={t("title")}
          value={String(b.owners.length)}
          hint={t("withAgreements", {
            n: new Set(b.agreements.map((a) => a.ownerId)).size,
          })}
        />
        <Stat
          label={t("periodStatements", { month: periodName })}
          value={
            <span className={drafts > 0 ? "text-warning" : undefined}>
              {drafts > 0 ? t("draftsN", { n: drafts }) : String(ofPeriod.length)}
            </span>
          }
          hint={t("sentOf", {
            sent: ofPeriod.filter((s) => s.state === "sent" || s.state === "paid").length,
            total: ofPeriod.length,
          })}
        />
        <Stat
          label={t("ownerPayable")}
          value={
            unsent.length
              ? amounts(
                  unsent.map((s) => ({
                    currency: s.currency,
                    minor: Number(s.totals.payable ?? s.totals.netDue ?? 0),
                  })),
                  unsent[0]!.currency,
                  locale,
                )
              : "—"
          }
          hint={t("afterExpenses")}
        />
        <Stat
          label={t("portalAccess")}
          value={String(withPortal)}
          hint={t("portalAccessHint", { n: b.owners.length })}
        />
      </div>

      <Card
        title={t("title")}
        actions={
          <>
            <form action={generateDueStatementsAction}>
              <Button type="submit" variant="secondary" size="sm" data-testid="generate-due">
                {t("generateFor", { month: periodName })}
              </Button>
            </form>
            <LinkButton href="#add-owner" variant="secondary" size="sm">
              + {t("addOwner")}
            </LinkButton>
          </>
        }
      >
        {b.owners.length === 0 ? (
          <EmptyState
            title={t("emptyTitle")}
            description={t("empty")}
            preview={<OwnersPreview />}
          />
        ) : (
          <DataTable
            testId="owners-table"
            columns={[
              t("owner"),
              t("properties"),
              t("split"),
              t("payableFor", { month: periodName }),
              t("statement"),
              "",
            ]}
            rows={rows}
          />
        )}
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title={t("howTitle")}>
          <p className="text-sm leading-relaxed text-muted">{t("howBody")}</p>
        </Card>
        <Card title={t("scheduleTitle")}>
          <form action={saveStatementScheduleAction} className="flex flex-col gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1">
                <span className="text-sm font-semibold text-foreground">{t("generate")}</span>
                <p className="text-sm text-muted">{t("generateWhen")}</p>
              </div>
              <Select
                name="send"
                label={t("sendLabel")}
                defaultValue={b.autoSend.on ? "auto" : "manual"}
              >
                <option value="auto">{t("sendAuto", { n: b.autoSend.days })}</option>
                <option value="manual">{t("sendManual")}</option>
              </Select>
            </div>
            <input type="hidden" name="days" value={b.autoSend.days} />
            <div>
              <Button type="submit" size="sm" data-testid="save-statement-schedule">
                {t("save")}
              </Button>
            </div>
          </form>
        </Card>
      </div>

      <Card title={t("newOwner")} id="add-owner" className="scroll-mt-24">
        <form action={createOwnerAction} className="grid gap-3 sm:grid-cols-3">
          <Select label={t("type")} name="type" defaultValue="individual">
            <option value="individual">{t("individual")}</option>
            <option value="company">{t("company")}</option>
          </Select>
          <Field label={t("name")} name="name" />
          <Field label={t("email")} name="email" type="email" required={false} />
          <Field label={t("phone")} name="phone" required={false} />
          <Field label={t("taxId")} name="taxId" required={false} />
          <Field label={t("locale")} name="locale" defaultValue="en" />
          <div className="sm:col-span-3">
            <Button type="submit" data-testid="create-owner">
              {t("create")}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
