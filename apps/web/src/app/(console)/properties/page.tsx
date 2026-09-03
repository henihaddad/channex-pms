import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Button, Card, PageTitle } from "@/components/ui";
import { guard } from "@/server/guard";
import { listProperties, listTemplates } from "./properties.actions";
import { AdoptForm } from "./adopt-form";

const stateTone: Record<string, string> = {
  live: "bg-mint-soft text-mint-deep",
  syncing: "bg-sky-soft text-sky-deep",
  draft: "bg-canvas text-text",
  suspended: "bg-amber-soft text-amber-deep",
};

export default async function PropertiesPage() {
  const t = await getTranslations("properties");
  const [rows, templates] = await guard(() => Promise.all([listProperties(), listTemplates()]));
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <PageTitle>{t("title")}</PageTitle>
        <div className="flex gap-2">
          <Link href="/properties/import">
            <Button variant="secondary">{t("import")}</Button>
          </Link>
          <Link href="/properties/new">
            <Button data-testid="new-property">{t("new")}</Button>
          </Link>
        </div>
      </div>
      <Card>
        {rows.length === 0 ? <p className="text-sm text-muted">{t("empty")}</p> : null}
        <table className="w-full text-sm" data-testid="properties-table">
          <thead className="text-xs uppercase text-muted">
            <tr>
              <th className="py-1 text-start">{t("name")}</th>
              <th className="text-start">{t("kind")}</th>
              <th className="text-start">{t("state")}</th>
              <th className="text-start">{t("provisioning")}</th>
              <th className="text-end">{t("inventory")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} className="border-t border-line" data-state={p.state}>
                <td className="py-2 font-medium">
                  <Link href={`/properties/${p.id}`} className="hover:underline">
                    {p.title}
                  </Link>
                </td>
                <td className="text-muted">{p.kind}</td>
                <td>
                  <span className={`rounded px-2 py-0.5 text-xs ${stateTone[p.state] ?? ""}`}>
                    {p.state}
                  </span>
                </td>
                <td className="text-xs text-muted">
                  {p.provisioningStep ?? "—"}
                  {p.provisioningError ? ` · ${p.provisioningError}` : ""}
                </td>
                <td className="text-end text-xs text-muted">
                  {p.roomTypes} / {p.ratePlans} / {p.units}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Card>
        <h2 className="mb-1 font-semibold">{t("templates")}</h2>
        {templates.length === 0 ? (
          <p className="text-sm text-muted">{t("noTemplates")}</p>
        ) : (
          <ul className="text-sm text-text">
            {templates.map((x) => (
              <li key={x.id}>
                {x.name}{" "}
                <span className="text-faint">
                  · {x.payload.kind} · {x.payload.currency}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card>
        <h2 className="mb-1 font-semibold">{t("adopt")}</h2>
        <p className="mb-3 text-sm text-muted">{t("adoptHint")}</p>
        <AdoptForm label={t("adoptSubmit")} />
      </Card>
    </div>
  );
}
