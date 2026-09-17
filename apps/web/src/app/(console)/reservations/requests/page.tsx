import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Button, Card, EmptyState, PageTitle, Select } from "@/components/ui";
import { guard } from "@/server/guard";
import { RequestCard } from "./request-card";
import { listRequests } from "./requests.actions";

/** Airbnb requests waiting on the host (spec 09 §9.8): inquiries, reservation requests, alterations, oldest deadline first. */
export default async function RequestsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const t = await getTranslations("inbox");
  const { rows, properties } = await guard(() =>
    listRequests({ state: sp.state === "all" ? "all" : "open", propertyId: sp.property ?? null }),
  );
  return (
    <div className="space-y-4">
      <PageTitle>{t("requests")}</PageTitle>
      <form className="flex flex-wrap gap-2 text-xs">
        <Select name="property" defaultValue={sp.property ?? ""} size="sm">
          <option value="">{t("allProperties")}</option>
          {properties.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </Select>
        <Select name="state" defaultValue={sp.state ?? "open"} size="sm">
          <option value="open">{t("requestStates.open")}</option>
          <option value="all">{t("anyState")}</option>
        </Select>
        <Button type="submit" variant="secondary" size="sm">
          {t("filter")}
        </Button>
      </form>
      {rows.length === 0 ? (
        <EmptyState title={t("noRequests")} description={t("noRequestsHint")} />
      ) : (
        <Card contentClassName="flex flex-col gap-3">
          {rows.map((r) => (
            <div key={r.id} data-testid="request-row" data-state={r.state}>
              <RequestCard r={r} />
              {r.threadId ? (
                <Link href={`/inbox?view=all&thread=${r.threadId}`} className="text-xs underline">
                  {t("openConversation")}
                </Link>
              ) : null}
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
