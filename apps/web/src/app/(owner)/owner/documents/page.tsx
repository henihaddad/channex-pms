import { getLocale, getTranslations } from "next-intl/server";
import { Card, PageTitle } from "@/components/ui";
import { guard } from "@/server/guard";
import { day } from "@/lib/format";
import { loadPortalDocuments } from "../portal.actions";

export async function generateMetadata() {
  const t = await getTranslations("owner");
  return { title: t("nav.documents") };
}

/** The owner's agreements and the files the manager shares (spec 17 §17.5; persona: the owner). */
export default async function OwnerDocuments() {
  const [t, locale] = await Promise.all([getTranslations("owner"), getLocale()]);
  const v = await guard(() => loadPortalDocuments());
  return (
    <div className="space-y-4">
      <PageTitle>{t("nav.documents")}</PageTitle>
      <p className="text-sm text-muted">{t("documentsHint")}</p>
      <Card className="text-sm">
        {v.agreements.map((a, i) => (
          <p key={i} className="border-t border-border py-1 text-xs" data-testid="owner-agreement">
            {t("agreementLine", {
              property: a.propertyTitle,
              version: a.version,
              from: day(a.effectiveFrom, locale),
              to: a.effectiveTo ? day(a.effectiveTo, locale) : t("openEnded"),
              model: (a.model as { kind: string }).kind.replace(/_/g, " "),
              basis: a.commissionBasis.replace(/_/g, " "),
            })}
          </p>
        ))}
        {v.documents.length === 0 ? <p className="text-xs text-muted">{t("noDocuments")}</p> : null}
        {v.documents.map((d) => (
          <p key={d.id} className="border-t border-border py-1 text-xs">
            {d.kind}:{" "}
            <a className="underline" href={d.storageRef} download={d.filename}>
              {d.filename}
            </a>
            {d.expiresAt ? ` · ${t("expires", { date: day(d.expiresAt, locale) })}` : ""}
          </p>
        ))}
      </Card>
    </div>
  );
}
