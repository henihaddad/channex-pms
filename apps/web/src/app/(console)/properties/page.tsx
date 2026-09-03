import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Card, LinkButton, PageTitle, TBody, THead, Table, Td, Th, Tr } from "@/components/ui";
import { guard } from "@/server/guard";
import { listProperties, listTemplates } from "./properties.actions";
import { AdoptForm } from "./adopt-form";

const stateTone: Record<string, string> = {
  live: "bg-success-soft text-success-soft-foreground",
  syncing: "bg-accent-soft text-accent",
  draft: "bg-background text-foreground",
  suspended: "bg-warning-soft text-warning-soft-foreground",
};

export default async function PropertiesPage() {
  const t = await getTranslations("properties");
  const [rows, templates] = await guard(() => Promise.all([listProperties(), listTemplates()]));
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <PageTitle>{t("title")}</PageTitle>
        <div className="flex gap-2">
          <LinkButton href="/properties/import" variant="secondary">
            {t("import")}
          </LinkButton>
          <LinkButton href="/properties/new" data-testid="new-property">
            {t("new")}
          </LinkButton>
        </div>
      </div>
      <Card>
        {rows.length === 0 ? <p className="text-sm text-muted">{t("empty")}</p> : null}
        <Table data-testid="properties-table">
          <THead className="uppercase">
            <Tr>
              <Th>{t("name")}</Th>
              <Th>{t("kind")}</Th>
              <Th>{t("state")}</Th>
              <Th>{t("provisioning")}</Th>
              <Th className="text-end">{t("inventory")}</Th>
            </Tr>
          </THead>
          <TBody>
            {rows.map((p) => (
              <Tr key={p.id} data-state={p.state}>
                <Td>
                  <Link href={`/properties/${p.id}`} className="hover:underline">
                    {p.title}
                  </Link>
                </Td>
                <Td>{p.kind}</Td>
                <Td>
                  <span className={`rounded px-2 py-0.5 text-xs ${stateTone[p.state] ?? ""}`}>
                    {p.state}
                  </span>
                </Td>
                <Td>
                  {p.provisioningStep ?? "—"}
                  {p.provisioningError ? ` · ${p.provisioningError}` : ""}
                </Td>
                <Td className="text-end">
                  {p.roomTypes} / {p.ratePlans} / {p.units}
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </Card>
      <Card title={t("templates")}>
        {templates.length === 0 ? (
          <p className="text-sm text-muted">{t("noTemplates")}</p>
        ) : (
          <ul className="text-sm text-foreground">
            {templates.map((x) => (
              <li key={x.id}>
                {x.name}{" "}
                <span className="text-muted">
                  · {x.payload.kind} · {x.payload.currency}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title={t("adopt")}>
        <p className="mb-3 text-sm text-muted">{t("adoptHint")}</p>
        <AdoptForm label={t("adoptSubmit")} />
      </Card>
    </div>
  );
}
