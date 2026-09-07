import Link from "next/link";
import { getTranslations } from "next-intl/server";
import {
  Card,
  Chip,
  EmptyState,
  LinkButton,
  PageTitle,
  TBody,
  THead,
  Table,
  Td,
  Th,
  Tr,
} from "@/components/ui";
import { PropertiesPreview } from "@/components/previews";
import { guard } from "@/server/guard";
import { listProperties, listTemplates } from "./properties.actions";
import { AdoptForm } from "./adopt-form";

const stateColor: Record<string, "success" | "accent" | "default" | "warning"> = {
  live: "success",
  syncing: "accent",
  draft: "default",
  suspended: "warning",
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
        {rows.length === 0 ? (
          <EmptyState
            title={t("emptyTitle")}
            description={t("empty")}
            action={
              <LinkButton href="/properties/new" variant="primary">
                {t("emptyAction")}
              </LinkButton>
            }
            preview={<PropertiesPreview />}
          />
        ) : null}
        {rows.length > 0 ? (
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" data-testid="properties-table">
            {rows.map((p) => (
              <li key={p.id} data-state={p.state}>
                <Link
                  href={`/properties/${p.id}`}
                  className="group block overflow-hidden rounded-2xl border border-border bg-surface transition-colors hover:border-accent/60"
                >
                  <div className="relative aspect-[16/9] bg-surface-secondary">
                    {p.photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- remote OTA photo, no loader configured
                      <img
                        src={p.photoUrl}
                        alt=""
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center text-3xl text-muted">
                        {p.title.slice(0, 1).toUpperCase()}
                      </span>
                    )}
                    <span className="absolute start-3 top-3">
                      <Chip color={stateColor[p.state] ?? "default"} size="sm">
                        {t(`states.${p.state}`)}
                      </Chip>
                    </span>
                  </div>
                  <div className="flex items-start justify-between gap-3 p-4">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">{p.title}</p>
                      <p className="mt-0.5 truncate text-xs text-muted">
                        {[p.city, t(`kinds.${p.kind}`)].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <span
                      className="flex shrink-0 flex-wrap justify-end gap-1"
                      data-testid="property-channels"
                    >
                      {p.channels.length === 0 ? (
                        <span className="text-xs text-muted">{t("noChannelsShort")}</span>
                      ) : (
                        p.channels.map((c) => (
                          <span
                            key={c}
                            title={c}
                            data-channel={c}
                            className="rounded-md bg-default px-1.5 py-0.5 text-[0.65rem] font-medium text-foreground"
                          >
                            {c === "BookingCom" ? "Booking" : c === "AirBNB" ? "Airbnb" : c}
                          </span>
                        ))
                      )}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
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
