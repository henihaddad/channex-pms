import type { FolioView } from "@pms/db";
import { Button, Checkbox, DateInput, Input, Select, TBody, Table, Td, Tr } from "@/components/ui";
import { day, money } from "@/lib/format";
import {
  addChargeAction,
  addPaymentAction,
  issueInvoiceAction,
  settlePaymentAction,
  splitFolioAction,
} from "../reservations.actions";

type T = (key: string, values?: Record<string, string | number>) => string;

/**
 * Folio operations (spec 08 §8.9) behind "Record payment" on the Money card: lines and
 * payments, add a charge or a payment, deposits, refunds with a reason, invoices, split.
 */
export function FolioOperations({
  folios,
  bookingId,
  propertyId,
  arrivalDate,
  locale,
  t,
}: {
  folios: FolioView[];
  bookingId: string;
  propertyId: string;
  arrivalDate: string;
  locale: string;
  t: T;
}) {
  const ids = (folioId?: string) => (
    <>
      <input type="hidden" name="bookingId" value={bookingId} />
      <input type="hidden" name="propertyId" value={propertyId} />
      {folioId ? <input type="hidden" name="folioId" value={folioId} /> : null}
    </>
  );
  return (
    <div className="flex flex-col gap-5">
      {folios.map((f) => (
        <div key={f.id} className="flex flex-col gap-3 text-sm" data-testid="folio">
          <div className="flex items-center justify-between">
            <p className="font-semibold">{t("folio.title", { label: f.label })}</p>
            <p
              className={
                f.balance.balanceMinor > 0 ? "text-warning" : "text-success-soft-foreground"
              }
            >
              {t("balance")} {money(f.balance.balanceMinor, f.currency, locale)}
              {f.balance.heldMinor
                ? ` · ${t("folio.held", { amount: money(f.balance.heldMinor, f.currency, locale) })}`
                : ""}
            </p>
          </div>
          {f.lines.length + f.payments.length > 0 ? (
            <Table dense>
              <TBody>
                {f.lines.map((l) => (
                  <Tr key={l.id}>
                    <Td className="whitespace-nowrap text-muted">{day(l.date, locale)}</Td>
                    <Td>
                      {l.description}
                      <span className="block text-xs text-muted">{t(`folio.kinds.${l.kind}`)}</span>
                    </Td>
                    <Td className="text-end tabular-nums">
                      {money(l.amountMinor, f.currency, locale)}
                    </Td>
                    <Td className="text-end text-xs text-muted">
                      {l.invoiceId ? t("folio.invoiced") : ""}
                    </Td>
                  </Tr>
                ))}
                {f.payments.map((p) => (
                  <Tr key={p.id}>
                    <Td className="whitespace-nowrap text-muted">{day(p.receivedAt, locale)}</Td>
                    <Td>
                      {t(`folio.methods.${p.method}`)}
                      <span className="block text-xs text-muted">
                        {t(`folio.states.${p.state}`)}
                        {p.reason ? ` · ${p.reason}` : ""}
                      </span>
                    </Td>
                    <Td className="text-end text-success-soft-foreground tabular-nums">
                      −{money(p.amountMinor, f.currency, locale)}
                    </Td>
                    <Td className="text-end">
                      {p.state === "held" || p.state === "captured" ? (
                        <form
                          action={settlePaymentAction}
                          className="inline-flex items-center gap-1"
                        >
                          {ids()}
                          <input type="hidden" name="paymentId" value={p.id} />
                          <Input
                            name="reason"
                            placeholder={t("folio.reason")}
                            aria-label={t("folio.reason")}
                            className="h-8 w-28 text-xs"
                          />
                          {p.state === "held" ? (
                            <>
                              <Button
                                type="submit"
                                name="state"
                                value="captured"
                                size="sm"
                                variant="ghost"
                              >
                                {t("folio.capture")}
                              </Button>
                              <Button
                                type="submit"
                                name="state"
                                value="released"
                                size="sm"
                                variant="ghost"
                              >
                                {t("folio.release")}
                              </Button>
                            </>
                          ) : (
                            <Button
                              type="submit"
                              name="state"
                              value="refunded"
                              size="sm"
                              variant="danger"
                            >
                              {t("folio.refund")}
                            </Button>
                          )}
                        </form>
                      ) : null}
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          ) : null}
          {f.invoices.length > 0 ? (
            <p className="text-xs text-muted">
              {f.invoices
                .map((i) => `${i.number} · ${money(i.totalMinor, f.currency, locale)}`)
                .join(" · ")}
            </p>
          ) : null}
          <form action={addChargeAction} className="flex flex-wrap items-end gap-2">
            {ids(f.id)}
            <Select name="kind" aria-label={t("folio.kind")} className="w-36" size="sm">
              {["extra", "cleaning_fee", "tourist_tax", "damage", "adjustment"].map((k) => (
                <option key={k} value={k}>
                  {t(`folio.kinds.${k}`)}
                </option>
              ))}
            </Select>
            <Input
              name="description"
              placeholder={t("folio.description")}
              aria-label={t("folio.description")}
              className="w-44"
            />
            <DateInput name="date" defaultValue={arrivalDate} className="w-40" />
            <Input
              name="amount"
              type="number"
              step="0.01"
              placeholder="0.00"
              aria-label={t("folio.amount")}
              className="w-28"
            />
            <Button type="submit" variant="secondary" size="sm">
              {t("addCharge")}
            </Button>
          </form>
          <form action={addPaymentAction} className="flex flex-wrap items-end gap-2">
            {ids(f.id)}
            <Select name="method" aria-label={t("folio.method")} className="w-40" size="sm">
              {["card", "cash", "bank_transfer", "ota_collected", "virtual_card"].map((m) => (
                <option key={m} value={m}>
                  {t(`folio.methods.${m}`)}
                </option>
              ))}
            </Select>
            <Input
              name="amount"
              type="number"
              step="0.01"
              placeholder="0.00"
              aria-label={t("folio.amount")}
              className="w-28"
              data-testid="payment-amount"
            />
            <Checkbox name="hold">{t("folio.depositHold")}</Checkbox>
            <Button type="submit" variant="primary" size="sm">
              {t("addPayment")}
            </Button>
          </form>
          <div className="flex flex-wrap items-end gap-2">
            <form action={issueInvoiceAction}>
              {ids(f.id)}
              <Button type="submit" variant="secondary" data-testid="issue-invoice" size="sm">
                {t("issueInvoice")}
              </Button>
            </form>
            {f.lines.some((l) => !l.invoiceId) ? (
              <form action={splitFolioAction} className="flex flex-wrap items-center gap-2">
                {ids()}
                <Input
                  name="label"
                  placeholder={t("folio.splitLabel")}
                  aria-label={t("folio.splitLabel")}
                  className="h-8 w-32 text-xs"
                />
                {f.lines
                  .filter((l) => !l.invoiceId)
                  .map((l) => (
                    <Checkbox key={l.id} name="lineId" value={l.id}>
                      {l.description.slice(0, 16)}
                    </Checkbox>
                  ))}
                <Button type="submit" variant="ghost" size="sm">
                  {t("split")}
                </Button>
              </form>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}
