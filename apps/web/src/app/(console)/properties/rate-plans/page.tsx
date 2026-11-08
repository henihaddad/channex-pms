import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { DataTable, PageHeader } from "@/components/ui";
import { guard } from "@/server/guard";
import { money } from "@/lib/format";
import { loadInventory } from "../properties.actions";
import { ChannelDot } from "../channel-dot";
import { derivedLabel } from "../derived-label";

/** Every rate plan across the portfolio with tonight's rate (spec 03 §3.2a, tab "Rate plans"). */
export default async function RatePlansPage() {
  const t = await getTranslations("properties");
  const inv = await guard(() => loadInventory());
  // a single rental's room type is managed for the manager; it reads as the whole property
  const whole = new Set(
    inv.roomTypes
      .filter((r) => r.isSystemManaged && r.propertyKind === "single_unit")
      .map((r) => r.id),
  );
  return (
    <div className="space-y-5">
      <PageHeader title={t("title")} titleOnPhone={false} description={t("tabs.plansLead")} />
      <DataTable
        testId="rate-plans-table"
        columns={[
          t("cols.property"),
          t("cols.ratePlan"),
          t("cols.roomType"),
          { label: t("cols.rateTonight"), align: "end" },
          { label: t("cols.minStay"), align: "end" },
          t("cols.channels"),
        ]}
        empty={t("tabs.plansEmpty")}
        rows={inv.ratePlans.map((rp) => [
          <Link
            key="p"
            href={`/properties/${rp.propertyId}`}
            className="font-semibold text-foreground hover:underline"
          >
            {rp.propertyTitle}
          </Link>,
          <span key="n">
            {rp.title}
            {rp.parentTitle && rp.derivedOption ? (
              <span className="block text-xs text-muted">
                {derivedLabel(rp.derivedOption, rp.currency, t)} · {rp.parentTitle}
              </span>
            ) : null}
          </span>,
          whole.has(rp.roomTypeId) ? (
            <span key="r" className="text-muted">
              {t("wholeProperty")}
            </span>
          ) : (
            rp.roomTypeTitle
          ),
          money(rp.rateMinor, rp.currency),
          rp.minStay ?? "—",
          rp.channels.length === 0 ? (
            <span key="c" className="text-muted">
              {t("noChannelsShort")}
            </span>
          ) : (
            <span key="c" className="flex flex-wrap gap-x-2.5 gap-y-1 text-xs">
              {rp.channels.map((c) => (
                <ChannelDot key={c} code={c} />
              ))}
            </span>
          ),
        ])}
      />
    </div>
  );
}
