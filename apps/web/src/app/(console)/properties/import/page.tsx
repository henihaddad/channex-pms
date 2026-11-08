import Link from "next/link";
import { getTranslations } from "next-intl/server";
import {
  Button,
  Card,
  Chip,
  EmptyState,
  LinkButton,
  PageHeader,
  Select,
  Stat,
} from "@/components/ui";
import { guard } from "@/server/guard";
import { TabsOverride } from "../tabs-override";
import { loadAirbnbImport } from "./airbnb.actions";
import { ImportTable, type ImportTableLabels } from "./import-table";

const KEYS = [
  "title",
  "city",
  "country",
  "bedrooms",
  "sleeps",
  "summary",
  "amenities",
  "photos",
  "prices",
  "minStay",
  "ratePlan",
  "bookings",
] as const;

/**
 * Import from Airbnb (spec 07 CH-5, design "Import from Airbnb"): step 2 of 4, the preview.
 * Every field the import would write, Airbnb's value beside what the property will hold, and
 * nothing written until the manager approves exactly the ticked rows. Step 1 is connecting
 * Airbnb on Channels, step 3 the write, step 4 activating the connection, which brings the
 * bookings.
 */
export default async function ImportAirbnbPage({
  searchParams,
}: {
  searchParams: Promise<{ connection?: string; listing?: string; property?: string }>;
}) {
  const sp = await searchParams;
  const t = await getTranslations("properties.airbnbImport");
  const tp = await getTranslations("properties");
  const v = await guard(() =>
    loadAirbnbImport({
      ...(sp.connection ? { connectionId: sp.connection } : {}),
      ...(sp.listing ? { listingId: sp.listing } : {}),
      ...(sp.property ? { propertyId: sp.property } : {}),
    }),
  );
  const crumb = [
    { href: "/properties", label: tp("title") },
    { href: "/properties/new", label: tp("addCardTitle") },
    { label: t("crumb") },
  ];
  const csv = (
    <LinkButton href="/properties/import/csv" variant="secondary">
      {tp("import")}
    </LinkButton>
  );
  if (!v.connectionId)
    return (
      <TabsOverride items={null}>
        <div className="space-y-5">
          <PageHeader title={t("title")} description={t("step1")} crumb={crumb} actions={csv} />
          <Card>
            <EmptyState
              title={t("connectTitle")}
              description={t("connectBody")}
              action={
                <LinkButton href="/channels" variant="primary">
                  {t("connectAction")}
                </LinkButton>
              }
            />
          </Card>
        </div>
      </TabsOverride>
    );
  const listing = v.listings.find((l) => l.code === v.listingId);
  const p = v.preview;
  const labels: ImportTableLabels = {
    field: t("cols.field"),
    onAirbnb: t("cols.onAirbnb"),
    after: t("cols.after"),
    result: t("cols.result"),
    apply: t("apply"),
    fields: Object.fromEntries(KEYS.map((k) => [k, t(`fields.${k}`)])),
    notes: Object.fromEntries(
      KEYS.filter((k) =>
        ["amenities", "prices", "minStay", "ratePlan", "bookings", "sleeps"].includes(k),
      ).map((k) => [
        k,
        k === "ratePlan" && v.propertyId ? t("notes.ratePlanExisting") : t(`notes.${k}`),
      ]),
    ),
    results: {
      same: t("results.same"),
      change: t("results.change"),
      add: t("results.add"),
      unread: t("results.unread"),
      later: t("results.later"),
    },
    listed: t("listed"),
    nights: t("nights"),
    weekends: t("weekends"),
    pricedNights: t("pricedNights"),
    blocked: t("blocked"),
    onActivation: t("onActivation"),
    submit: t("submit"),
    download: t("download"),
    nothingYet: t("nothingYet"),
    now: t("now"),
  };
  return (
    <TabsOverride items={null}>
      <div className="space-y-5">
        <PageHeader title={t("title")} description={t("step2")} crumb={crumb} actions={csv} />

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat
            label={t("kpi.found")}
            value={t("kpi.listings", { count: v.listings.length })}
            hint={
              listing ? `${listing.title} · ${listing.code.slice(0, 4)}…` : t("kpi.allImported")
            }
          />
          <Stat
            label={t("kpi.read")}
            value={p ? p.fieldsRead : "—"}
            hint={p ? t("kpi.unread", { count: p.unread }) : undefined}
          />
          <Stat
            label={t("kpi.change")}
            value={p ? p.willChange + p.willAdd : "—"}
            hint={p ? t("kpi.changeHint", { change: p.willChange, add: p.willAdd }) : undefined}
          />
          <Stat label={t("kpi.written")} value={0} hint={t("kpi.writtenHint")} />
        </div>

        {v.listings.length === 0 ? (
          <Card>
            <EmptyState
              title={t("noneTitle")}
              description={t("noneBody")}
              action={
                <LinkButton href="/properties" variant="secondary">
                  {tp("title")}
                </LinkButton>
              }
            />
          </Card>
        ) : (
          <>
            <Card title={t("pickTitle")} description={t("pickHint")}>
              <form method="get" className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto]">
                <input type="hidden" name="connection" value={v.connectionId} />
                <Select label={t("listing")} name="listing" defaultValue={v.listingId ?? undefined}>
                  {v.listings.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.city ? `${l.title} · ${l.city}` : l.title}
                    </option>
                  ))}
                </Select>
                <Select label={t("into")} name="property" defaultValue={v.propertyId ?? "new"}>
                  <option value="new">{t("newProperty")}</option>
                  {v.properties.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.title}
                    </option>
                  ))}
                </Select>
                <Button type="submit" variant="secondary">
                  {t("preview")}
                </Button>
              </form>
            </Card>

            {p ? (
              <Card
                title={t("tableTitle")}
                description={t("tableHint")}
                actions={<Chip color="success">{t("readOnly")}</Chip>}
              >
                <ImportTable
                  rows={p.rows}
                  labels={labels}
                  hidden={{
                    connectionId: v.connectionId,
                    listingId: v.listingId ?? "",
                    propertyId: v.propertyId ?? "",
                  }}
                />
              </Card>
            ) : null}

            <Card title={t("nextTitle")}>
              <p className="text-sm leading-relaxed text-muted">
                {t("nextBody")}{" "}
                <Link href="/channels" className="font-semibold text-accent hover:underline">
                  {t("nextAction")}
                </Link>
              </p>
            </Card>
          </>
        )}
      </div>
    </TabsOverride>
  );
}
