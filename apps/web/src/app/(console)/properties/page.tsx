import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Card, Chip, EmptyState, LinkButton, PageHeader, Stat, cn } from "@/components/ui";
import { PropertiesPreview } from "@/components/previews";
import { guard } from "@/server/guard";
import { elapsed, percent } from "@/lib/format";
import { listTemplates, loadPortfolio, type PortfolioRow } from "./properties.actions";
import { AdoptForm } from "./adopt-form";
import { ChannelDot } from "./channel-dot";

const KINDS = ["single_unit", "multi_unit", "hotel"] as const;
type Filter = "all" | "attention" | (typeof KINDS)[number];

const pill = (active: boolean, tone: "default" | "warning" = "default") =>
  cn(
    "inline-flex h-8 items-center rounded-full border px-3 text-[13px] font-semibold whitespace-nowrap transition-colors",
    active
      ? "border-foreground bg-foreground text-background"
      : tone === "warning"
        ? "border-[#fcd34d] bg-[#fffbeb] text-[#92400e] hover:border-[#f59e0b]"
        : "border-border bg-surface text-foreground hover:border-muted",
  );

/**
 * The portfolio (spec 03 §3.2a, design "Properties"): one card per property with how full
 * it is over the coming month, where it sells and whether the channel manager is in step.
 * The pills filter by kind and pull out the ones that need a human.
 */
