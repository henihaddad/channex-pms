import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { AutomationTrigger } from "@pms/core";
import {
  Button,
  Card,
  Chip,
  Field,
  LinkButton,
  PageHeader,
  Select,
  Stat,
  Textarea,
  cn,
} from "@/components/ui";
import { guard } from "@/server/guard";
import { PROVIDER_LABELS, TRIGGERS } from "@/server/inbox";
import { clock, dayMonth } from "@/lib/format";
import {
  killSwitchAction,
  loadAutomation,
  saveRuleAction,
  testSendAction,
  toggleRuleAction,
} from "../inbox.actions";

const PHASES: Array<{
  key: "booking" | "before" | "during" | "after";
  triggers: AutomationTrigger[];
}> = [
  { key: "booking", triggers: ["booking_confirmed", "inquiry_received", "booking_cancelled"] },
  { key: "before", triggers: ["before_arrival", "access_window"] },
  { key: "during", triggers: ["checked_in", "mid_stay", "message_outside_hours", "checkout_day"] },
  { key: "after", triggers: ["after_departure"] },
];

/**
 * Automation (spec 09 §9.5, design canvas "Automation — guest journey"): the rules as a timeline
 * of the stay, each one message at one moment with its On/Off switch, and the selected rule's
 * editor beside it, message included. What the rules did in the last 30 days sits on top; the
 * kill switch and the run log stay below (AUTO-1..7).
 */
