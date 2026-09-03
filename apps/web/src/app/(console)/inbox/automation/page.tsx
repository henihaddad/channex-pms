import { getTranslations } from "next-intl/server";
import { Button, Card, Field, PageTitle } from "@/components/ui";
import { guard } from "@/server/guard";
import { PROVIDER_LABELS, TRIGGERS } from "@/server/inbox";
import {
  killSwitchAction,
  loadAutomation,
  saveRuleAction,
  testSendAction,
  toggleRuleAction,
} from "../inbox.actions";

/** Rules over triggers with quiet hours, limits, handover, kill switch and test-send (spec 09 §9.5, AUTO-1..7). */
export default async function AutomationPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const t = await getTranslations("inbox");
  const view = await guard(() => loadAutomation());
  const preview = sp.test
    ? await guard(async () => {
        const fd = new FormData();
        fd.set("id", sp.test!);
        return testSendAction(fd);
      })
    : null;
  return (
    <div className="space-y-4">
      <PageTitle>{t("automation")}</PageTitle>
      <p className="text-sm text-muted">{t("automationHint")}</p>
      <div className="grid grid-cols-2 gap-4">
        <Card className="space-y-3">
          {view.rules.length === 0 ? <p className="text-sm text-muted">{t("noRules")}</p> : null}
          {view.rules.map((r) => (
            <div
              key={r.id}
              className="border-t border-line py-2 text-sm"
              data-testid="rule-row"
              data-enabled={r.enabled ? "1" : "0"}
            >
              <p className="font-medium">
                {r.name} <span className="text-xs text-muted">v{r.version}</span>{" "}
                <span
                  className={`rounded px-1 text-[10px] ${r.enabled ? "bg-mint-soft text-mint-deep" : "bg-canvas"}`}
                >
                  {r.enabled ? t("enabled") : t("disabled")}
                </span>
              </p>
              <p className="text-xs text-muted">
                {t(`triggers.${r.trigger}`)}
                {r.offsetDays !== undefined ? ` · ${String(r.offsetDays)}d` : ""}
                {r.atLocalTime ? ` · ${r.atLocalTime}` : ""} · {r.templateName}
                {r.quietHours
                  ? ` · ${t("quietHours")} ${r.quietHours.from}–${r.quietHours.to}`
                  : ""}
                {r.conditions?.providers?.length ? ` · ${r.conditions.providers.join(", ")}` : ""}
              </p>
              <div className="mt-1 flex gap-1">
                <form action={toggleRuleAction}>
                  <input type="hidden" name="id" value={r.id} />
                  <input type="hidden" name="enabled" value={r.enabled ? "0" : "1"} />
                  <Button
                    type="submit"
                    variant="secondary"
                    className="h-6 text-xs"
                    data-testid="toggle-rule"
                  >
                    {r.enabled ? t("disable") : t("enable")}
                  </Button>
                </form>
                <a
                  href={`/inbox/automation?test=${r.id}`}
                  className="rounded border border-line-strong px-2 text-xs leading-6"
                  data-testid="test-send"
                >
                  {t("testSend")}
                </a>
              </div>
            </div>
          ))}
          {preview ? (
            <div
              className="rounded border border-sky/40 bg-sky-soft p-2 text-xs"
              data-testid="test-preview"
            >
              <p className="font-semibold">
                {t("testPreview")} {preview.sentTo ? `· ${t("sentTo")} ${preview.sentTo}` : ""}
              </p>
              <p className="whitespace-pre-wrap">{preview.text}</p>
              {preview.missing.length ? (
                <p className="text-rose">
                  {t("missing")}: {preview.missing.join(", ")}
                </p>
              ) : null}
              {!preview.bookingId ? <p className="text-muted">{t("noUpcomingBooking")}</p> : null}
            </div>
          ) : null}
          <div>
            <p className="text-sm font-medium">{t("killSwitch")}</p>
            {view.properties.map((p) => (
              <form
                key={p.id}
                action={killSwitchAction}
                className="flex items-center justify-between py-1 text-xs"
                data-testid="kill-switch"
                data-on={p.killSwitch ? "1" : "0"}
              >
                <span>
                  {p.title}{" "}
                  {p.killSwitch ? (
                    <span className="rounded bg-rose-soft px-1 text-rose">{t("stopped")}</span>
                  ) : null}
                </span>
                <input type="hidden" name="propertyId" value={p.id} />
                <input type="hidden" name="on" value={p.killSwitch ? "0" : "1"} />
                <Button
                  type="submit"
                  variant={p.killSwitch ? "secondary" : "danger"}
                  className="h-6 text-xs"
                >
                  {p.killSwitch ? t("resumeAutomation") : t("stopAutomation")}
                </Button>
              </form>
            ))}
          </div>
        </Card>
        <div className="space-y-4">
          <Card>
            <form action={saveRuleAction} className="space-y-2">
              <Field label={t("ruleName")} name="name" />
              <div>
                <label htmlFor="trigger" className="text-sm font-medium">
                  {t("trigger")}
                </label>
                <select
                  id="trigger"
                  name="trigger"
                  className="h-9 w-full rounded border border-line-strong px-2 text-sm"
                >
                  {TRIGGERS.map((tr) => (
                    <option key={tr} value={tr}>
                      {t(`triggers.${tr}`)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="templateId" className="text-sm font-medium">
                  {t("template")}
                </label>
                <select
                  id="templateId"
                  name="templateId"
                  required
                  className="h-9 w-full rounded border border-line-strong px-2 text-sm"
                >
                  {view.templates.map((tpl) => (
                    <option key={tpl.id} value={tpl.id}>
                      {tpl.name} ({tpl.locale})
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field label={t("offsetDays")} name="offsetDays" type="number" required={false} />
                <Field
                  label={t("atLocalTime")}
                  name="atLocalTime"
                  required={false}
                  placeholder="10:00"
                />
                <Field
                  label={t("quietFrom")}
                  name="quietFrom"
                  required={false}
                  placeholder="22:00"
                />
                <Field label={t("quietTo")} name="quietTo" required={false} placeholder="08:00" />
                <Field label={t("minNights")} name="minNights" type="number" required={false} />
              </div>
              <fieldset className="text-xs">
                <legend className="font-medium">{t("onlyChannels")}</legend>
                {Object.entries(PROVIDER_LABELS).map(([code, label]) => (
                  <label key={code} className="me-3">
                    <input type="checkbox" name="providers" value={code} /> {label}
                  </label>
                ))}
              </fieldset>
              <Button type="submit" data-testid="save-rule">
                {t("saveRule")}
              </Button>
            </form>
          </Card>
          <Card>
            <p className="text-sm font-medium">{t("recentRuns")}</p>
            <table className="mt-1 w-full text-xs">
              <tbody>
                {view.runs.map((r) => (
                  <tr
                    key={r.id}
                    className="border-t border-line"
                    data-testid="run-row"
                    data-state={r.state}
                  >
                    <td className="py-1">
                      {r.ruleName} v{r.ruleVersion}
                    </td>
                    <td>{r.propertyTitle}</td>
                    <td>{r.state}</td>
                    <td className="text-muted">{r.reason ?? ""}</td>
                    <td className="text-muted">{r.executedAt.slice(0, 16)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      </div>
    </div>
  );
}
