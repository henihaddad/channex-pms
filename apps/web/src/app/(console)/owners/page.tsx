import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Button, Card, Chip, Field, PageTitle, Select } from "@/components/ui";
import { guard } from "@/server/guard";
import { createOwnerAction, listOwners } from "./owners.actions";

/** Owners (spec 17 §17.1): contacts first, agreements and portal access on the detail page. */
export default async function OwnersPage() {
  const t = await getTranslations("owners");
  const rows = await guard(() => listOwners());
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <PageTitle>{t("title")}</PageTitle>
        <div className="flex gap-3 text-sm">
          <Link className="underline" href="/owners/expenses">
            {t("expenses")}
          </Link>
          <Link className="underline" href="/owners/statements">
            {t("statements")}
          </Link>
          <Link className="underline" href="/owners/payouts">
            {t("payouts")}
          </Link>
        </div>
      </div>
      <div className="grid grid-cols-[2fr_1fr] gap-4">
        <Card>
          {rows.length === 0 ? <p className="text-sm text-muted">{t("empty")}</p> : null}
          {rows.map((o) => (
            <div
              key={o.id}
              className="flex items-center justify-between border-t border-border py-2 text-sm"
              data-testid="owner-row"
            >
              <div>
                <Link className="font-medium underline" href={`/owners/${o.id}`}>
                  {o.name}
                </Link>
                <span className="ms-2 text-xs text-muted">
                  {o.type} · {o.email ?? "—"} · {o.agreements} {t("agreementsCount")} ·{" "}
                  {o.properties.join(", ")}
                </span>
              </div>
              <span className="text-xs">
                {o.userId ? (
                  <Chip color="success" size="sm">
                    {t("portalOn")}
                  </Chip>
                ) : null}
              </span>
            </div>
          ))}
        </Card>
        <Card>
          <form action={createOwnerAction} className="space-y-2">
            <p className="font-medium">{t("newOwner")}</p>
            <div>
              <Select label={t("type")} name="type" defaultValue="individual">
                <option value="individual">{t("individual")}</option>
                <option value="company">{t("company")}</option>
              </Select>
            </div>
            <Field label={t("name")} name="name" />
            <Field label={t("email")} name="email" type="email" required={false} />
            <Field label={t("phone")} name="phone" required={false} />
            <Field label={t("taxId")} name="taxId" required={false} />
            <Field label={t("locale")} name="locale" defaultValue="en" />
            <Button type="submit" data-testid="create-owner">
              {t("create")}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