export default async function AutomationPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const t = await getTranslations("inbox");
  const ta = await getTranslations("inbox.auto");
  const view = await guard(() => loadAutomation());
  const preview = sp.test
    ? await guard(async () => {
        const fd = new FormData();
        fd.set("id", sp.test!);
        return testSendAction(fd);
      })
    : null;
  const selected =
    sp.rule === "new" ? null : (view.rules.find((r) => r.id === sp.rule) ?? view.rules[0] ?? null);
  const creating = sp.rule === "new" || view.rules.length === 0;
  const off = view.rules.filter((r) => !r.enabled).length;
  const titleOf = (id: string) => view.properties.find((p) => p.id === id)?.title ?? "";

  const when = (r: { trigger: AutomationTrigger; offsetDays?: number; atLocalTime?: string }) => {
    const n = Math.abs(r.offsetDays ?? 0);
    const base = (() => {
      switch (r.trigger) {
        case "booking_confirmed":
          return ta("when.immediately");
        case "before_arrival":
          return n === 0 ? ta("when.dayOf") : ta("when.daysBefore", { n });
        case "access_window":
          return ta("when.access");
        case "checked_in":
          return ta("when.checkIn");
        case "mid_stay":
          return ta("when.midStay");
        case "checkout_day":
          return ta("when.checkout");
        case "after_departure":
          return n === 0 ? ta("when.after") : ta("when.daysAfter", { n });
        case "inquiry_received":
          return ta("when.inquiry");
        case "message_outside_hours":
          return ta("when.outside");
        case "booking_cancelled":
          return ta("when.cancelled");
        default:
          return r.trigger;
      }
    })();
    return r.atLocalTime ? ta("when.at", { when: base, time: r.atLocalTime }) : base;
  };
  const detail = (r: (typeof view.rules)[number]) =>
    [
      ta("via"),
      r.conditions?.propertyIds?.length
        ? r.conditions.propertyIds.map(titleOf).filter(Boolean).join(", ")
        : ta("allProperties"),
      r.conditions?.providers?.length
        ? r.conditions.providers.map((p) => PROVIDER_LABELS[p] ?? p).join(", ")
        : ta("allChannels"),
      r.conditions?.minNights ? ta("minNights", { n: r.conditions.minNights }) : null,
      r.quietHours ? `${t("quietHours")} ${r.quietHours.from}–${r.quietHours.to}` : null,
    ]
      .filter(Boolean)
      .join(" · ");
  const template = selected
    ? view.templates.find((x) => x.id === selected.templateId)
    : view.templates[0];

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={t("automation")}
        description={ta("lead")}
        actions={
          <LinkButton href="/inbox/automation?rule=new" variant="primary">
            {ta("add")}
          </LinkButton>
        }
      />
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label={ta("sent")}
          value={String(view.stats.sent)}
          hint={ta("failed", { n: view.stats.failed })}
        />
        <Stat label={ta("skipped")} value={String(view.stats.skipped)} hint={ta("skippedSub")} />
        <Stat
          label={ta("requests")}
          value={String(view.stats.reviewRequests)}
          hint={ta("received", { n: view.stats.reviewsReceived })}
        />
        <Stat label={ta("rules")} value={String(view.rules.length)} hint={ta("off", { n: off })} />
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="flex flex-col gap-5">
          <Card>
            <div className="relative">
              <span className="absolute inset-y-2 start-[5px] w-px bg-border" aria-hidden="true" />
              {PHASES.map((ph) => {
                const rules = view.rules.filter((r) => ph.triggers.includes(r.trigger));
                const guideRow = ph.key === "during";
                if (rules.length === 0 && !guideRow) return null;
                return (
                  <div key={ph.key} className="mb-4 last:mb-0">
                    <h3 className="relative flex items-center gap-3 py-1 text-[11px] font-bold tracking-wider text-muted uppercase">
                      <span
                        className="h-[11px] w-[11px] rounded-full border-2 border-accent bg-surface"
                        aria-hidden="true"
                      />
                      {ta(`phase.${ph.key}`)}
                    </h3>
                    <ul className="ms-6">
                      {rules.map((r) => (
                        <li
                          key={r.id}
                          className={cn(
                            "grid grid-cols-[150px_minmax(0,1fr)_auto_auto] items-center gap-3 border-b border-default py-3 text-sm last:border-b-0",
                            selected?.id === r.id && !creating
                              ? "-mx-2 rounded-lg bg-[#f0faf8] px-2"
                              : "",
                          )}
                          data-testid="rule-row"
                          data-enabled={r.enabled ? "1" : "0"}
                        >
                          <span className="text-xs font-semibold text-muted">{when(r)}</span>
                          <span className="min-w-0">
                            <strong className="block truncate font-semibold">{r.name}</strong>
                            <span className="block truncate text-xs text-muted">{detail(r)}</span>
                          </span>
                          <form action={toggleRuleAction}>
                            <input type="hidden" name="id" value={r.id} />
                            <input type="hidden" name="enabled" value={r.enabled ? "0" : "1"} />
                            <button
                              type="submit"
                              data-testid="toggle-rule"
                              title={r.enabled ? t("disable") : t("enable")}
                              className={cn(
                                "rounded-full px-2.5 py-0.5 text-xs font-semibold",
                                r.enabled
                                  ? "bg-success-soft text-success-soft-foreground"
                                  : "bg-default text-muted",
                              )}
                            >
                              {r.enabled ? ta("on") : ta("offPill")}
                            </button>
                          </form>
                          <Link
                            href={`/inbox/automation?rule=${r.id}`}
                            className="text-xs font-semibold text-accent hover:underline"
                          >
                            {ta("edit")}
                          </Link>
                        </li>
                      ))}
                      {guideRow ? (
                        <li className="grid grid-cols-[150px_minmax(0,1fr)_auto_auto] items-center gap-3 py-3 text-sm">
                          <span className="text-xs font-semibold text-muted">
                            {ta("guideRowWhen")}
                          </span>
                          <span className="min-w-0">
                            <strong className="block truncate font-semibold">
                              {ta("guideRow")}
                            </strong>
                            <span className="block truncate text-xs text-muted">
                              {ta("guideRowSub")}
                            </span>
                          </span>
                          <span className="rounded-full bg-success-soft px-2.5 py-0.5 text-xs font-semibold text-success-soft-foreground">
                            {ta("on")}
                          </span>
                          <Link
                            href="/properties"
                            className="text-xs font-semibold text-accent hover:underline"
                          >
                            {ta("edit")}
                          </Link>
                        </li>
                      ) : null}
                    </ul>
                  </div>
                );
              })}
            </div>
          </Card>

          <Card title={t("killSwitch")}>
            {view.properties.map((p) => (
              <form
                key={p.id}
                action={killSwitchAction}
                className="flex items-center justify-between gap-3 border-b border-default py-2 text-sm last:border-b-0"
                data-testid="kill-switch"
                data-on={p.killSwitch ? "1" : "0"}
              >
                <span>
                  {p.title}{" "}
                  {p.killSwitch ? (
                    <Chip color="danger" size="sm">
                      {t("stopped")}
                    </Chip>
                  ) : null}
                </span>
                <input type="hidden" name="propertyId" value={p.id} />
                <input type="hidden" name="on" value={p.killSwitch ? "0" : "1"} />
                <Button type="submit" variant={p.killSwitch ? "secondary" : "ghost"} size="sm">
                  {p.killSwitch ? t("resumeAutomation") : t("stopAutomation")}
                </Button>
              </form>
            ))}
          </Card>

          <Card title={t("recentRuns")}>
            {view.runs.length === 0 ? <p className="text-sm text-muted">—</p> : null}
            <ul className="flex flex-col">
              {view.runs.slice(0, 12).map((r) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between gap-3 border-b border-default py-2 text-sm last:border-b-0"
                  data-testid="run-row"
                  data-state={r.state}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{r.ruleName}</span>
                    <span className="block truncate text-xs text-muted">
                      {[r.propertyTitle, r.reason].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2 text-xs text-muted">
                    <Chip
                      size="sm"
                      color={
                        r.state === "sent" ? "success" : r.state === "failed" ? "danger" : "default"
                      }
                    >
                      {r.state}
                    </Chip>
                    {dayMonth(r.executedAt)} {clock(r.executedAt)}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <div className="flex flex-col gap-5">
          <Card
            title={creating ? ta("new") : (selected?.name ?? ta("new"))}
            description={selected && !creating ? when(selected) : undefined}
          >
            <form action={saveRuleAction} className="flex flex-col gap-3">
              {selected && !creating ? <input type="hidden" name="id" value={selected.id} /> : null}
              <Field
                label={t("ruleName")}
                name="name"
                defaultValue={creating ? "" : (selected?.name ?? "")}
              />
              <div className="grid grid-cols-2 gap-3">
                <Select
                  label={t("trigger")}
                  name="trigger"
                  defaultValue={creating ? "before_arrival" : selected?.trigger}
                >
                  {TRIGGERS.map((tr) => (
                    <option key={tr} value={tr}>
                      {t(`triggers.${tr}`)}
                    </option>
                  ))}
                </Select>
                <Field
                  label={t("atLocalTime")}
                  name="atLocalTime"
                  required={false}
                  placeholder="10:00"
                  defaultValue={creating ? "" : (selected?.atLocalTime ?? "")}
                />
                <Field
                  label={t("offsetDays")}
                  name="offsetDays"
                  type="number"
                  required={false}
                  description={ta("offsetHint")}
                  defaultValue={
                    creating || selected?.offsetDays === undefined
                      ? ""
                      : String(selected.offsetDays)
                  }
                />
                <Field
                  label={t("minNights")}
                  name="minNights"
                  type="number"
                  required={false}
                  defaultValue={
                    creating || !selected?.conditions?.minNights
                      ? ""
                      : String(selected.conditions.minNights)
                  }
                />
              </div>
              <Select label={t("template")} name="templateId" required defaultValue={template?.id}>
                {view.templates.map((tpl) => (
                  <option key={tpl.id} value={tpl.id}>
                    {tpl.name} ({tpl.locale})
                  </option>
                ))}
              </Select>
              <label className="flex flex-col gap-1.5 text-[13px] font-semibold">
                {ta("body")}
                <Textarea
                  name="body"
                  rows={7}
                  defaultValue={template?.body ?? ""}
                  key={template?.id}
                />
                <span className="text-xs font-normal text-muted">
                  {ta("variables")}{" "}
                  <Link href="/inbox/templates" className="text-accent hover:underline">
                    {ta("allVariables")}
                  </Link>
                </span>
              </label>
              <fieldset className="flex flex-col gap-1.5">
                <legend className="mb-1 text-[13px] font-semibold">{ta("properties")}</legend>
                <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm">
                  {view.properties.map((p) => (
                    <label key={p.id} className="flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        name="propertyIds"
                        value={p.id}
                        defaultChecked={
                          !creating && Boolean(selected?.conditions?.propertyIds?.includes(p.id))
                        }
                        className="accent-[var(--accent)]"
                      />
                      {p.title}
                    </label>
                  ))}
                </div>
              </fieldset>
              <fieldset className="flex flex-col gap-1.5">
                <legend className="mb-1 text-[13px] font-semibold">{ta("channels")}</legend>
                <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm">
                  {Object.entries(PROVIDER_LABELS).map(([code, label]) => (
                    <label key={code} className="flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        name="providers"
                        value={code}
                        defaultChecked={
                          !creating && Boolean(selected?.conditions?.providers?.includes(code))
                        }
                        className="accent-[var(--accent)]"
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </fieldset>
              <details className="rounded-xl border border-border">
                <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-muted select-none">
                  {ta("safety")}
                </summary>
                <div className="grid grid-cols-2 gap-3 border-t border-border p-3">
                  <Field
                    label={t("quietFrom")}
                    name="quietFrom"
                    required={false}
                    placeholder="22:00"
                    defaultValue={creating ? "" : (selected?.quietHours?.from ?? "")}
                  />
                  <Field
                    label={t("quietTo")}
                    name="quietTo"
                    required={false}
                    placeholder="08:00"
                    defaultValue={creating ? "" : (selected?.quietHours?.to ?? "")}
                  />
                  <p className="col-span-2 text-xs text-muted">{t("automationHint")}</p>
                </div>
              </details>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" variant="primary" data-testid="save-rule">
                  {ta("save")}
                </Button>
                {selected && !creating ? (
                  <LinkButton
                    href={`/inbox/automation?rule=${selected.id}&test=${selected.id}`}
                    data-testid="test-send"
                  >
                    {ta("test")}
                  </LinkButton>
                ) : null}
              </div>
            </form>
            {preview ? (
              <div
                className="mt-4 rounded-xl border border-[#c6e8e3] bg-[#f0faf8] p-3 text-xs"
                data-testid="test-preview"
              >
                <p className="font-semibold">
                  {t("testPreview")} {preview.sentTo ? `· ${t("sentTo")} ${preview.sentTo}` : ""}
                </p>
                <p className="mt-1 whitespace-pre-wrap">{preview.text}</p>
                {preview.missing.length ? (
                  <p className="text-danger">
                    {t("missing")}: {preview.missing.join(", ")}
                  </p>
                ) : null}
                {!preview.bookingId ? <p className="text-muted">{t("noUpcomingBooking")}</p> : null}
              </div>
            ) : null}
          </Card>
        </div>
      </div>
    </div>
  );
}
