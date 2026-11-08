import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import {
  bookingBalance,
  checkinFormState,
  revisionEvent,
  stayStatus,
  type RevisionEvent,
} from "@pms/core";
import {
  Button,
  Card,
  Checkbox,
  Chip,
  DateInput,
  Input,
  PageHeader,
  Select,
  cn,
  buttonClasses,
} from "@/components/ui";
import { day, dayMonth, money, nightsBetween, stay } from "@/lib/format";
import { channelLook } from "@/lib/channel";
import { guard } from "@/server/guard";
import { sendReplyAction } from "../../inbox/inbox.actions";
import {
  acknowledgeAction,
  addNoteAction,
  assignUnitAction,
  autoAssignAction,
  cancelDirectBookingAction,
  changeDatesAction,
  loadBookingConversation,
  loadReservation,
  revokeCredentialAction,
  stayStateAction,
  type BookingConversation,
} from "../reservations.actions";
import { BalanceChip, StatusChip, partyWords } from "../words";
import { FolioOperations } from "./folio";
import {
  DoorCodeTile,
  GuestContact,
  InstrumentPanel,
  Kbd,
  OpenPortalButton,
  ReservationHotkeys,
} from "./panels";

const DIRECT = ["direct", "staff", "phone", "walk_in"];

/** "14–17 Nov", "30 Nov–2 Dec". */
function range(a: string, d: string, locale: string): string {
  const [da, ma] = dayMonth(a, locale).split(" ");
  const dd = dayMonth(d, locale);
  return ma && dd.endsWith(ma) ? `${da}–${dd}` : `${dayMonth(a, locale)}–${dd}`;
}

/**
 * One reservation (spec 08 §8.2, design canvas November 2026): what the stay is and its four
 * key facts up top, the money, the conversation and the rooms in the wide column; the guest,
 * the actions, a readable timeline and the turnover in the narrow one. Single keys C, D, $ and
 * O press the buttons that carry them.
 */
