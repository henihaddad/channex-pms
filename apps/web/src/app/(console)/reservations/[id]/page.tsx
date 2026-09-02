import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Button, Card, Field, Input, PageTitle, Select } from "@/components/ui";
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
          <p className="text-sm text-slate-600">
            {d.propertyTitle} · {d.otaName ?? "—"} {d.otaReservationCode} · {d.arrivalDate} →{" "}
            {d.departureDate} · {money(d.totalAmountMinor, d.currency)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span
            className={`rounded px-2 py-0.5 text-xs ${d.status === "cancelled" ? "bg-slate-100" : "bg-emerald-100 text-emerald-800"}`}
          >
            {d.status}
          </span>
          {d.unacknowledged && d.lastRevisionId ? (
            <form action={acknowledgeAction}>
              <input type="hidden" name="bookingId" value={d.id} />
              <input type="hidden" name="propertyId" value={d.propertyId} />
              <input type="hidden" name="revisionId" value={d.lastRevisionId} />
              <Button type="submit" variant="secondary" className="h-8" data-testid="acknowledge">
                {t("acknowledgeChange")}
              </Button>
            </form>
          ) : null}
          {direct && d.status !== "cancelled" ? (
            <form action={cancelDirectBookingAction}>
              <input type="hidden" name="bookingId" value={d.id} />
              <input type="hidden" name="propertyId" value={d.propertyId} />
              <Button type="submit" variant="danger" className="h-8" title={t("cancelSideEffects")}>
                {t("cancel")}
              </Button>
            </form>
          ) : (
            <span className="text-xs text-slate-500" title="OTA bookings are modified at the OTA">
              {t("modifiedAtOta")}
            </span>
          )}
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <h2 className="mb-2 font-semibold">{t("stay")}</h2>
          {d.rooms.map((r) => (
            <div
              key={r.id}
              className="border-t border-slate-100 py-2 text-sm"
              data-testid="stay-room"
            >
              <p>
                {r.roomTypeTitle ?? <span className="text-rose-700">unmapped room</span>} ·{" "}
                {r.ratePlanTitle ?? "—"} · {r.occupancy.adults} adults, {r.occupancy.children}{" "}
                children{r.occupancy.ages?.length ? ` (ages ${r.occupancy.ages.join(", ")})` : ""}
              </p>
              <p className="text-xs text-slate-500">
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
                    className="h-8 max-w-xs"
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
                  <Button type="submit" variant="secondary" className="h-8">
                    {t("assign")}
                  </Button>
                </form>
              ) : (
                <p className="text-xs text-slate-500">{t("singleUnitNoAssign")}</p>
              )}
              <div className="mt-1 flex items-center gap-2 text-xs">
                <span className="rounded bg-slate-100 px-1.5">{r.stayState}</span>
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
                      <button className="underline text-rose-700">{t("noShow")}</button>
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
              <Button type="submit" variant="secondary" className="h-8">
                {t("autoAssign")}
              </Button>
            </form>
          ) : null}
        </Card>
        <Card>
          <h2 className="mb-2 font-semibold">{t("access")}</h2>
          <CredentialPanel
            bookingId={d.id}
            propertyId={d.propertyId}
            credentials={v.credentials}
            status={d.status}
            labels={{ issue: t("issueCode"), reveal: t("reveal"), revoke: t("revoke") }}
          />
          <ul className="mt-2 text-xs text-slate-600">
            {v.credentials.map((c) => (
              <li key={c.id} className="flex items-center gap-2">
                <span className="font-mono">{c.valueMasked}</span> · {c.type} ·{" "}
                {c.validFrom.slice(0, 16)} → {c.validTo.slice(0, 16)} · {c.deliveryState}
                <form action={revokeCredentialAction}>
                  <input type="hidden" name="bookingId" value={d.id} />
                  <input type="hidden" name="propertyId" value={d.propertyId} />
                  <input type="hidden" name="credentialId" value={c.id} />
                  <button className="text-rose-700 underline">{t("revoke")}</button>
                </form>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <h2 className="mb-2 font-semibold">{t("guest")}</h2>
          <GuestPanel bookingId={d.id} guest={d.guest} label={t("revealPii")} />
        </Card>
        <Card>
          <h2 className="mb-2 font-semibold">{t("financials")}</h2>
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

      <Card>
        <h2 className="mb-2 font-semibold">{t("folios")}</h2>
        {v.folios.map((f) => (
          <div
            key={f.id}
            className="mb-4 border-t border-slate-100 pt-2 text-sm"
            data-testid="folio"
          >
            <div className="flex items-center justify-between">
              <p className="font-medium">
                {f.label} · {f.currency}
              </p>
              <p className={f.balance.balanceMinor > 0 ? "text-rose-700" : "text-emerald-700"}>
                {t("balance")} {money(f.balance.balanceMinor, f.currency)}
                {f.balance.heldMinor ? ` · held ${money(f.balance.heldMinor, f.currency)}` : ""}
              </p>
            </div>
            <table className="mt-1 w-full text-xs">
              <tbody>
                {f.lines.map((l) => (
                  <tr key={l.id} className="border-t border-slate-50">
                    <td className="py-0.5">{l.date}</td>
                    <td>{l.kind}</td>
                    <td>{l.description}</td>
                    <td className="text-end">{money(l.amountMinor, f.currency)}</td>
                    <td className="text-end text-slate-400">{l.invoiceId ? "invoiced" : ""}</td>
                  </tr>
                ))}
                {f.payments.map((p) => (
                  <tr key={p.id} className="border-t border-slate-50 text-emerald-800">
                    <td className="py-0.5">{p.receivedAt.slice(0, 10)}</td>
                    <td>{p.method}</td>
                    <td>
                      {p.state}
                      {p.reason ? ` · ${p.reason}` : ""}
                    </td>
                    <td className="text-end">−{money(p.amountMinor, f.currency)}</td>
                    <td className="text-end">
                      {p.state === "held" ? (
                        <form action={settlePaymentAction} className="inline-flex gap-1">
                          <input type="hidden" name="bookingId" value={d.id} />
                          <input type="hidden" name="propertyId" value={d.propertyId} />
                          <input type="hidden" name="paymentId" value={p.id} />
                          <Input name="reason" placeholder="reason" className="h-6 w-28 text-xs" />
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
                          <Input name="reason" placeholder="reason" className="h-6 w-28 text-xs" />
                          <button name="state" value="refunded" className="underline text-rose-700">
                            refund
                          </button>
                        </form>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-1 text-xs text-slate-500">
              {f.invoices
                .map((i) => `${i.kind} ${i.number} ${money(i.totalMinor, f.currency)}`)
                .join(" · ")}
            </p>
            <div className="mt-2 flex flex-wrap items-end gap-2 text-xs">
              <form action={addChargeAction} className="flex items-end gap-1">
                <input type="hidden" name="bookingId" value={d.id} />
                <input type="hidden" name="propertyId" value={d.propertyId} />
                <input type="hidden" name="folioId" value={f.id} />
                <Select name="kind" className="h-8 w-32">
                  <option value="extra">extra</option>
                  <option value="cleaning_fee">cleaning fee</option>
                  <option value="tourist_tax">tourist tax</option>
                  <option value="damage">damage</option>
                  <option value="adjustment">adjustment</option>
                </Select>
                <Input name="description" placeholder="description" className="h-8 w-40" />
                <Input name="date" type="date" defaultValue={d.arrivalDate} className="h-8 w-36" />
                <Input
                  name="amount"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  className="h-8 w-24"
                />
                <Button type="submit" variant="secondary" className="h-8">
                  {t("addCharge")}
                </Button>
              </form>
              <form action={addPaymentAction} className="flex items-end gap-1">
                <input type="hidden" name="bookingId" value={d.id} />
                <input type="hidden" name="propertyId" value={d.propertyId} />
                <input type="hidden" name="folioId" value={f.id} />
                <Select name="method" className="h-8 w-32">
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
                  className="h-8 w-24"
                />
                <label className="flex items-center gap-1">
                  <input type="checkbox" name="hold" />
                  deposit hold
                </label>
                <Button type="submit" variant="secondary" className="h-8">
                  {t("addPayment")}
                </Button>
              </form>
              <form action={issueInvoiceAction}>
                <input type="hidden" name="bookingId" value={d.id} />
                <input type="hidden" name="propertyId" value={d.propertyId} />
                <input type="hidden" name="folioId" value={f.id} />
                <Button
                  type="submit"
                  variant="secondary"
                  className="h-8"
                  data-testid="issue-invoice"
                >
                  {t("issueInvoice")}
                </Button>
              </form>
              <form action={splitFolioAction} className="flex items-end gap-1">
                <input type="hidden" name="bookingId" value={d.id} />
                <input type="hidden" name="propertyId" value={d.propertyId} />
                <Input name="label" placeholder="Split label" className="h-8 w-28" />
                {f.lines
                  .filter((l) => !l.invoiceId)
                  .map((l) => (
                    <label key={l.id} className="flex items-center gap-1">
                      <input type="checkbox" name="lineId" value={l.id} />
                      {l.description.slice(0, 12)}
                    </label>
                  ))}
                <Button type="submit" variant="secondary" className="h-8">
                  {t("split")}
                </Button>
              </form>
            </div>
          </div>
        ))}
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <h2 className="mb-2 font-semibold">{t("operations")}</h2>
          {v.tasks.length === 0 ? <p className="text-sm text-slate-500">—</p> : null}
          <ul className="text-sm">
            {v.tasks.map((x) => (
              <li key={x.id} className="border-t border-slate-100 py-1">
                <Link href={`/operations?date=${x.date}`} className="hover:underline">
                  {x.date} · {x.type}
                  {x.isSameDay ? " · same-day" : ""}
                </Link>{" "}
                <span className="text-xs text-slate-500">
                  {x.windowFrom}–{x.windowTo} · {x.state} · {x.assigneeName ?? t("unassigned")}
                </span>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <h2 className="mb-2 font-semibold">{t("timeline")}</h2>
          <ol className="text-sm" data-testid="timeline">
            {d.revisions.map((r) => (
              <li key={r.id} className="border-t border-slate-100 py-1">
                <span className="text-xs text-slate-500">
                  {r.insertedAt.slice(0, 16)} · {r.revisionType} · {r.systemId.slice(0, 12)}
                </span>
                <br />
                {r.timelineText}
                {!r.acknowledged && r.revisionType === "modified" ? (
                  <span className="ms-2 rounded bg-amber-100 px-1.5 text-[10px] text-amber-800">
                    {t("unacknowledged")}
                  </span>
                ) : null}
              </li>
            ))}
          </ol>
        </Card>
      </div>

      <Card>
        <h2 className="mb-2 font-semibold">{t("notes")}</h2>
        <ul className="mb-2 text-sm">
          {v.notes.map((n) => (
            <li key={n.id} className="border-t border-slate-100 py-1">
              {n.pinned ? "📌 " : ""}
              {n.body} <span className="text-xs text-slate-400">{n.createdAt.slice(0, 16)}</span>
            </li>
          ))}
        </ul>
        <form action={addNoteAction} className="flex items-end gap-2">
          <input type="hidden" name="bookingId" value={d.id} />
          <input type="hidden" name="propertyId" value={d.propertyId} />
          <div className="flex-1">
            <Field label={t("addNote")} name="body" />
          </div>
          <label className="text-xs">
            <input type="checkbox" name="pinned" /> pin
          </label>
          <Button type="submit" variant="secondary">
            {t("save")}
          </Button>
        </form>
      </Card>
    </div>
  );
}
