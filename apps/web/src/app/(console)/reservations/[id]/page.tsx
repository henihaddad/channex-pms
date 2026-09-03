import Link from "next/link";
import { getTranslations } from "next-intl/server";
import {
  Button,
  Card,
  Chip,
  DateInput,
  Field,
  Input,
  Label,
  PageTitle,
  Select,
  TBody,
  Table,
  Td,
  Tr,
} from "@/components/ui";
import { guard } from "@/server/guard";
import {
  acknowledgeAction,
  addChargeAction,
  addNoteAction,
  addPaymentAction,
  assignUnitAction,
  autoAssignAction,
  cancelDirectBookingAction,
  issueInvoiceAction,
  loadReservation,
  revokeCredentialAction,
  settlePaymentAction,
  splitFolioAction,
  stayStateAction,
} from "../reservations.actions";
import { CredentialPanel, GuestPanel, InstrumentPanel } from "./panels";

const money = (minor: number, currency: string) =>
  new Intl.NumberFormat(undefined, { style: "currency", currency }).format(minor / 100);

export default async function ReservationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getTranslations("reservations");
  const v = await guard(() => loadReservation(id));
  const d = v.detail;
  const direct = ["direct", "staff", "phone", "walk_in"].includes(d.otaName ?? "");
  const isSingle = d.propertyKind === "single_unit";
  return (
    <div className="space-y-6" data-testid="reservation-detail" data-status={d.status}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <PageTitle>
            {d.rooms[0]?.guestNames[0]
              ? `${d.rooms[0].guestNames[0].name} ${d.rooms[0].guestNames[0].surname}`
              : d.otaReservationCode}
          </PageTitle>
          <p className="text-sm text-muted">
            {d.propertyTitle} · {d.otaName ?? "—"} {d.otaReservationCode} · {d.arrivalDate} →{" "}
            {d.departureDate} · {money(d.totalAmountMinor, d.currency)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span
            className={`rounded px-2 py-0.5 text-xs ${d.status === "cancelled" ? "bg-background" : "bg-success-soft text-success-soft-foreground"}`}
          >
            {d.status}
          </span>
          {d.unacknowledged && d.lastRevisionId ? (
            <form action={acknowledgeAction}>
              <input type="hidden" name="bookingId" value={d.id} />
              <input type="hidden" name="propertyId" value={d.propertyId} />
              <input type="hidden" name="revisionId" value={d.lastRevisionId} />
              <Button type="submit" variant="secondary" data-testid="acknowledge" size="sm">
                {t("acknowledgeChange")}
              </Button>
            </form>
          ) : null}
          {direct && d.status !== "cancelled" ? (
            <form action={cancelDirectBookingAction}>
              <input type="hidden" name="bookingId" value={d.id} />
              <input type="hidden" name="propertyId" value={d.propertyId} />
              <Button type="submit" variant="danger" size="sm" aria-label={t("cancelSideEffects")}>
                {t("cancel")}
              </Button>
            </form>
          ) : (
            <span className="text-xs text-muted" title="OTA bookings are modified at the OTA">
              {t("modifiedAtOta")}
            </span>
          )}
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card title={t("stay")}>
          {d.rooms.map((r) => (
            <div key={r.id} className="border-t border-border py-2 text-sm" data-testid="stay-room">
              <p>
                {r.roomTypeTitle ?? <span className="text-danger">unmapped room</span>} ·{" "}
                {r.ratePlanTitle ?? "—"} · {r.occupancy.adults} adults, {r.occupancy.children}{" "}
                children{r.occupancy.ages?.length ? ` (ages ${r.occupancy.ages.join(", ")})` : ""}
              </p>
              <p className="text-xs text-muted">
                {r.days
                  .map((x) => `${x.date.slice(5)} ${money(x.amountMinor, d.currency)}`)
                  .join(" · ")}
              </p>
              {!isSingle ? (
                <form action={assignUnitAction} className="mt-1 flex items-center gap-2">
                  <input type="hidden" name="bookingId" value={d.id} />
                  <input type="hidden" name="propertyId" value={d.propertyId} />
                  <input type="hidden" name="bookingRoomId" value={r.id} />
                  <Select
                    name="unitId"
                    defaultValue={r.assignedUnitId ?? ""}
                    className="max-w-xs"
                    size="sm"
                  >
                    <option value="">{t("unassigned")}</option>
                    {v.units
                      .filter((u) => u.roomTypeId === r.roomTypeId)
                      .map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name} · {u.status}
                        </option>
                      ))}
                  </Select>
                  <Button type="submit" variant="secondary" size="sm">
                    {t("assign")}
                  </Button>
                </form>
              ) : (
                <p className="text-xs text-muted">{t("singleUnitNoAssign")}</p>
              )}
              <div className="mt-1 flex items-center gap-2 text-xs">
                <span className="rounded bg-background px-1.5">{r.stayState}</span>
                {r.stayState === "expected" ? (
                  <>
                    <form action={stayStateAction}>
                      <input type="hidden" name="bookingId" value={d.id} />
                      <input type="hidden" name="propertyId" value={d.propertyId} />
                      <input type="hidden" name="bookingRoomId" value={r.id} />
                      <input type="hidden" name="state" value="checked_in" />
                      <button className="underline" data-testid="check-in">
                        {t("checkIn")}
                      </button>
                    </form>
                    <form action={stayStateAction}>
                      <input type="hidden" name="bookingId" value={d.id} />
                      <input type="hidden" name="propertyId" value={d.propertyId} />
                      <input type="hidden" name="bookingRoomId" value={r.id} />
                      <input type="hidden" name="state" value="no_show" />
                      <input type="hidden" name="reason" value="did not arrive" />
                      <button className="underline text-danger">{t("noShow")}</button>
                    </form>
                  </>
                ) : null}
                {r.stayState === "checked_in" ? (
                  <form action={stayStateAction}>
                    <input type="hidden" name="bookingId" value={d.id} />
                    <input type="hidden" name="propertyId" value={d.propertyId} />
                    <input type="hidden" name="bookingRoomId" value={r.id} />
                    <input type="hidden" name="state" value="checked_out" />
                    <button className="underline" data-testid="check-out">
                      {t("checkOut")}
                    </button>
                  </form>
                ) : null}
              </div>
            </div>
          ))}
          {!isSingle && d.status !== "cancelled" ? (
            <form action={autoAssignAction} className="mt-2">
              <input type="hidden" name="bookingId" value={d.id} />
              <input type="hidden" name="propertyId" value={d.propertyId} />
              <Button type="submit" variant="secondary" size="sm">
                {t("autoAssign")}
              </Button>
            </form>
          ) : null}
        </Card>
        <Card title={t("access")}>
          <CredentialPanel
            bookingId={d.id}
            propertyId={d.propertyId}
            credentials={v.credentials}
            status={d.status}
            labels={{ issue: t("issueCode"), reveal: t("reveal"), revoke: t("revoke") }}
          />
          <ul className="mt-2 text-xs text-muted">
            {v.credentials.map((c) => (
              <li key={c.id} className="flex items-center gap-2">
                <span className="font-mono">{c.valueMasked}</span> · {c.type} ·{" "}
                {c.validFrom.slice(0, 16)} → {c.validTo.slice(0, 16)} · {c.deliveryState}
                <form action={revokeCredentialAction}>
                  <input type="hidden" name="bookingId" value={d.id} />
                  <input type="hidden" name="propertyId" value={d.propertyId} />
                  <input type="hidden" name="credentialId" value={c.id} />
                  <button className="text-danger underline">{t("revoke")}</button>
                </form>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card title={t("guest")}>
          <GuestPanel bookingId={d.id} guest={d.guest} label={t("revealPii")} />
        </Card>
        <Card title={t("financials")}>
          <dl className="grid grid-cols-2 gap-1 text-sm">
            <dt>{t("roomRevenue")}</dt>
            <dd className="text-end">{money(d.financials.roomRevenueMinor, d.currency)}</dd>
            <dt>{t("extras")}</dt>
            <dd className="text-end">{money(d.financials.extrasMinor, d.currency)}</dd>
            <dt>{t("taxes")}</dt>
            <dd className="text-end">{money(d.financials.taxesMinor, d.currency)}</dd>
            <dt>{t("withheldTaxes")}</dt>
            <dd className="text-end">{money(d.financials.withheldTaxesMinor, d.currency)}</dd>
            <dt>{t("otaCommission")}</dt>
            <dd className="text-end">{money(d.financials.otaCommissionMinor, d.currency)}</dd>
            <dt className="font-semibold">{t("expectedPayout")}</dt>
            <dd className="text-end font-semibold">
              {money(
                d.totalAmountMinor -
                  d.financials.withheldTaxesMinor -
                  d.financials.otaCommissionMinor,
                d.currency,
              )}
            </dd>
          </dl>
          <InstrumentPanel
            bookingId={d.id}
            count={d.instruments.length}
            label={t("revealInstrument")}
          />
        </Card>
      </div>

      <Card title={t("folios")}>
        {v.folios.map((f) => (
          <div key={f.id} className="mb-4 border-t border-border pt-2 text-sm" data-testid="folio">
            <div className="flex items-center justify-between">
              <p className="font-medium">
                {f.label} · {f.currency}
              </p>
              <p
                className={
                  f.balance.balanceMinor > 0 ? "text-danger" : "text-success-soft-foreground"
                }
              >
                {t("balance")} {money(f.balance.balanceMinor, f.currency)}
                {f.balance.heldMinor ? ` · held ${money(f.balance.heldMinor, f.currency)}` : ""}
              </p>
            </div>
            <Table className="mt-1">
              <TBody>
                {f.lines.map((l) => (
                  <Tr key={l.id}>
                    <Td>{l.date}</Td>
                    <Td>{l.kind}</Td>
                    <Td>{l.description}</Td>
                    <Td className="text-end">{money(l.amountMinor, f.currency)}</Td>
                    <Td className="text-end">{l.invoiceId ? "invoiced" : ""}</Td>
                  </Tr>
                ))}
                {f.payments.map((p) => (
                  <Tr key={p.id} className="text-success-soft-foreground">
                    <Td>{p.receivedAt.slice(0, 10)}</Td>
                    <Td>{p.method}</Td>
                    <Td>
                      {p.state}
                      {p.reason ? ` · ${p.reason}` : ""}
                    </Td>
                    <Td className="text-end">−{money(p.amountMinor, f.currency)}</Td>
                    <Td className="text-end">
                      {p.state === "held" ? (
                        <form action={settlePaymentAction} className="inline-flex gap-1">
                          <input type="hidden" name="bookingId" value={d.id} />
                          <input type="hidden" name="propertyId" value={d.propertyId} />
                          <input type="hidden" name="paymentId" value={p.id} />
                          <Input name="reason" placeholder="reason" className="h-6 w-28" />
                          <button name="state" value="captured" className="underline">
                            capture
                          </button>
                          <button name="state" value="released" className="underline">
                            release
                          </button>
                        </form>
                      ) : p.state === "captured" ? (
                        <form action={settlePaymentAction} className="inline-flex gap-1">
                          <input type="hidden" name="bookingId" value={d.id} />
                          <input type="hidden" name="propertyId" value={d.propertyId} />
                          <input type="hidden" name="paymentId" value={p.id} />
                          <Input name="reason" placeholder="reason" className="h-6 w-28" />
                          <button name="state" value="refunded" className="underline text-danger">
                            refund
                          </button>
                        </form>
                      ) : null}
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
            <p className="mt-1 text-xs text-muted">
              {f.invoices
                .map((i) => `${i.kind} ${i.number} ${money(i.totalMinor, f.currency)}`)
                .join(" · ")}
            </p>
            <div className="mt-2 flex flex-wrap items-end gap-2 text-xs">
              <form action={addChargeAction} className="flex items-end gap-1">
                <input type="hidden" name="bookingId" value={d.id} />
                <input type="hidden" name="propertyId" value={d.propertyId} />
                <input type="hidden" name="folioId" value={f.id} />
                <Select name="kind" className="w-32" size="sm">
                  <option value="extra">extra</option>
                  <option value="cleaning_fee">cleaning fee</option>
                  <option value="tourist_tax">tourist tax</option>
                  <option value="damage">damage</option>
                  <option value="adjustment">adjustment</option>
                </Select>
                <Input name="description" placeholder="description" className="w-40" />
                <DateInput name="date" defaultValue={d.arrivalDate} className="w-36" />
                <Input
                  name="amount"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  className="w-24"
                />
                <Button type="submit" variant="secondary" size="sm">
                  {t("addCharge")}
                </Button>
              </form>
              <form action={addPaymentAction} className="flex items-end gap-1">
                <input type="hidden" name="bookingId" value={d.id} />
                <input type="hidden" name="propertyId" value={d.propertyId} />
                <input type="hidden" name="folioId" value={f.id} />
                <Select name="method" className="w-32" size="sm">
                  <option value="card">card</option>
                  <option value="cash">cash</option>
                  <option value="bank_transfer">bank transfer</option>
                  <option value="ota_collected">OTA collected</option>
                  <option value="virtual_card">virtual card</option>
                </Select>
                <Input
                  name="amount"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  className="w-24"
                />
                <Label>
                  <input type="checkbox" name="hold" />
                  deposit hold
                </Label>
                <Button type="submit" variant="secondary" size="sm">
                  {t("addPayment")}
                </Button>
              </form>
              <form action={issueInvoiceAction}>
                <input type="hidden" name="bookingId" value={d.id} />
                <input type="hidden" name="propertyId" value={d.propertyId} />
                <input type="hidden" name="folioId" value={f.id} />
                <Button type="submit" variant="secondary" data-testid="issue-invoice" size="sm">
                  {t("issueInvoice")}
                </Button>
              </form>
              <form action={splitFolioAction} className="flex items-end gap-1">
                <input type="hidden" name="bookingId" value={d.id} />
                <input type="hidden" name="propertyId" value={d.propertyId} />
                <Input name="label" placeholder="Split label" className="w-28" />
                {f.lines
                  .filter((l) => !l.invoiceId)
                  .map((l) => (
                    <Label key={l.id}>
                      <input type="checkbox" name="lineId" value={l.id} />
                      {l.description.slice(0, 12)}
                    </Label>
                  ))}
                <Button type="submit" variant="secondary" size="sm">
                  {t("split")}
                </Button>
              </form>
            </div>
          </div>
        ))}
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card title={t("operations")}>
          {v.tasks.length === 0 ? <p className="text-sm text-muted">—</p> : null}
          <ul className="text-sm">
            {v.tasks.map((x) => (
              <li key={x.id} className="border-t border-border py-1">
                <Link href={`/operations?date=${x.date}`} className="hover:underline">
                  {x.date} · {x.type}
                  {x.isSameDay ? " · same-day" : ""}
                </Link>{" "}
                <span className="text-xs text-muted">
                  {x.windowFrom}–{x.windowTo} · {x.state} · {x.assigneeName ?? t("unassigned")}
                </span>
              </li>
            ))}
          </ul>
        </Card>
        <Card title={t("timeline")}>
          <ol className="text-sm" data-testid="timeline">
            {d.revisions.map((r) => (
              <li key={r.id} className="border-t border-border py-1">
                <span className="text-xs text-muted">
                  {r.insertedAt.slice(0, 16)} · {r.revisionType} · {r.systemId.slice(0, 12)}
                </span>
                <br />
                {r.timelineText}
                {!r.acknowledged && r.revisionType === "modified" ? (
                  <Chip color="warning" size="sm" className="ms-2">
                    {t("unacknowledged")}
                  </Chip>
                ) : null}
              </li>
            ))}
          </ol>
        </Card>
      </div>

      <Card title={t("notes")}>
        <ul className="mb-2 text-sm">
          {v.notes.map((n) => (
            <li key={n.id} className="border-t border-border py-1">
              {n.pinned ? "📌 " : ""}
              {n.body} <span className="text-xs text-muted">{n.createdAt.slice(0, 16)}</span>
            </li>
          ))}
        </ul>
        <form action={addNoteAction} className="flex items-end gap-2">
          <input type="hidden" name="bookingId" value={d.id} />
          <input type="hidden" name="propertyId" value={d.propertyId} />
          <div className="flex-1">
            <Field label={t("addNote")} name="body" />
          </div>
          <Label>
            <input type="checkbox" name="pinned" /> pin
          </Label>
          <Button type="submit" variant="secondary">
            {t("save")}
          </Button>
        </form>
      </Card>
    </div>
  );
}
