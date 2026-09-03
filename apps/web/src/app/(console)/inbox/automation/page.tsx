import { getTranslations } from "next-intl/server";
import {
  Button,
  Card,
  Chip,
  Field,
  Label,
  PageTitle,
  Select,
  TBody,
  Table,
  Td,
  Tr,
} from "@/components/ui";
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
              className="border-t border-border py-2 text-sm"
              data-testid="rule-row"
              data-enabled={r.enabled ? "1" : "0"}
            >
              <p className="font-medium">
                {r.name} <span className="text-xs text-muted">v{r.version}</span>{" "}
                <span
                  className={`rounded px-1 text-xs ${r.enabled ? "bg-success-soft text-success-soft-foreground" : "bg-background"}`}
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
                  <Button type="submit" variant="secondary" data-testid="toggle-rule" size="sm">
                    {r.enabled ? t("disable") : t("enable")}
                  </Button>
                </form>
                <a
                  href={`/inbox/automation?test=${r.id}`}
                  className="rounded border border-border-secondary px-2 text-xs leading-6"
                  data-testid="test-send"
                >
                  {t("testSend")}
                </a>
              </div>
            </div>
          ))}
          {preview ? (
            <div
              className="rounded border border-accent/40 bg-accent-soft p-2 text-xs"
              data-testid="test-preview"
            >
              <p className="font-semibold">
                {t("testPreview")} {preview.sentTo ? `· ${t("sentTo")} ${preview.sentTo}` : ""}
              </p>
              <p className="whitespace-pre-wrap">{preview.text}</p>
              {preview.missing.length ? (
                <p className="text-danger">
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
                    <Chip color="danger" size="sm">
                      {t("stopped")}
                    </Chip>
                  ) : null}
                </span>
                <input type="hidden" name="propertyId" value={p.id} />
                <input type="hidden" name="on" value={p.killSwitch ? "0" : "1"} />
                <Button
                  type="submit"
                  variant={p.killSwitch ? "secondary" : "danger"}

                  size="sm"
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
                <Select label={t("trigger")} name="trigger">
                  {TRIGGERS.map((tr) => (
                    <option key={tr} value={tr}>
                      {t(`triggers.${tr}`)}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Select label={t("template")} name="templateId" required>
                  {view.templates.map((tpl) => (
                    <option key={tpl.id} value={tpl.id}>
                      {tpl.name} ({tpl.locale})
                    </option>
                  ))}
                </Select>
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
                  <Label key={code}>
                    <input type="checkbox" name="providers" value={code} /> {label}
                  </Label>
                ))}
              </fieldset>
              <Button type="submit" data-testid="save-rule">
                {t("saveRule")}
              </Button>
            </form>
          </Card>
          <Card title={t("recentRuns")}>
            <Table className="mt-1">
              <TBody>
                {view.runs.map((r) => (
                  <Tr key={r.id} data-testid="run-row" data-state={r.state}>
                    <Td>
                      {r.ruleName} v{r.ruleVersion}
                    </Td>
                    <Td>{r.propertyTitle}</Td>
                    <Td>{r.state}</Td>
                    <Td>{r.reason ?? ""}</Td>
                    <Td>{r.executedAt.slice(0, 16)}</Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </Card>
        </div>
      </div>
    </div>
  );
}