export default async function ReservationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getTranslations("reservations");
  const locale = await getLocale();
  const v = await guard(() => loadReservation(id));
  const d = v.detail;
  // no `message:read` (or an impersonating operator): the card is left out, the page still works
  const convo: BookingConversation | null | undefined = await loadBookingConversation(id).catch(
    () => undefined,
  );
  const ch = channelLook(d.otaName);
  const direct = DIRECT.includes(d.otaName ?? "");
  const lead = d.rooms[0]?.guestNames[0];
  const guestName = lead ? `${lead.name} ${lead.surname}`.trim() : (d.otaReservationCode ?? "—");
  const firstName = lead?.name ?? guestName;
  const ref = d.otaReservationCode ?? d.id.slice(0, 8).toUpperCase();
  const isSingle = d.propertyKind === "single_unit";
  const nights = nightsBetween(d.arrivalDate, d.departureDate);
  const adults = d.rooms.reduce((a, r) => a + r.occupancy.adults, 0);
  const children = d.rooms.reduce((a, r) => a + r.occupancy.children, 0);
  const status = stayStatus({
    status: d.status,
    mappingState: d.mappingState,
    unassignedRooms: isSingle ? 0 : d.rooms.filter((r) => !r.assignedUnitId).length,
    unacknowledged: d.unacknowledged,
    stayStates: d.rooms.map((r) => r.stayState),
  });
  const lines = v.folios.flatMap((f) => f.lines);
  const paidMinor = v.folios.reduce((a, f) => a + f.balance.paidMinor, 0);
  const balance = bookingBalance({
    status: d.status,
    paymentCollect: d.paymentCollect,
    totalMinor: d.totalAmountMinor,
    roomChargesMinor: lines.filter((l) => l.kind === "room").reduce((a, l) => a + l.amountMinor, 0),
    otherChargesMinor: lines
      .filter((l) => l.kind !== "room")
      .reduce((a, l) => a + l.amountMinor, 0),
    paidMinor,
  });
  const form = d.preCheckin
    ? checkinFormState({
        completedAt: d.preCheckin.completedAt,
        guestsListed: d.preCheckin.guests,
        guestsExpected: adults + children,
      })
    : checkinFormState({ completedAt: null, guestsListed: 0, guestsExpected: adults + children });
  const cur = (m: number) => money(m, d.currency, locale);
  const when = (iso: string) => {
    const date = iso.slice(0, 10);
    const time = iso.length > 10 ? iso.slice(11, 16) : "";
    const diff = Math.round(
      (Date.parse(`${v.today}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / 86_400_000,
    );
    const dword =
      diff === 0 ? t("when.today") : diff === 1 ? t("when.yesterday") : dayMonth(date, locale);
    return time && diff <= 1 ? `${dword} ${time}` : dword;
  };

  // the readable timeline: revisions in words, then what happened here
  const chrono = [...d.revisions].reverse();
  const revEvents = chrono.map((r, i) => {
    const prev = chrono[i - 1];
    return {
      at: r.insertedAt,
      ev: revisionEvent({
        diff: r.diff,
        revisionType: r.revisionType,
        amountMinor: r.amountMinor,
        previousAmountMinor: prev?.amountMinor ?? null,
        guests: r.guests,
        previousGuests: prev?.guests ?? null,
      }),
    };
  });
  const by = direct ? t("tl.byYou") : t("tl.by", { channel: ch.label });
  const revText = (ev: RevisionEvent, at: string): [string, string] => {
    if (ev.kind === "booked") return [t("tl.booked"), `${ch.label} · ${when(at)} · ${ref}`];
    if (ev.kind === "cancelled") return [t("tl.cancelled"), `${by} · ${when(at)}`];
    if (ev.kind === "dates_changed")
      return [
        t("tl.datesChanged", { range: range(ev.to.arrival, ev.to.departure, locale) }),
        `${by} · ${when(at)} · ${t("tl.was", { value: range(ev.from.arrival, ev.from.departure, locale) })}`,
      ];
    if (ev.kind === "guests_changed")
      return [
        t("tl.guestsChanged", { n: ev.to }),
        `${by} · ${when(at)} · ${t("tl.was", { value: ev.from })}`,
      ];
    if (ev.kind === "amount_changed")
      return [
        t("tl.totalChanged", { amount: cur(ev.toMinor) }),
        `${by} · ${when(at)}${ev.fromMinor !== null ? ` · ${t("tl.was", { value: cur(ev.fromMinor) })}` : ""}`,
      ];
    return [t("tl.updated"), `${by} · ${when(at)}`];
  };
  const timeline = [
    ...revEvents.map(({ at, ev }) => {
      const [title, sub] = revText(ev, at);
      return { at, title, sub, accent: ev.kind !== "booked" };
    }),
    ...d.events.map((e) => ({
      at: e.at,
      title:
        e.kind === "message_sent"
          ? e.detail
            ? t("tl.messageSentNamed", { name: e.detail })
            : t("tl.messageSent")
          : t(`tl.${e.kind}`),
      sub: `${e.kind === "message_sent" ? t("tl.automation") : e.kind === "form_done" ? t("tl.guest") : t("tl.staff")} · ${when(e.at)}`,
      accent: false,
    })),
  ].sort((a, b) => (a.at < b.at ? 1 : -1));

  const latest = revEvents[revEvents.length - 1];
  const datesChange =
    latest && latest.ev.kind === "dates_changed" && chrono.length > 1
      ? { ev: latest.ev, at: latest.at, from: chrono[chrono.length - 2]!.amountMinor }
      : null;
  const firstRoom = d.rooms[0];
  const unitLabel =
    d.rooms
      .map((r) => r.unitName ?? r.roomTypeTitle)
      .filter(Boolean)
      .join(", ") || t("stayStatus.needs_room_short");
  const cred = v.credentials[0];
  const nightly = firstRoom?.days ?? [];
  const uniform =
    nightly.length > 0 &&
    nightly.every((x) => Number(x.amountMinor) === Number(nightly[0]!.amountMinor));
  const localCharges = lines.filter((l) => l.kind !== "room");
  const expectedRoom = d.rooms.find((r) => r.stayState === "expected");
  const inHouseRoom = d.rooms.find((r) => r.stayState === "checked_in");
  const hidden = (extra: Record<string, string> = {}) => (
    <>
      <input type="hidden" name="bookingId" value={d.id} />
      <input type="hidden" name="propertyId" value={d.propertyId} />
      {Object.entries(extra).map(([k, val]) => (
        <input key={k} type="hidden" name={k} value={val} />
      ))}
    </>
  );
  const disabledBtn = buttonClasses("secondary", "md", "cursor-not-allowed opacity-50", true);
  const tile = (label: string, value: string, sub: string) => (
    <div className="flex min-w-0 flex-col gap-1 rounded-card border border-border p-4">
      <span className="text-xs font-semibold text-muted">{label}</span>
      <strong
        title={value}
        className={cn(
          "font-display font-bold tracking-tight",
          value.length > 12 ? "line-clamp-2 text-lg leading-tight" : "truncate text-2xl",
        )}
      >
        {value}
      </strong>
      <span className="text-xs text-muted">{sub}</span>
    </div>
  );

  return (
    <div className="flex flex-col gap-5" data-testid="reservation-detail" data-status={d.status}>
      <ReservationHotkeys />
      <PageHeader
        title={guestName}
        tabs={false}
        crumb={[
          { href: "/reservations", label: t("title") },
          { label: guestName, href: `/reservations/${d.id}` },
          { label: ref },
        ]}
      />
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] xl:grid-cols-[minmax(0,1fr)_minmax(0,27rem)]">
        {/* ------------------------------------------------ main column */}
        <div className="flex min-w-0 flex-col gap-5">
          <Card
            title={d.propertyTitle}
            description={`${stay(d.arrivalDate, d.departureDate, locale)} · ${t("nights", { n: nights })} · ${partyWords(adults, children, t)}`}
          >
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center gap-2">
                <StatusChip status={status} t={t} />
                <Chip>
                  {ch.label}
                  {d.otaReservationCode ? ` · ${d.otaReservationCode}` : ""}
                </Chip>
                {d.revisions.length > 1 && d.revisions[0] ? (
                  <Chip color="info">
                    {direct
                      ? t("chips.updatedByYou", { when: when(d.revisions[0].insertedAt) })
                      : t("chips.updatedBy", {
                          channel: ch.label,
                          when: when(d.revisions[0].insertedAt),
                        })}
                  </Chip>
                ) : null}
                {form.kind === "done" ? (
                  <Chip color="success">{t("chips.formDone")}</Chip>
                ) : form.kind === "missing_guests" ? (
                  <Chip color="warning">{t("chips.formMissing", { n: form.missing })}</Chip>
                ) : null}
                {d.unacknowledged && d.lastRevisionId ? (
                  <form action={acknowledgeAction}>
                    {hidden({ revisionId: d.lastRevisionId })}
                    <Button type="submit" variant="soft" size="sm" data-testid="acknowledge">
                      {t("acknowledgeChange")}
                    </Button>
                  </form>
                ) : null}
              </div>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {tile(
                  t("tiles.checkIn"),
                  day(d.arrivalDate, locale).split(" ").slice(0, 2).join(" "),
                  t("tiles.from", { time: d.checkInTime }),
                )}
                {tile(
                  t("tiles.checkOut"),
                  day(d.departureDate, locale).split(" ").slice(0, 2).join(" "),
                  t("tiles.by", { time: d.checkOutTime }),
                )}
                {tile(
                  t("tiles.room"),
                  unitLabel,
                  firstRoom?.maxOccupancy
                    ? t("tiles.sleeps", { units: d.rooms.length, n: firstRoom.maxOccupancy })
                    : t("tiles.units", { units: d.rooms.length }),
                )}
                <DoorCodeTile
                  bookingId={d.id}
                  propertyId={d.propertyId}
                  status={d.status}
                  credential={
                    cred
                      ? {
                          id: cred.id,
                          valueMasked: cred.valueMasked,
                          validity: t("tiles.validity", {
                            from: `${dayMonth(cred.validFrom, locale)} ${cred.validFrom.slice(11, 16)}`,
                            to: `${dayMonth(cred.validTo, locale)} ${cred.validTo.slice(11, 16)}`,
                          }),
                        }
                      : null
                  }
                  labels={{
                    title: t("tiles.doorCode"),
                    issue: t("issueCode"),
                    reveal: t("reveal"),
                    notIssued: t("tiles.notIssued"),
                    validity: t("tiles.validity", { from: "{from}", to: "{to}" }),
                  }}
                />
              </div>
            </div>
          </Card>

          <Card
            title={t("money.title")}
            actions={
              <BalanceChip balance={balance} currency={d.currency} otaName={d.otaName} t={t} />
            }
          >
            <dl className="flex flex-col text-sm" data-testid="money">
              <div className="flex justify-between border-b border-border/70 py-2.5">
                <dt>
                  {uniform
                    ? t("money.nightsTimes", {
                        n: nights,
                        price: cur(Number(nightly[0]!.amountMinor)),
                      })
                    : t("nights", { n: nights })}
                </dt>
                <dd className="tabular-nums">{cur(d.financials.roomRevenueMinor)}</dd>
              </div>
              {d.financials.extrasMinor > 0 ? (
                <div className="flex justify-between border-b border-border/70 py-2.5">
                  <dt>{t("extras")}</dt>
                  <dd className="tabular-nums">{cur(d.financials.extrasMinor)}</dd>
                </div>
              ) : null}
              {d.financials.taxesMinor > 0 ? (
                <div className="flex justify-between border-b border-border/70 py-2.5">
                  <dt>{t("taxes")}</dt>
                  <dd className="tabular-nums">{cur(d.financials.taxesMinor)}</dd>
                </div>
              ) : null}
              {d.financials.otaCommissionMinor > 0 ? (
                <div className="flex justify-between border-b border-border/70 py-2.5 text-muted">
                  <dt>{t("money.commission", { channel: ch.label })}</dt>
                  <dd className="tabular-nums">−{cur(d.financials.otaCommissionMinor)}</dd>
                </div>
              ) : null}
              {d.financials.withheldTaxesMinor > 0 ? (
                <div className="flex justify-between border-b border-border/70 py-2.5 text-muted">
                  <dt>{t("withheldTaxes")}</dt>
                  <dd className="tabular-nums">−{cur(d.financials.withheldTaxesMinor)}</dd>
                </div>
              ) : null}
              <div className="flex justify-between py-2.5 font-bold">
                <dt>{direct ? t("money.total") : t("expectedPayout")}</dt>
                <dd className="tabular-nums">
                  {cur(
                    d.totalAmountMinor -
                      d.financials.withheldTaxesMinor -
                      d.financials.otaCommissionMinor,
                  )}
                </dd>
              </div>
            </dl>
            <div className="flex flex-col gap-3 text-[13px] text-muted">
              <p data-testid="payment-collect" data-collect={d.paymentCollect ?? "unknown"}>
                {d.paymentCollect === "ota"
                  ? t("paidAtOta", { ota: ch.label })
                  : t("money.collected", { paid: cur(paidMinor) })}
                {d.paymentType ? ` · ${t(`paymentTypes.${d.paymentType}`)}` : ""}
                {localCharges.length > 0
                  ? ` ${t("money.chargedHere", {
                      list: localCharges
                        .map((l) => `${l.description} ${cur(l.amountMinor)}`)
                        .join(", "),
                    })}`
                  : ""}
              </p>
              {datesChange ? (
                <div
                  className="rounded-control border border-accent/30 bg-accent-soft/50 px-4 py-3 text-accent-soft-foreground"
                  data-testid="dates-changed"
                >
                  <strong>
                    {t("money.datesChanged", {
                      when: when(datesChange.at),
                      from: range(
                        datesChange.ev.from.arrival,
                        datesChange.ev.from.departure,
                        locale,
                      ),
                      to: range(datesChange.ev.to.arrival, datesChange.ev.to.departure, locale),
                    })}
                  </strong>{" "}
                  {t("money.totalWent", {
                    from: cur(datesChange.from),
                    to: cur(d.totalAmountMinor),
                  })}{" "}
                  {d.paymentCollect === "ota"
                    ? t("money.otaPaysDifference", { channel: ch.label })
                    : t("money.balanceRecomputed")}
                </div>
              ) : null}
              <InstrumentPanel
                bookingId={d.id}
                count={d.instruments.length}
                label={t("revealInstrument")}
              />
            </div>
            <details id="folio" className="group mt-1 border-t border-border pt-3">
              <summary
                className="inline-flex cursor-pointer list-none items-center text-sm font-semibold text-accent hover:underline"
                data-testid="record-payment"
                data-hotkey="$"
              >
                {t("money.recordPayment")}
                <Kbd>$</Kbd>
              </summary>
              <div className="mt-4">
                <FolioOperations
                  folios={v.folios}
                  bookingId={d.id}
                  propertyId={d.propertyId}
                  arrivalDate={d.arrivalDate}
                  locale={locale}
                  t={t}
                />
              </div>
            </details>
          </Card>

          {convo !== undefined ? (
            <Card
              title={t("conversation.title")}
              actions={
                convo ? (
                  <Link
                    href={`/inbox?view=all&thread=${convo.threadId}`}
                    className="text-sm font-semibold text-accent hover:underline"
                  >
                    {t("conversation.openInInbox")}
                  </Link>
                ) : null
              }
            >
              {convo && convo.messages.length > 0 ? (
                <ol className="flex flex-col gap-3" data-testid="conversation">
                  {convo.messages.map((m) => (
                    <li
                      key={m.id}
                      className={cn(
                        "max-w-[80%] rounded-control px-3.5 py-2.5 text-sm",
                        m.direction === "inbound"
                          ? "self-start bg-default"
                          : "self-end bg-accent text-accent-foreground",
                      )}
                    >
                      <p className="whitespace-pre-wrap">{m.body}</p>
                      <p
                        className={cn(
                          "mt-1 text-[11px]",
                          m.direction === "inbound" ? "text-muted" : "opacity-80",
                        )}
                      >
                        {m.direction === "inbound"
                          ? firstName
                          : (m.author ?? t("conversation.you"))}{" "}
                        · {when(m.sentAt)}
                      </p>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-muted">{t("conversation.empty")}</p>
              )}
              {convo ? (
                <form action={sendReplyAction} className="mt-4 flex items-center gap-2">
                  <input type="hidden" name="threadId" value={convo.threadId} />
                  <input type="hidden" name="propertyId" value={convo.propertyId} />
                  <Input
                    name="body"
                    required
                    placeholder={t("conversation.replyTo", { name: firstName, channel: ch.label })}
                    aria-label={t("conversation.reply")}
                    className="flex-1"
                  />
                  <Button type="submit">{t("conversation.send")}</Button>
                </form>
              ) : null}
            </Card>
          ) : null}

          <Card
            id="rooms"
            title={t("rooms.title")}
            actions={
              !isSingle && d.status !== "cancelled" ? (
                <form action={autoAssignAction}>
                  {hidden()}
                  <Button type="submit" variant="secondary" size="sm">
                    {t("autoAssign")}
                  </Button>
                </form>
              ) : null
            }
          >
            <div className="flex flex-col divide-y divide-border">
              {d.rooms.map((r) => (
                <div
                  key={r.id}
                  className="flex flex-col gap-2 py-3 first:pt-0 text-sm"
                  data-testid="stay-room"
                >
                  <p className="font-semibold">
                    {r.roomTypeTitle ?? (
                      <span className="text-warning">{t("stayStatus.needs_room_short")}</span>
                    )}
                    {r.ratePlanTitle ? (
                      <span className="font-normal text-muted"> · {r.ratePlanTitle}</span>
                    ) : null}
                    <span className="font-normal text-muted">
                      {" "}
                      · {partyWords(r.occupancy.adults, r.occupancy.children, t)}
                      {r.occupancy.ages?.length
                        ? ` (${t("rooms.ages", { ages: r.occupancy.ages.join(", ") })})`
                        : ""}
                    </span>
                  </p>
                  <p className="text-xs text-muted">
                    {r.days
                      .map((x) => `${day(x.date, locale)} ${cur(Number(x.amountMinor))}`)
                      .join(" · ")}
                  </p>
                  {!isSingle ? (
                    <form action={assignUnitAction} className="flex flex-wrap items-center gap-2">
                      {hidden({ bookingRoomId: r.id })}
                      <Select
                        name="unitId"
                        defaultValue={r.assignedUnitId ?? ""}
                        className="max-w-xs"
                        size="sm"
                        aria-label={t("rooms.unit")}
                      >
                        <option value="">{t("rooms.noUnit")}</option>
                        {v.units
                          .filter((u) => u.roomTypeId === r.roomTypeId)
                          .map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.name}
                            </option>
                          ))}
                      </Select>
                      <Button type="submit" variant="secondary" size="sm" data-testid="move-room">
                        {r.assignedUnitId ? t("rooms.move") : t("assign")}
                      </Button>
                    </form>
                  ) : (
                    <p className="text-xs text-muted">{t("singleUnitNoAssign")}</p>
                  )}
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <Chip size="sm">{t(`rooms.state.${r.stayState}`)}</Chip>
                    {r.stayState === "expected" && d.status !== "cancelled" ? (
                      <form action={stayStateAction}>
                        {hidden({
                          bookingRoomId: r.id,
                          state: "no_show",
                          reason: "did not arrive",
                        })}
                        <Button type="submit" variant="ghost" size="sm" className="text-danger">
                          {t("noShow")}
                        </Button>
                      </form>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
            {v.credentials.length > 0 ? (
              <div className="mt-2 border-t border-border pt-3 text-sm">
                <p className="mb-1 font-semibold">{t("access")}</p>
                <ul className="flex flex-col gap-1 text-xs text-muted">
                  {v.credentials.map((c) => (
                    <li key={c.id} className="flex flex-wrap items-center gap-2">
                      <span className="font-mono">{c.valueMasked}</span> ·{" "}
                      {t(`rooms.credential.${c.type}`)} ·{" "}
                      {t("tiles.validity", {
                        from: `${dayMonth(c.validFrom, locale)} ${c.validFrom.slice(11, 16)}`,
                        to: `${dayMonth(c.validTo, locale)} ${c.validTo.slice(11, 16)}`,
                      })}{" "}
                      · {t(`rooms.delivery.${c.deliveryState}`)}
                      <form action={revokeCredentialAction}>
                        {hidden({ credentialId: c.id })}
                        <button className="text-danger underline">{t("revoke")}</button>
                      </form>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </Card>

          <Card title={t("notes")}>
            {v.notes.length > 0 ? (
              <ul className="mb-3 flex flex-col gap-2 text-sm">
                {v.notes.map((n) => (
                  <li key={n.id} className="flex items-start gap-2">
                    {n.pinned ? (
                      <Chip size="sm" color="warning">
                        {t("pinned")}
                      </Chip>
                    ) : null}
                    <span className="flex-1">{n.body}</span>
                    <span className="text-xs text-muted">{when(n.createdAt)}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            <form action={addNoteAction} className="flex flex-wrap items-center gap-2">
              {hidden()}
              <Input
                name="body"
                required
                placeholder={t("addNote")}
                aria-label={t("addNote")}
                className="min-w-48 flex-1"
              />
              <Checkbox name="pinned">{t("pin")}</Checkbox>
              <Button type="submit" variant="secondary">
                {t("save")}
              </Button>
            </form>
          </Card>
        </div>

        {/* ------------------------------------------------ side column */}
        <div className="flex min-w-0 flex-col gap-5">
          <Card title={t("guest")}>
            <div className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className="grid size-11 shrink-0 place-items-center rounded-full bg-accent-soft text-sm font-bold text-accent-soft-foreground"
              >
                {guestName
                  .split(/\s+/)
                  .slice(0, 2)
                  .map((w) => w[0])
                  .join("")
                  .toUpperCase()}
              </span>
              <div className="min-w-0">
                <p className="font-semibold">{guestName}</p>
                <p className="text-xs text-muted">
                  {[
                    d.guestStays > 0 ? t("guestCard.nthStay", { n: d.guestStays }) : null,
                    d.guest?.country ?? null,
                    d.guest?.language
                      ? t("guestCard.speaks", { language: d.guest.language })
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
            </div>
            <dl className="mt-4 grid grid-cols-[max-content_1fr] items-baseline gap-x-6 gap-y-2 text-sm">
              {d.guest ? (
                <GuestContact
                  bookingId={d.id}
                  guestId={d.guest.id}
                  hasEmail={d.guest.hasEmail}
                  hasPhone={d.guest.hasPhone}
                  labels={{
                    email: t("guestCard.email"),
                    phone: t("guestCard.phone"),
                    onFile: t("guestCard.onFile"),
                    none: "—",
                    reveal: t("guestCard.show"),
                    revealedFor: t("guestCard.revealedFor"),
                  }}
                />
              ) : null}
              <dt className="text-muted">{t("guestCard.portal")}</dt>
              <dd>
                <OpenPortalButton bookingId={d.id} label={t("guestCard.openPortal")} />
              </dd>
              <dt className="text-muted">{t("guestCard.form")}</dt>
              <dd>
                {form.kind === "done" ? (
                  <Chip color="success" size="sm">
                    {d.preCheckin?.arrivalTime
                      ? t("guestCard.formDoneAt", { time: d.preCheckin.arrivalTime })
                      : t("guestCard.formDone")}
                  </Chip>
                ) : form.kind === "missing_guests" ? (
                  <Chip color="warning" size="sm">
                    {t("chips.formMissing", { n: form.missing })}
                  </Chip>
                ) : (
                  <Chip size="sm">{t("guestCard.formNotStarted")}</Chip>
                )}
              </dd>
            </dl>
          </Card>

          <Card title={t("actions.title")}>
            <div className="flex flex-col gap-2.5">
              {inHouseRoom ? (
                <form action={stayStateAction}>
                  {hidden({ bookingRoomId: inHouseRoom.id, state: "checked_out" })}
                  <Button type="submit" fullWidth data-testid="check-out" data-hotkey="c">
                    {t("actions.checkOut")}
                    <Kbd>C</Kbd>
                  </Button>
                </form>
              ) : expectedRoom && d.status !== "cancelled" ? (
                <form action={stayStateAction}>
                  {hidden({ bookingRoomId: expectedRoom.id, state: "checked_in" })}
                  <Button type="submit" fullWidth data-testid="check-in" data-hotkey="c">
                    {t("actions.checkIn")}
                    <Kbd>C</Kbd>
                  </Button>
                </form>
              ) : null}
              {isSingle || d.status === "cancelled" ? (
                <span className={disabledBtn} aria-disabled="true" title={t("singleUnitNoAssign")}>
                  {t("actions.move")}
                </span>
              ) : (
                <a href="#rooms" className={buttonClasses("secondary", "md", undefined, true)}>
                  {t("actions.move")}
                </a>
              )}
              {direct && d.status !== "cancelled" ? (
                <details className="group">
                  <summary
                    className={cn(buttonClasses("secondary", "md", undefined, true), "list-none")}
                    data-hotkey="d"
                    data-testid="change-dates"
                  >
                    {t("actions.changeDates")}
                    <Kbd>D</Kbd>
                  </summary>
                  <form action={changeDatesAction} className="mt-3 flex flex-col gap-2">
                    {hidden()}
                    <div className="grid grid-cols-2 gap-2">
                      <DateInput
                        name="arrivalDate"
                        defaultValue={d.arrivalDate}
                        label={t("tiles.checkIn")}
                      />
                      <DateInput
                        name="departureDate"
                        defaultValue={d.departureDate}
                        label={t("tiles.checkOut")}
                      />
                    </div>
                    <p className="text-xs text-muted">{t("actions.changeDatesHint")}</p>
                    <Button type="submit" size="sm">
                      {t("actions.saveDates")}
                    </Button>
                  </form>
                </details>
              ) : (
                <span
                  className={disabledBtn}
                  aria-disabled="true"
                  data-hotkey="d"
                  title={t("actions.otaNote", { channel: ch.label })}
                >
                  {t("actions.changeDates")}
                  <Kbd>D</Kbd>
                </span>
              )}
              {direct && d.status !== "cancelled" ? (
                <form action={cancelDirectBookingAction}>
                  {hidden()}
                  <Button
                    type="submit"
                    variant="danger"
                    fullWidth
                    aria-describedby="cancel-effects"
                  >
                    {t("actions.cancel")}
                  </Button>
                </form>
              ) : d.status !== "cancelled" ? (
                <span className={cn(disabledBtn, "text-danger")} aria-disabled="true">
                  {t("actions.cancel")}
                </span>
              ) : null}
              <p className="text-xs text-muted" id="cancel-effects">
                {direct ? t("cancelSideEffects") : t("actions.otaNote", { channel: ch.label })}
              </p>
            </div>
          </Card>

          <Card title={t("timeline")}>
            <ol className="flex flex-col gap-3.5" data-testid="timeline">
              {timeline.map((e, i) => (
                <li key={i} className="flex gap-3 text-sm">
                  <span
                    aria-hidden="true"
                    className={cn(
                      "mt-1.5 size-2 shrink-0 rounded-full",
                      e.accent ? "bg-accent" : "bg-muted/50",
                    )}
                  />
                  <span className="min-w-0">
                    <strong className="block font-semibold">{e.title}</strong>
                    <span className="text-xs text-muted">{e.sub}</span>
                  </span>
                </li>
              ))}
            </ol>
          </Card>

          <Card title={t("turnover.title")}>
            {v.tasks.length === 0 ? (
              <p className="text-sm text-muted">{t("turnover.none")}</p>
            ) : (
              <ul className="flex flex-col gap-2 text-sm">
                {v.tasks.map((x) => (
                  <li key={x.id} className="flex flex-wrap items-center gap-2">
                    <Link href={`/operations?date=${x.date}`} className="hover:underline">
                      {x.arrivingBookingId === d.id && x.departingBookingId !== d.id
                        ? t("turnover.before")
                        : x.departingBookingId === d.id && x.arrivingBookingId !== d.id
                          ? t("turnover.after")
                          : t(`turnover.types.${x.type}`)}
                    </Link>
                    <Chip
                      size="sm"
                      color={
                        x.state === "done" || x.state === "inspected"
                          ? "success"
                          : x.assigneeName
                            ? "info"
                            : "warning"
                      }
                    >
                      {t(`turnover.states.${x.state}`)} ·{" "}
                      {day(x.date, locale).split(" ").slice(0, 1).join("")}{" "}
                      {x.windowFrom.slice(0, 5)}
                      {x.assigneeName ? ` · ${x.assigneeName}` : ` · ${t("turnover.nobody")}`}
                    </Chip>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
