import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Card, Chip, PageHeader, TBody, THead, Table, Td, Th, Tr, cn } from "@/components/ui";
import { money } from "@/lib/format";
import { guard } from "@/server/guard";
import { listStatements } from "../owners.actions";

const STATES = ["draft", "approved", "sent", "paid"] as const;
const STATE_TONE: Record<string, "warning" | "info" | "success" | "default"> = {
  draft: "warning",
  approved: "info",
  sent: "success",
  paid: "success",
};
const monthYear = (iso: string, locale: string) =>
  new Intl.DateTimeFormat(locale === "en" ? "en-GB" : locale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${iso.slice(0, 7)}-01T00:00:00Z`));

/** Statement list (STMT-5): drafts to review, approved waiting to send, sent awaiting payout. */
export default async function StatementsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const t = await getTranslations("owners");
  const locale = await getLocale();
  const state = STATES.find((s) => s === sp.state) ?? null;
  const rows = await guard(() => listStatements({ state }));
  const chip = (value: string | null, label: string) => (
    <Link
      key={value ?? "all"}
      href={value ? `/owners/statements?state=${value}` : "/owners/statements"}
      aria-current={state === value ? "page" : undefined}
      className={cn(
        "inline-flex h-9 items-center rounded-full border px-3.5 text-sm font-semibold transition-colors",
        state === value
          ? "border-foreground bg-foreground text-background"
          : "border-border bg-surface text-foreground hover:bg-default",
      )}
    >
      {label}
    </Link>
  );
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("statements")} />
      <nav className="flex flex-wrap gap-2" aria-label={t("filter")}>
        {chip(null, t("anyState"))}
        {STATES.map((s) => chip(s, t(`statementState.${s}`)))}
      </nav>
      <Card>
        <Table>
          <THead>
            <Tr className="hover:bg-transparent">
              <Th>{t("period")}</Th>
              <Th>{t("owner")}</Th>
              <Th>{t("property")}</Th>
              <Th className="text-end">{t("accommodation")}</Th>
              <Th className="text-end">{t("totals.netDue")}</Th>
              <Th>{t("statement")}</Th>
            </Tr>
          </THead>
          <TBody>
            {rows.length === 0 ? (
              <Tr>
                <Td colSpan={6} className="text-muted">
                  {t("noStatements")}
                </Td>
              </Tr>
            ) : null}
            {rows.map((s) => (
              <Tr key={s.id} data-testid="statement-row" data-state={s.state}>
                <Td>
                  <Link
                    className="font-semibold hover:underline"
                    href={`/owners/statements/${s.id}`}
                  >
                    {monthYear(s.periodFrom, locale)}
                  </Link>
                </Td>
                <Td>{s.ownerName}</Td>
                <Td>{s.propertyTitle}</Td>
                <Td className="text-end tabular-nums">
                  {money(Number(s.totals.grossRevenue ?? 0), s.currency, locale)}
                </Td>
                <Td className="text-end tabular-nums">
                  {money(Number(s.totals.netDue ?? 0), s.currency, locale)}
                </Td>
                <Td className="whitespace-nowrap">
                  <Chip color={STATE_TONE[s.state] ?? "default"} size="sm">
                    {t(`statementState.${s.state}`)}
                  </Chip>
                  {s.disputeState === "open" ? (
                    <Chip color="danger" size="sm" className="ms-1">
                      {t("disputed")}
                    </Chip>
                  ) : null}
                  {s.anomalies.length ? (
                    <Chip color="warning" size="sm" className="ms-1">
                      {t("flags", { n: s.anomalies.length })}
                    </Chip>
                  ) : null}
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
