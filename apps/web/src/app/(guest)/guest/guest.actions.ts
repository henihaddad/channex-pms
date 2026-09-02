"use server";

import { revalidatePath } from "next/cache";
import { DrizzleBillingRepository, DrizzleBookingEngineRepository } from "@pms/db";
import { guestCancel, guestMessage } from "@pms/jobs";
import { engineDeps } from "@/server/booking-engine";
import { withGuestSession } from "@/server/guest-session";
import { HttpProblem } from "@/server/errors";

const str = (fd: FormData, k: string): string => String(fd.get(k) ?? "").trim();

/** Pre-check-in (spec 10 §10.6): arrival time, guests, preferences; feeds the front-desk board. */
export const savePreCheckinAction = withGuestSession<[FormData], void>(async (ctx, fd) => {
  const c = await engineDeps();
  const guests = str(fd, "guests")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [name = "", ...rest] = l.split(" ");
      return { name, surname: rest.join(" ") };
    });
  await new DrizzleBookingEngineRepository(ctx.tx, ctx.orgId, c.crypto).savePreCheckin(
    ctx.bookingId,
    {
      arrivalTime: str(fd, "arrivalTime") || null,
      idDocumentRef: null,
      preferences: str(fd, "preferences") || null,
      guests,
    },
  );
  revalidatePath("/guest");
});

/** A portal message is an inbound message on the direct thread; the inbox answers it like any other. */
export const sendGuestMessageAction = withGuestSession<[FormData], void>(async (ctx, fd) => {
  const body = str(fd, "body");
  if (!body) throw new HttpProblem(400, "empty_message", "Write something first");
  await guestMessage(await engineDeps(), ctx.tx, ctx.orgId, ctx.bookingId, body);
  revalidatePath("/guest");
});

/** Extras after booking post straight to the folio (spec 10 §10.5). */
export const addExtraAction = withGuestSession<[FormData], void>(async (ctx, fd) => {
  const c = await engineDeps();
  const extra = (
    await new DrizzleBookingEngineRepository(ctx.tx, ctx.orgId, c.crypto).extras(
      str(fd, "propertyId"),
    )
  ).find((e) => e.id === str(fd, "extraId") && e.active);
  if (!extra) throw new HttpProblem(404, "not_found", "Extra not found");
  const billing = new DrizzleBillingRepository(ctx.tx, ctx.orgId);
  await billing.addLine(await billing.ensureFolio(ctx.bookingId), {
    kind: "extra",
    description: extra.name,
    date: c.clock.today("UTC").toString(),
    amountMinor: extra.priceMinor,
  });
  revalidatePath("/guest");
});

/** Self-service cancellation where the policy allows it, fee shown first (spec 10 §10.6). */
export const cancelBookingAction = withGuestSession<[], void>(async (ctx) => {
  const deps = await engineDeps();
  await guestCancel(deps, ctx.orgId, ctx.bookingId, (fn) => fn(ctx.tx));
  revalidatePath("/guest");
});
