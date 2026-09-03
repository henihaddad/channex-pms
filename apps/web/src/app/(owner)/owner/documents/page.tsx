import { getTranslations } from "next-intl/server";
import { Card, PageTitle } from "@/components/ui";
import { guard } from "@/server/guard";
import { loadPortalDocuments } from "../portal.actions";

export default async function OwnerDocuments() {
  const t = await getTranslations("owner");
  const v = await guard(() => loadPortalDocuments());
  return (
    <div className="space-y-4">
      <PageTitle>{t("nav.documents")}</PageTitle>
      <p className="text-sm text-muted">{t("documentsHint")}</p>
      <Card className="text-sm">
        {v.agreements.map((a, i) => (
          <p key={i} className="border-t border-line py-1 text-xs" data-testid="owner-agreement">
            {a.propertyTitle} · v{a.version} · {a.effectiveFrom} → {a.effectiveTo ?? "open"} ·{" "}
            {(a.model as { kind: string }).kind.replace(/_/g, " ")} on{" "}
            {a.commissionBasis.replace(/_/g, " ")}
          </p>
        ))}
        {v.documents.length === 0 ? <p className="text-xs text-muted">{t("noDocuments")}</p> : null}
        {v.documents.map((d) => (
          <p key={d.id} className="border-t border-line py-1 text-xs">
            {d.kind}:{" "}
            <a className="underline" href={d.storageRef} download={d.filename}>
              {d.filename}
            </a>
            {d.expiresAt ? ` · ${d.expiresAt}` : ""}
          </p>
        ))}
      </Card>
    </div>
  );
}
