import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { asSystem } from "@pms/db";
import { guestPortal } from "@pms/jobs";
import { container } from "@/server/container";
import { money } from "@/server/booking-engine";
import { currentGuest } from "@/server/guest-session";
import { Button, Card, Input, Label, TBody, Table, Td, Textarea, Tr } from "@/components/ui";
import {
  addExtraAction,
  cancelBookingAction,
  savePreCheckinAction,
  sendGuestMessageAction,
} from "./guest.actions";

/** The guest portal (spec 10 §10.6): the stay, the code at the window, pre-check-in, extras, messages, cancellation. */
export default async function GuestPortalPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const sp = await searchParams;
  if (sp.token) redirect(`/api/v1/guest/enter?token=${encodeURIComponent(sp.token)}`);
  const t = await getTranslations("guest");
  const guest = await currentGuest();
  if (!guest)
    return (
      <Card>
        <h1 className="text-xl font-bold">{t("title")}</h1>
        <p className="mt-2 text-sm text-muted" data-testid="guest-link-required">
          {sp.error ? t("linkInvalid") : t("linkRequired")}
        </p>
      </Card>
    );
  const c = await container();
  const p = await asSystem(c.db.db, guest.orgId, (tx) =>
    guestPortal(c, tx, guest.orgId, guest.bookingId),
  );
  if (!p) redirect("/guest?error=invalid");
  const cur = p.currency;
  return (
    <div className="space-y-4" data-testid="guest-stay" data-status={p.status}>
      <header>
        <h1 className="text-2xl font-bold">{p.property.title}</h1>
        <p className="text-sm text-muted">
          {p.arrivalDate} → {p.departureDate} · {t("nights", { count: p.nights })} ·{" "}
          {t("reference")} <strong>{p.reference}</strong> · {t("status")}: {p.status}
        </p>
        <p className="text-xs text-muted">
          {Object.values(p.property.address).filter(Boolean).join(", ")} · {p.property.checkInTime}{" "}
          / {p.property.checkOutTime}
        </p>
      </header>
      {p.status === "cancelled" ? (
        <Card>
          <p data-testid="guest-cancelled">{t("cancelled")}</p>
        </Card>
      ) : null}
      <Card data-testid="guest-access" data-state={p.access.state} title={t("access")}>
        {p.access.state === "revealed" ? (
          <p className="mt-1 text-sm">
            {t("accessCode")}:{" "}
            <code className="rounded bg-background px-2 py-0.5 text-lg" data-testid="door-code">
              {p.access.code}
            </code>
            <span className="ms-2 text-xs text-muted">
              {t("accessValid", { from: p.access.validFrom, to: p.access.validTo })}
            </span>
          </p>
        ) : p.access.state === "hidden" ? (
          <p className="mt-1 text-sm text-muted">
            {t("accessHidden", { time: p.access.opensAt.slice(0, 16).replace("T", " ") + " UTC" })}
          </p>
        ) : null}
        {p.property.houseManual ? (
          <details className="mt-2 text-sm">
            <summary>{t("houseManual")}</summary>
            <p className="mt-1 whitespace-pre-wrap">{p.property.houseManual}</p>
          </details>
        ) : null}
      </Card>
      {p.status !== "cancelled" ? (
        <Card title={t("preCheckin")}>
          {p.preCheckin.completedAt ? (
            <p className="text-xs text-success-soft-foreground" data-testid="precheckin-done">
              {t("preCheckinDone", { time: p.preCheckin.completedAt.slice(0, 16) })}
            </p>
          ) : null}
          <form action={savePreCheckinAction} className="mt-2 grid gap-2 sm:grid-cols-2">
            <div>
              <Label htmlFor="arrivalTime">{t("arrivalTime")}</Label>
              <Input
                id="arrivalTime"
                name="arrivalTime"
                type="time"
                defaultValue={p.preCheckin.arrivalTime ?? ""}
              />
            </div>
            <div>
              <Label htmlFor="preferences">{t("preferences")}</Label>
              <Input
                id="preferences"
                name="preferences"
                defaultValue={p.preCheckin.preferences ?? ""}
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="guests">{t("guests")}</Label>
              <Textarea
                id="guests"
                name="guests"
                rows={2}
                className="w-full rounded border border-border-secondary p-2 text-sm"
                defaultValue={p.preCheckin.guests.map((g) => `${g.name} ${g.surname}`).join("\n")}
              />
            </div>
            <Button type="submit" data-testid="save-precheckin">
              {t("savePreCheckin")}
            </Button>
          </form>
        </Card>
      ) : null}
      <Card title={t("folio")}>
        <Table className="mt-1" data-testid="guest-folio">
          <TBody>
            <Tr>
              <Td>Stay</Td>
              <Td className="text-end">{money(p.totalMinor, cur)}</Td>
            </Tr>
            {p.folio.lines.map((l, i) => (
              <Tr key={i} data-kind={l.kind}>
                <Td>{l.description}</Td>
                <Td className="text-end">{money(l.amountMinor, cur)}</Td>
              </Tr>
            ))}
            <Tr className="font-semibold">
              <Td>{t("balance")}</Td>
              <Td className="text-end" data-testid="guest-balance">
                {money(p.folio.balanceMinor, cur)}
              </Td>
            </Tr>
          </TBody>
        </Table>
        {p.extras.length > 0 && p.status !== "cancelled" ? (
          <div className="mt-3">
            <h3 className="text-sm font-semibold">{t("extras")}</h3>
            <ul className="mt-1 space-y-1 text-sm">
              {p.extras.map((e) => (
                <li key={e.id} className="flex items-center justify-between">
                  <span>
                    {e.name} · {money(e.priceMinor, cur)}/{e.per}
                  </span>
                  <form action={addExtraAction}>
                    <input type="hidden" name="propertyId" value={p.property.id} />
                    <input type="hidden" name="extraId" value={e.id} />
                    <Button type="submit" variant="secondary" data-testid="add-extra" size="sm">
                      {t("addExtra")}
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Card>
      <Card title={t("messages")}>
        <ul className="mt-1 space-y-1 text-sm" data-testid="guest-messages">
          {p.messages.map((m, i) => (
            <li
              key={i}
              data-direction={m.direction}
              className={m.direction === "inbound" ? "text-end" : ""}
            >
              <span className="rounded bg-background px-2 py-1">{m.body}</span>
            </li>
          ))}
        </ul>
        <form action={sendGuestMessageAction} className="mt-2 flex gap-2">
          <Input
            name="body"
            placeholder={t("messagePlaceholder")}
            required
            aria-label={t("messages")}
          />
          <Button type="submit" data-testid="send-guest-message">
            {t("send")}
          </Button>
        </form>
      </Card>
      {p.status !== "cancelled" ? (
        <Card title={t("cancel")}>
          {p.cancellation.allowed ? (
            <form action={cancelBookingAction} className="mt-1 text-sm">
              <p>
                {p.cancellation.feeNowMinor > 0
                  ? t("cancelFee", { fee: money(p.cancellation.feeNowMinor, cur) })
                  : t("cancelFree")}
              </p>
              <Button
                type="submit"
                variant="secondary"
                className="mt-2"
                data-testid="cancel-booking"
              >
                {t("cancelConfirm")}
              </Button>
            </form>
          ) : (
            <p className="mt-1 text-sm text-muted">{t("cancelNotAllowed")}</p>
          )}
        </Card>
      ) : null}
    </div>
  );
}
