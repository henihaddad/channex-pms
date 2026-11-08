"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { checkinFormState } from "@pms/core";
import {
  DrizzleBookingEngineRepository,
  DrizzleMessagingRepository,
  DrizzleReservationRepository,
  rawRows,
  sql,
  type CheckinRow,
} from "@pms/db";
import { withPermission, type ActorCtx } from "@/server/with-permission";
import { container } from "@/server/container";
import { queueDelivery } from "@/server/inbox";

const WINDOW_DAYS = 7;

async function propertyToday(ctx: ActorCtx): Promise<string> {
  const c = await container();
  const [tz] = await rawRows<{ timezone: string }>(
    ctx.tx,
    sql`select timezone from property where archived_at is null order by created_at limit 1`,
  );
  return c.clock.today(tz?.timezone ?? "UTC").toString();
}

const formDone = (r: CheckinRow) =>
  checkinFormState({
    completedAt: r.formCompletedAt,
    guestsListed: r.guestsListed,
    guestsExpected: r.guestsExpected,
  }).kind === "done";

export interface CheckinBoard {
  today: string;
  rows: CheckinRow[];
  /** Booking ids a before-arrival message will still reach (an enabled rule covers the property). */
  remindersScheduled: string[];
  /** Arrivals in the window whose form is not done and who can be written to. */
  remindable: string[];
  hasHotel: boolean;
}

/** The online check-in board (spec 10 §10.6). Persona: `reservations_agent`. */
export const loadCheckinBoard = withPermission<[], CheckinBoard>(
  "booking:read",
  { scope: "organization", audit: false },
  async (ctx) => {
    const c = await container();
    const repo = new DrizzleReservationRepository(ctx.tx, ctx.orgId, c.crypto);
    const today = await propertyToday(ctx);
    const rows = await repo.checkinBoard(today, WINDOW_DAYS);
    const rules = await repo.beforeArrivalRules();
    const [hotel] = await rawRows<{ n: number }>(
      ctx.tx,
      sql`select count(*)::int as n from property where kind = 'hotel' and archived_at is null`,
    );
    const pending = rows.filter((r) => r.arrivalDate >= today && !formDone(r));
    return {
      today,
      rows,
      remindersScheduled: pending
        .filter((r) => rules.some((x) => !x.propertyIds || x.propertyIds.includes(r.propertyId)))
        .map((r) => r.id),
      remindable: pending.filter((r) => r.hasThread || r.hasEmail).map((r) => r.id),
      hasHotel: (hotel?.n ?? 0) > 0,
    };
  },
);

/**
 * "Send reminders": one message per arrival whose form is not done, on the booking's thread,
 * in the guest's language, with a fresh portal link. Staff-authored, so it hands the thread
 * back to a human like any reply (AUTO rules see it).
 */
export const sendCheckinRemindersAction = withPermission<[FormData], void>(
  "message:send",
  { scope: "organization", subject: () => ({ kind: "booking", id: "checkin-reminders" }) },
  async (ctx, fd) => {
    const c = await container();
    const ids = new Set(fd.getAll("bookingId").map(String));
    const today = await propertyToday(ctx);
    const messaging = new DrizzleMessagingRepository(ctx.tx, ctx.orgId, c.crypto);
    const engine = new DrizzleBookingEngineRepository(ctx.tx, ctx.orgId, c.crypto);
    const bookings = await messaging.bookingsForAutomation(today, 1, WINDOW_DAYS + 1);
    const rows = await new DrizzleReservationRepository(ctx.tx, ctx.orgId, c.crypto).checkinBoard(
      today,
      WINDOW_DAYS,
    );
    for (const r of rows) {
      const b = bookings.find((x) => x.bookingId === r.id);
      if (!ids.has(r.id) || !b || formDone(r)) continue;
      const token = c.crypto.randomToken(32);
      await engine.createGuestSession(
        r.id,
        c.crypto.sha256Hex(token),
        new Date(Date.parse(`${r.departureDate}T00:00:00Z`) + 30 * 86_400_000).toISOString(),
      );
      const t = await getTranslations({
        locale: ["en", "fr", "ar"].includes(r.guestLanguage ?? "") ? r.guestLanguage! : "en",
        namespace: "reservations.checkin",
      });
      const threadId = await messaging.ensureThreadForBooking(b);
      const messageId = await messaging.queueGuestMessage(threadId, {
        authorType: "staff",
        authorId: ctx.userId,
        body: t("reminderBody", {
          name: r.guestName.split(" ")[0] ?? "",
          property: r.propertyTitle,
          url: `${c.config.NEXT_PUBLIC_APP_URL ?? ""}/guest?token=${token}`,
        }),
        sentAt: c.clock.now().toString(),
      });
      await queueDelivery(ctx, messageId);
    }
    revalidatePath("/reservations/check-in");
  },
);
