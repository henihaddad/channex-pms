import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { bookingBalance, checkinFormState, stayPhase } from "@pms/core";
import {
  AnchorButton,
  Button,
  Card,
  Chip,
  PageHeader,
  Stat,
  TBody,
  THead,
  Table,
  Td,
  Th,
  Tr,
  cn,
} from "@/components/ui";
import { day, dayMonth } from "@/lib/format";
import { guard } from "@/server/guard";
import { BalanceChip } from "../words";
import { loadCheckinBoard, sendCheckinRemindersAction } from "./check-in.actions";

/**
 * Online check-in (spec 10 §10.6, design canvas November 2026): who arrives in the next seven
 * days or is in house, how far their check-in form is, the money and the door code, with the
 * reminders and the registration export one click away. Rows that still need something are
 * amber. Persona: `reservations_agent`.
 */
export default async function CheckInPage() {
  const t = await getTranslations("reservations.checkin");
  const tr = await getTranslations("reservations");
  const locale = await getLocale();
  const b = await guard(() => loadCheckinBoard());
  const arrivals = b.rows.filter((r) => r.arrivalDate >= b.today);
  const states = new Map(
    b.rows.map((r) => [
      r.id,
      checkinFormState({
        completedAt: r.formCompletedAt,
        guestsListed: r.guestsListed,
        guestsExpected: r.guestsExpected,
      }),
    ]),
  );
  const done = arrivals.filter((r) => states.get(r.id)?.kind === "done").length;
  const missing = arrivals.length - done;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={t("title")}
        actions={
          b.hasHotel ? (
            <Link href="/front-desk" className="text-sm font-semibold text-accent hover:underline">
              {t("frontDesk")} →
            </Link>
          ) : null
        }
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={t("kpi.arrivals")} value={arrivals.length} testId="kpi-arrivals" />
        <Stat
          label={t("kpi.formsDone")}
          value={<span className={cn(missing > 0 && "text-warning")}>{done}</span>}
          hint={missing > 0 ? t("kpi.missing", { n: missing }) : t("kpi.allDone")}
          testId="kpi-forms"
        />
        <Stat
          label={t("kpi.reminders")}
          value={b.remindersScheduled.length}
          hint={b.remindersScheduled.length > 0 ? t("kpi.remindersHint") : t("kpi.noRule")}
        />
        <Stat label={t("kpi.registrations")} value="—" hint={t("kpi.registrationsHint")} />
      </div>

      <Card
        title={t("upcoming")}
        actions={
          <>
            {b.remindable.length > 0 ? (
              <form action={sendCheckinRemindersAction}>
                {b.remindable.map((id) => (
                  <input key={id} type="hidden" name="bookingId" value={id} />
                ))}
                <Button type="submit" variant="secondary" size="sm" data-testid="send-reminders">
                  {t("sendReminders", { n: b.remindable.length })}
                </Button>
              </form>
            ) : null}
            <AnchorButton href="/api/v1/reservations/registrations" size="sm">
              {t("exportRegistrations")}
            </AnchorButton>
          </>
        }
      >
        <Table data-testid="checkin-table" className="min-w-[860px]">
          <THead>
            <Tr className="hover:bg-transparent">
              <Th>{t("col.guest")}</Th>
              <Th>{t("col.form")}</Th>
              <Th>{t("col.listed")}</Th>
              <Th>{t("col.id")}</Th>
              <Th>{t("col.balance")}</Th>
              <Th>{t("col.code")}</Th>
            </Tr>
          </THead>
          <TBody>
            {b.rows.length === 0 ? (
              <Tr>
                <Td colSpan={6} className="text-muted">
                  {t("empty")}
                </Td>
              </Tr>
            ) : null}
            {b.rows.map((r) => {
              const form = states.get(r.id)!;
              const phase = stayPhase(b.today, r.arrivalDate, r.departureDate);
              const when =
                phase.kind === "arrives"
                  ? phase.inDays === 0
                    ? `${tr("when.today")}${r.arrivalTime ? `, ${r.arrivalTime}` : ""}`
                    : day(r.arrivalDate, locale)
                  : tr("phase.inHouse");
              const balance = bookingBalance({
                status: r.status,
                paymentCollect: r.paymentCollect,
                totalMinor: r.totalAmountMinor,
                roomChargesMinor: r.roomChargesMinor,
                otherChargesMinor: r.otherChargesMinor,
                paidMinor: r.paidMinor,
              });
              const attention = form.kind !== "done";
              return (
                <Tr
                  key={r.id}
                  data-form={form.kind}
                  className={cn(attention && "bg-warning-soft/40")}
                >
                  <Td>
                    <Link
                      href={`/reservations/${r.id}`}
                      className="font-semibold text-foreground hover:underline"
                    >
                      {r.guestName}
                    </Link>
                    <span className="block text-xs text-muted">
                      {r.propertyTitle} · {when}
                    </span>
                  </Td>
                  <Td>
                    {form.kind === "done" ? (
                      <Chip color="success">{t("form.done")}</Chip>
                    ) : form.kind === "missing_guests" ? (
                      <Chip color="warning">{tr("chips.formMissing", { n: form.missing })}</Chip>
                    ) : (
                      <Chip color="warning">{t("form.notStarted")}</Chip>
                    )}
                  </Td>
                  <Td className="tabular-nums">
                    {t("listedOf", { listed: form.listed, expected: r.guestsExpected })}
                  </Td>
                  <Td>{r.idOnFile ? t("idOnFile") : <span className="text-muted">—</span>}</Td>
                  <Td>
                    <BalanceChip
                      balance={balance}
                      currency={r.currency}
                      otaName={r.otaName}
                      t={tr}
                    />
                  </Td>
                  <Td>
                    {r.codeMasked ? (
                      r.codeDelivery === "delivered" ? (
                        <Chip color="success">{t("code.sent")}</Chip>
                      ) : (
                        <Chip color="success">
                          {t("code.ready", {
                            when: `${dayMonth(r.codeValidFrom!, locale)} ${r.codeValidFrom!.slice(11, 16)}`,
                          })}
                        </Chip>
                      )
                    ) : (
                      <Chip color="warning">{t("code.notIssued")}</Chip>
                    )}
                  </Td>
                </Tr>
              );
            })}
          </TBody>
        </Table>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title={t("fill.title")} description={t("fill.lead")}>
          <ul className="flex flex-col divide-y divide-border text-sm">
            {(
              [
                ["names", "required"],
                ["arrival", "optional"],
                ["preferences", "optional"],
                ["id", "notAsked"],
              ] as const
            ).map(([k, s]) => (
              <li key={k} className="flex items-center justify-between gap-3 py-3">
                <span>
                  {t(`fill.${k}`)}
                  <span className="block text-xs text-muted">{t(`fill.${k}Hint`)}</span>
                </span>
                <Chip color={s === "required" ? "dark" : "default"} size="sm">
                  {t(`fill.${s}`)}
                </Chip>
              </li>
            ))}
          </ul>
        </Card>
        <Card title={t("rules.title")} description={t("rules.lead")}>
          <dl className="flex flex-col gap-3 text-sm">
            <div>
              <dt className="font-semibold">{t("rules.code")}</dt>
              <dd className="text-muted">{t("rules.codeValue")}</dd>
            </div>
            <div>
              <dt className="font-semibold">{t("rules.remind")}</dt>
              <dd className="text-muted">
                {b.remindersScheduled.length > 0 || b.remindable.length > 0
                  ? t("rules.remindValue")
                  : t("rules.remindNone")}{" "}
                <Link
                  href="/inbox/automation"
                  className="font-semibold text-accent hover:underline"
                >
                  {t("rules.automation")}
                </Link>
              </dd>
            </div>
            <div>
              <dt className="font-semibold">{t("rules.export")}</dt>
              <dd className="text-muted">{t("rules.exportValue")}</dd>
            </div>
          </dl>
        </Card>
      </div>
    </div>
  );
}
