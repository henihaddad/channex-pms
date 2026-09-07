import { getTranslations } from "next-intl/server";
import { Breadcrumbs, PageHeader } from "@/components/ui";
import { guard } from "@/server/guard";
import { loadPaymentRules } from "./payments.actions";
import { RulesEditor } from "./rules-editor";

/** Spec 10 §10.4: what a direct booking is charged, and when. */
export default async function PaymentRulesPage() {
  const t = await getTranslations("payments");
  const tn = await getTranslations("nav");
  const view = await guard(() => loadPaymentRules());
  return (
    <div className="space-y-5">
      <Breadcrumbs
        items={[{ href: "/booking-engine", label: tn("bookingEngine") }, { label: t("title") }]}
      />
      <PageHeader title={t("title")} description={t("lead")} />
      <RulesEditor
        view={view}
        labels={{
          add: t("add"),
          name: t("name"),
          when: t("when"),
          confirmation: t("confirmation"),
          beforeArrival: t("beforeArrival"),
          afterArrival: t("afterArrival"),
          days: t("days"),
          take: t("take"),
          percent: t("percent"),
          fixed: t("fixed"),
          remainder: t("remainder"),
          value: t("value"),
          properties: t("properties"),
          allProperties: t("allProperties"),
          channels: t("channels"),
          allChannels: t("allChannels"),
          direct: t("direct"),
          enabled: t("enabled"),
          save: t("save"),
          remove: t("remove"),
          saved: t("saved"),
          example: t("example"),
          exampleHint: t("exampleHint"),
          uncovered: t("uncovered"),
        }}
      />
    </div>
  );
}