export default async function PropertiesPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string }>;
}) {
  const sp = await searchParams;
  const t = await getTranslations("properties");
  const [{ rows, content }, templates] = await guard(() =>
    Promise.all([loadPortfolio(), listTemplates()]),
  );
  const attention = rows.filter((r) => r.attention);
  const filter: Filter = (["attention", ...KINDS] as string[]).includes(sp.show ?? "")
    ? (sp.show as Filter)
    : "all";
  const shown =
    filter === "all"
      ? rows
      : filter === "attention"
        ? attention
        : rows.filter((r) => r.kind === filter);
  const kindCounts = KINDS.map((k) => [k, rows.filter((r) => r.kind === k).length] as const).filter(
    ([, n]) => n > 0,
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title={t("title")}
        titleOnPhone={false}
        actions={
          <LinkButton href="/properties/new" variant="primary" data-testid="new-property">
            + {t("addProperty")}
          </LinkButton>
        }
      />

      {rows.length === 0 ? (
        <Card>
          <EmptyState
            title={t("emptyTitle")}
            description={t("empty")}
            action={
              <div className="flex flex-wrap gap-2">
                <LinkButton href="/properties/new" variant="primary">
                  {t("emptyAction")}
                </LinkButton>
                <LinkButton href="/properties/import" variant="secondary">
                  {t("importAirbnb")}
                </LinkButton>
              </div>
            }
            preview={<PropertiesPreview />}
          />
        </Card>
      ) : (
        <>
          <nav aria-label={t("filterLabel")} className="flex flex-wrap items-center gap-2">
            <Link
              href="/properties"
              className={pill(filter === "all")}
              aria-current={filter === "all" ? "page" : undefined}
            >
              {t("filters.all")} · {rows.length}
            </Link>
            {kindCounts.map(([k, n]) => (
              <Link
                key={k}
                href={`/properties?show=${k}`}
                className={pill(filter === k)}
                aria-current={filter === k ? "page" : undefined}
              >
                {t(`filters.${k}`)} · {n}
              </Link>
            ))}
            {attention.length > 0 ? (
              <Link
                href="/properties?show=attention"
                className={pill(filter === "attention", "warning")}
                aria-current={filter === "attention" ? "page" : undefined}
                data-testid="filter-attention"
              >
                {t("filters.attention")} · {attention.length}
              </Link>
            ) : null}
            <span className="flex-1" />
            <Link href="/properties/import" className={pill(false)}>
              {t("importAirbnb")}
            </Link>
          </nav>

          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" data-testid="properties-table">
            {shown.map((p) => (
              <li key={p.id} data-state={p.state} className="flex">
                <PropertyCard p={p} t={t} />
              </li>
            ))}
            {filter === "all" ? (
              <li className="flex list-none">
                <Link
                  href="/properties/new"
                  className="flex min-h-[260px] w-full flex-col items-center justify-center gap-2 rounded-card border-2 border-dashed border-border p-6 text-center text-muted transition-colors hover:border-accent/60"
                >
                  <span
                    aria-hidden="true"
                    className="grid h-11 w-11 place-items-center rounded-full bg-accent text-2xl font-bold text-accent-foreground"
                  >
                    +
                  </span>
                  <strong className="text-foreground">{t("addCardTitle")}</strong>
                  <span className="text-xs">{t("addCardHint")}</span>
                </Link>
              </li>
            ) : null}
          </ul>

          <Card
            title={t("content.title")}
            actions={<span className="text-xs text-muted">{t("content.hint")}</span>}
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
            data-testid="content-completeness"
          >
            <Stat
              label={t("content.photos")}
              value={t("content.of", { done: content.photos.done, total: content.photos.total })}
              hint={
                content.photos.fewest?.photos === 0
                  ? t("content.photosNone", { title: content.photos.fewest.title })
                  : content.photos.fewest
                    ? t("content.photosFewest", {
                        title: content.photos.fewest.title,
                        count: content.photos.fewest.photos,
                      })
                    : undefined
              }
            />
            <Stat
              label={t("content.guide")}
              value={
                <span className={content.guide.missing.length ? "text-[#b45309]" : undefined}>
                  {t("content.of", { done: content.guide.done, total: content.guide.total })}
                </span>
              }
              hint={missingHint(content.guide.missing, t)}
            />
            <Stat
              label={t("content.houseRules")}
              value={t("content.of", {
                done: content.houseRules.done,
                total: content.houseRules.total,
              })}
              hint={missingHint(content.houseRules.missing, t)}
            />
            <Stat
              label={t("content.rails")}
              value={t("content.of", {
                done: content.pricingRails.done,
                total: content.pricingRails.total,
              })}
              hint={
                content.pricingRails.missing.length
                  ? missingHint(content.pricingRails.missing, t)
                  : t("content.railsSet")
              }
            />
          </Card>
        </>
      )}

      <Card
        title={t("more.title")}
        description={t("more.hint")}
        className="grid gap-6 md:grid-cols-3"
        data-testid="more-ways"
      >
        <div className="space-y-2">
          <p className="text-sm font-semibold text-foreground">{t("more.csv")}</p>
          <p className="text-xs text-muted">{t("importHint")}</p>
          <LinkButton href="/properties/import/csv" variant="secondary" size="sm">
            {t("import")}
          </LinkButton>
        </div>
        <div className="space-y-2">
          <p className="text-sm font-semibold text-foreground">{t("templates")}</p>
          {templates.length === 0 ? (
            <p className="text-xs text-muted">{t("noTemplates")}</p>
          ) : (
            <ul className="space-y-1 text-sm text-foreground">
              {templates.map((x) => (
                <li key={x.id}>
                  {x.name}{" "}
                  <span className="text-xs text-muted">
                    · {t(`kinds.${x.payload.kind}`)} · {x.payload.currency}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="space-y-2">
          <p className="text-sm font-semibold text-foreground">{t("adopt")}</p>
          <p className="text-xs text-muted">{t("adoptHint")}</p>
          <AdoptForm label={t("adoptSubmit")} />
        </div>
      </Card>
    </div>
  );
}

type T = Awaited<ReturnType<typeof getTranslations<"properties">>>;

function missingHint(missing: readonly string[], t: T): string | undefined {
  if (missing.length === 0) return undefined;
  const names = missing.slice(0, 2).join(", ");
  return missing.length > 2
    ? t("content.missingMore", { names, more: missing.length - 2 })
    : t("content.missing", { names });
}

function syncChip(p: PortfolioRow, t: T) {
  const a = p.attention;
  if (a?.kind === "unmapped_bookings")
    return <Chip color="warning">{t("chip.unmapped", { count: a.count })}</Chip>;
  if (a?.kind === "setup_failed") return <Chip color="warning">{t("chip.setupFailed")}</Chip>;
  if (a?.kind === "sync_failed")
    return <Chip color="warning">{t("chip.syncFailed", { count: a.cells })}</Chip>;
  if (a?.kind === "suspended") return <Chip color="warning">{t("states.suspended")}</Chip>;
  if (p.state !== "live") return <Chip color="info">{t(`states.${p.state}`)}</Chip>;
  if (p.vitals.pendingCells > 0) return <Chip color="info">{t("chip.sending")}</Chip>;
  if (p.vitals.lastSyncedAt) {
    const ago = Date.now() - new Date(p.vitals.lastSyncedAt).getTime();
    return (
      <Chip color="success">
        {ago < 60_000
          ? t("chip.syncedNow")
          : t("chip.synced", { ago: elapsed(p.vitals.lastSyncedAt) })}
      </Chip>
    );
  }
  return <Chip color="success">{t("chip.inSync")}</Chip>;
}

function PropertyCard({ p, t }: { p: PortfolioRow; t: T }) {
  const where = [p.city, p.country].filter(Boolean).join(", ");
  const unitWord = p.kind === "hotel" ? "rooms" : "units";
  const channels = [...p.channels, ...(p.vitals.directEnabled ? ["direct"] : [])];
  const occ = p.occupancyBps;
  return (
    <Link
      href={`/properties/${p.id}`}
      className="group flex w-full flex-col overflow-hidden rounded-card border border-border bg-surface transition-colors hover:border-accent/60"
    >
      <div className="relative h-[120px] bg-[linear-gradient(135deg,#d8f3ee,#cdeff5)]">
        {p.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- remote OTA photo, no loader configured
          <img src={p.photoUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : null}
        <span className="absolute start-3.5 bottom-3" data-testid="property-sync">
          {syncChip(p, t)}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-1.5 px-4 pt-3.5 pb-4">
        <strong className="truncate text-[15px] text-foreground">{p.title}</strong>
        <span className="truncate text-xs text-muted">
          {[where, t(`count.${unitWord}`, { count: p.vitals.units })].filter(Boolean).join(" · ")}
        </span>
        <span
          className="mt-1 flex flex-wrap gap-x-2.5 gap-y-1 text-xs text-foreground"
          data-testid="property-channels"
        >
          {channels.length === 0 ? (
            <span className="text-muted">{t("noChannelsShort")}</span>
          ) : (
            channels.map((c) => <ChannelDot key={c} code={c} />)
          )}
        </span>
        <span className="mt-auto flex justify-between pt-1.5 text-xs text-muted">
          <span>{t("occupancy30")}</span>
          <strong className="text-foreground tabular-nums">
            {occ === null ? "—" : percent(occ / 10_000)}
          </strong>
        </span>
        <span
          className="h-1.5 overflow-hidden rounded-full bg-default"
          role="progressbar"
          aria-label={t("occupancy30")}
          aria-valuenow={occ === null ? 0 : Math.round(occ / 100)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <span
            className="block h-full bg-[linear-gradient(90deg,#34d399,#22d3ee)]"
            style={{ width: `${occ === null ? 0 : occ / 100}%` }}
          />
        </span>
      </div>
    </Link>
  );
}
