import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PROVISION_STEPS } from "@pms/core";
import {
  Alert,
  Breadcrumbs,
  Button,
  Card,
  Chip,
  Field,
  Input,
  LinkButton,
  PageHeader,
  Select,
  TBody,
  Table,
  Td,
  Tr,
} from "@/components/ui";
import { guard } from "@/server/guard";
import {
  addDerivedPlanAction,
  addPolicyAction,
  forceResyncAction,
  loadProperty,
  updateRoomTypeCountAction,
} from "./property.actions";
import { AutoRefresh } from "../../auto-refresh";

const stateColor: Record<string, "success" | "accent" | "default" | "warning"> = {
  live: "success",
  syncing: "accent",
  draft: "default",
  suspended: "warning",
};

/**
 * One property. The page answers "is it live, and what do I do next" before
 * anything else; identifiers and setup steps sit behind "Technical details".
 */
export default async function PropertyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getTranslations("properties");
  const d = await guard(() => loadProperty(id));
  const stepIndex = d.provisioning ? PROVISION_STEPS.indexOf(d.provisioning.step) : -1;
  const visibleRoomTypes = d.roomTypes.filter(
    (r) => !r.isSystemManaged || d.property.kind !== "single_unit",
  );
  const state = d.property.state;
  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[{ href: "/properties", label: t("title") }, { label: d.property.title }]}
      />
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {d.property.title}
            <Chip
              color={stateColor[state] ?? "default"}
              data-testid="property-state"
              data-state={state}
            >
              {t(`states.${state}`)}
            </Chip>
          </span>
        }
        actions={
          <>
            <LinkButton href={`/calendar?propertyId=${d.property.id}`} variant="secondary">
              {t("openCalendar")}
            </LinkButton>
            <LinkButton
              href={`/properties/${d.property.id}/booking-engine`}
              variant="secondary"
              data-testid="open-booking-engine"
            >
              {t("bookingEngine")}
            </LinkButton>
            {state === "live" ? (
              <LinkButton href="/channels" variant="primary">
                {t("connectChannel")}
              </LinkButton>
            ) : null}
          </>
        }
      />

      {state === "live" && d.connections.length === 0 ? (
        <Alert tone="success" title={t("whatsNext")}>
          {t("nextLive")}{" "}
          <Link href="/channels" className="font-medium underline">
            {t("nextLiveAction")}
          </Link>
        </Alert>
      ) : null}
      {state === "syncing" || state === "draft" ? (
        <Alert tone="info" title={t("whatsNext")} data-testid="setup-progress">
          <p>{state === "syncing" ? t("nextSyncing") : t("nextDraft")}</p>
          <AutoRefresh />
          {d.provisioning?.lastError ? (
            <p className="mt-2 text-danger">
              {d.provisioning.lastError} (attempt {d.provisioning.attempts})
            </p>
          ) : null}
          <form action={forceResyncAction} className="mt-3">
            <input type="hidden" name="propertyId" value={d.property.id} />
            <Button type="submit" variant="secondary" size="sm">
              {t("retry")}
            </Button>
          </form>
        </Alert>
      ) : null}

      <Card title={t("ratePlans")}>
        <ul className="mb-4 text-sm" data-testid="rate-plans">
          {d.ratePlans.map((rp) => (
            <li key={rp.id} className="border-t border-border py-1.5">
              {rp.title}{" "}
              <span className="text-xs text-muted">
                · {d.roomTypes.find((r) => r.id === rp.roomTypeId)?.title} · {rp.currency}
                {rp.parentRatePlanId
                  ? ` · ${rp.derivedOption?.kind === "percent" ? `${(rp.derivedOption.value / 100).toFixed(0)}%` : `${((rp.derivedOption?.value ?? 0) / 100).toFixed(2)} ${rp.currency}`} ${rp.derivedOption?.direction === "decrease" ? t("decrease") : t("increase")} · ${d.ratePlans.find((p) => p.id === rp.parentRatePlanId)?.title ?? "?"}`
                  : ""}
              </span>
            </li>
          ))}
        </ul>
        <details className="rounded-xl border border-border p-4">
          <summary className="cursor-pointer text-sm font-medium">{t("derivedTitle")}</summary>
          <p className="mt-1 text-xs text-muted">{t("derivedHint")}</p>
          <form
            action={addDerivedPlanAction}
            className="mt-3 grid items-end gap-2 sm:grid-cols-5"
            data-testid="derived-form"
          >
            <input type="hidden" name="propertyId" value={d.property.id} />
            <Field label={t("derivedName")} name="title" placeholder="Non-refundable" />
            <Select label={t("parent")} name="parentRatePlanId">
              {d.ratePlans.map((rp) => (
                <option key={rp.id} value={rp.id}>
                  {rp.title}
                </option>
              ))}
            </Select>
            <Select label={t("direction")} name="direction">
              <option value="decrease">{t("decrease")}</option>
              <option value="increase">{t("increase")}</option>
            </Select>
            <Select label={t("by")} name="kind">
              <option value="percent">{t("percent")}</option>
              <option value="amount">{t("amount")}</option>
            </Select>
            <div className="flex gap-2">
              <Input
                name="value"
                type="number"
                min={0}
                step="0.01"
                defaultValue={10}
                aria-label={t("value")}
              />
              <Button type="submit">{t("add")}</Button>
            </div>
          </form>
        </details>
      </Card>

      {visibleRoomTypes.length > 0 ? (
        <Card title={t("roomTypes")}>
          <Table>
            <TBody>
              {visibleRoomTypes.map((rt) => (
                <Tr key={rt.id}>
                  <Td>{rt.title}</Td>
                  <Td>
                    {rt.occAdults} {t("wizard.adults").toLowerCase()} · {rt.occChildren}{" "}
                    {t("wizard.children").toLowerCase()} ·{" "}
                    {d.units.filter((u) => u.roomTypeId === rt.id).length}{" "}
                    {t("wizard.rooms").toLowerCase()}
                  </Td>
                  <Td className="text-end">
                    <form
                      action={updateRoomTypeCountAction}
                      className="flex items-center justify-end gap-2"
                    >
                      <input type="hidden" name="propertyId" value={d.property.id} />
                      <input type="hidden" name="roomTypeId" value={rt.id} />
                      <Input
                        name="countOfRooms"
                        type="number"
                        min={1}
                        defaultValue={rt.countOfRooms}
                        className="w-20"
                        aria-label={t("wizard.rooms")}
                      />
                      <Button type="submit" variant="secondary" size="sm">
                        {t("setCount")}
                      </Button>
                    </form>
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </Card>
      ) : null}

      <Card title={t("channels")}>
        {d.connections.length === 0 ? (
          <p className="text-sm text-muted">{t("noChannels")}</p>
        ) : (
          <ul className="text-sm">
            {d.connections.map((c) => (
              <li key={c.id} className="border-t border-border py-1.5">
                <Link href={`/channels/${c.id}`} className="font-medium hover:underline">
                  {c.adapterCode}
                </Link>{" "}
                <span className="text-xs text-muted">
                  · {c.state}
                  {c.readiness.ready
                    ? ""
                    : c.readiness.issues.length
                      ? ` · ${c.readiness.issues.join("; ")}`
                      : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title={t("policies")}>
        <ul className="mb-3 text-sm">
          {d.policies.map((p) => (
            <li key={p.id}>
              {p.title} · {t("checkIn")} {p.checkInTime} · {t("checkOut")} {p.checkOutTime}
            </li>
          ))}
        </ul>
        <details className="rounded-xl border border-border p-4">
          <summary className="cursor-pointer text-sm font-medium">{t("policyTitle")}</summary>
          <form action={addPolicyAction} className="mt-3 grid items-end gap-2 sm:grid-cols-4">
            <input type="hidden" name="propertyId" value={d.property.id} />
            <Field label={t("policyName")} name="title" placeholder="Flexible" />
            <Field label={t("checkIn")} name="checkInTime" defaultValue="15:00" />
            <Field label={t("checkOut")} name="checkOutTime" defaultValue="11:00" />
            <Button type="submit" variant="secondary">
              {t("addPolicy")}
            </Button>
          </form>
        </details>
      </Card>

      <details
        className="rounded-2xl border border-border bg-surface px-5 py-4 text-sm"
        data-testid="technical-details"
      >
        <summary className="cursor-pointer font-medium">{t("technical")}</summary>
        <dl className="mt-3 grid gap-x-6 gap-y-1 text-xs sm:grid-cols-[auto_1fr]">
          <dt className="text-muted">{t("setupStep")}</dt>
          <dd>
            <ol className="flex flex-wrap gap-1.5" data-testid="provisioning-steps">
              {PROVISION_STEPS.map((s, i) => (
                <li
                  key={s}
                  className={`rounded px-2 py-0.5 ${i < stepIndex || d.provisioning?.step === "live" ? "bg-success-soft text-success-soft-foreground" : i === stepIndex ? "bg-accent-soft text-accent" : "bg-background text-muted"}`}
                >
                  {s}
                </li>
              ))}
            </ol>
          </dd>
          <dt className="text-muted">{t("channexId")}</dt>
          <dd className="font-mono">{d.property.channexPropertyId ?? "—"}</dd>
          <dt className="text-muted">{t("webhook")}</dt>
          <dd>{d.property.webhookToken ? t("registered") : "—"}</dd>
          <dt className="text-muted">{t("cells")}</dt>
          <dd>
            {Object.entries(d.health)
              .map(([k, v]) => `${k} ${v}`)
              .join(", ") || "—"}
          </dd>
        </dl>
        {state === "live" ? (
          <form action={forceResyncAction} className="mt-3">
            <input type="hidden" name="propertyId" value={d.property.id} />
            <Button type="submit" variant="ghost" size="sm">
              {t("forceResync")}
            </Button>
          </form>
        ) : null}
        {d.bulkOps.length > 0 ? (
          <div className="mt-3">
            <p className="text-xs text-muted">{t("recentOpsHint")}</p>
            <ul className="text-xs text-muted">
              {d.bulkOps.map((o) => (
                <li key={o.id}>
                  {o.createdAt} · {o.cellCount} cells · {o.state}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </details>
    </div>
  );
}
