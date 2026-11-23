import { cache } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import { Card, Chip, PageTitle } from "@/components/ui";
import { guard } from "@/server/guard";
import { day } from "@/lib/format";
import { listPropertiesBrief, loadConnection } from "../channels.actions";
import { channelOf } from "../channel-meta";
import { mappingLabels } from "../mapping-labels";
import { ConnectionMapping } from "./connection-mapping";
import { ActivateButton } from "./activate-button";
import { AirbnbImport } from "../airbnb-import";

/** One load per request, shared by the title and the page. */
const load = cache((id: string) => guard(() => loadConnection(id)));

const STATES = ["draft", "testing", "mapped", "active", "paused", "error", "removed"];

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const v = await load(id);
  return {
    title: `${v.connection.propertyTitle} · ${channelOf(v.connection.adapterCode).name}`,
  };
}

export default async function ConnectionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const v = await load(id);
  const [t, td, tm, tw, locale] = await Promise.all([
    getTranslations("channels"),
    getTranslations("channels.detail"),
    getTranslations("channels.mapping"),
    getTranslations("channels.wizard"),
    getLocale(),
  ]);
  const c = v.connection;
  const channel = channelOf(c.adapterCode).name;
  const state = STATES.includes(c.state) ? c.state : "draft";
  const settings = Object.entries(c.settings);
  return (
    <div className="space-y-6">
      <PageTitle>
        {c.propertyTitle} · {channel}
      </PageTitle>
      <Card>
        <p
          className="flex flex-wrap items-center gap-2 text-sm text-muted"
          data-testid="connection-state"
          data-state={c.state}
        >
          <Chip
            size="sm"
            color={
              c.state === "active"
                ? "success"
                : c.state === "error"
                  ? "danger"
                  : c.state === "paused"
                    ? "warning"
                    : "default"
            }
          >
            {t(`states.${state}`)}
          </Chip>
          {c.readiness.ready
            ? td("ready")
            : td("notReady", { issues: c.readiness.issues.join("; ") })}
        </p>
        {c.expectedRemovalDate ? (
          <p className="mt-2 text-sm text-danger" data-testid="removal-scheduled">
            {t("removalScheduled", { date: day(c.expectedRemovalDate, locale) })}
          </p>
        ) : null}
        <details className="mt-3 text-xs text-muted">
          <summary className="cursor-pointer font-medium">{td("technical")}</summary>
          <dl className="mt-2 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1">
            <dt>{td("channexChannel")}</dt>
            <dd className="font-mono">{c.channexChannelId ?? "—"}</dd>
            <dt>{td("settings")}</dt>
            <dd className="font-mono break-all">
              {settings.map(([k, val]) => `${k}=${val}`).join(", ") || "—"}
            </dd>
          </dl>
          <p className="mt-1">{td("secretsHidden")}</p>
        </details>
      </Card>
      {c.adapterCode === "AirBNB" && c.settings.managedIn === "channex" ? (
        <Card title={t("importTitle")}>
          <AirbnbImport
            connectionId={c.id}
            properties={await listPropertiesBrief()}
            labels={{
              load: t("importLoad"),
              hint: t("importHint"),
              none: t("importNone"),
              newProperty: t("importNew"),
              target: t("importTarget"),
              run: t.raw("importRun") as string,
              done: t.raw("importDone") as string,
              failed: tw("failed"),
            }}
          />
        </Card>
      ) : null}
      <Card title={tm("title", { channel })}>
        <ConnectionMapping
          view={v}
          channel={channel}
          labels={{
            liveTitle: tm.raw("liveTitle") as string,
            startSelling: tm.raw("startSelling") as string,
            stopSelling: tm.raw("stopSelling") as string,
            move: tm.raw("move") as string,
            save: tm("save"),
            saveLive: tm.raw("saveLive") as string,
            saving: tm("saving"),
            saved: tm.raw("saved") as string,
            savedLive: tm.raw("savedLive") as string,
            failed: tw("failed"),
            editor: await mappingLabels(),
          }}
        />
      </Card>
      {c.state !== "active" && c.state !== "removed" ? (
        <Card title={td("activateTitle")}>
          <p className="mb-3 text-sm text-muted">{td("activateBody", { channel })}</p>
          <ActivateButton
            connectionId={c.id}
            channel={channel}
            labels={{
              label: td("activateButton"),
              pending: tw("activating"),
              live: tw.raw("live") as string,
              notReadyNoReason: tw.raw("notReadyNoReason") as string,
              failed: tw("failed"),
            }}
          />
        </Card>
      ) : null}
      {v.events.length > 0 ? (
        <Card title={t("events")}>
          <ul className="text-sm">
            {v.events.map((e) => (
              <li key={e.id} className="border-t border-border py-1 first:border-t-0">
                {e.severity === "p1" ? (
                  <Chip size="sm" color="danger" className="me-2">
                    {t("board.attention")}
                  </Chip>
                ) : null}
                {e.message}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
