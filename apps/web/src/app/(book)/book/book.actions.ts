"use server";

import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { asSystem } from "@pms/db";
import { confirmBooking, createHold, EngineError, saveHoldGuest } from "@pms/jobs";
import { engineDeps, orgForHold, orgForProperty } from "@/server/booking-engine";
import { publicAction } from "@/server/public";
import { currentLocale } from "@/server/session";

const str = (fd: FormData, k: string): string => String(fd.get(k) ?? "").trim();

/** Step 3 → 4: hold the room (BE-5) and go to checkout. */
export const holdAction = publicAction<[FormData], void>("booking_engine", async (fd) => {
  const propertyId = str(fd, "propertyId");
  const orgId = await orgForProperty(propertyId);
  if (!orgId) redirect("/book");
  const deps = await engineDeps();
  const locale = await currentLocale();
  // the booking card sends its radio choice as "roomTypeId:ratePlanId"
  const [pickedRoomType, pickedRatePlan] = str(fd, "offer").split(":");
  let holdId: string;
  try {
    holdId = (
      await asSystem(deps.db, orgId, (tx) =>
        createHold(deps, tx, orgId, {
          propertyId,
          roomTypeId: pickedRoomType || str(fd, "roomTypeId"),
          ratePlanId: pickedRatePlan || str(fd, "ratePlanId"),
          arrivalDate: str(fd, "arrival"),
          departureDate: str(fd, "departure"),
          adults: Number(str(fd, "adults") || 2),
          children: Number(str(fd, "children") || 0),
          childAges: [],
          extras: fd.getAll("extra").map((id) => ({ id: String(id), quantity: 1 })),
          promoCode: str(fd, "promo") || null,
          locale,
        }),
      )
    ).holdId;
  } catch (e) {
    if (e instanceof EngineError)
      redirect(
        `/book/${propertyId}?arrival=${str(fd, "arrival")}&departure=${str(fd, "departure")}&error=${e.code}`,
      );
    throw e;
  }
  redirect(`/book/${propertyId}/checkout/${holdId}${fd.get("embed") ? "?embed=1" : ""}`);
});

export interface ConfirmState {
  /** A translated sentence; the engine's code never reaches the guest. */
  error?: string;
  /** The engine's code for `error`, for the page to tell an expired hold from the rest. */
  errorCode?: string;
  declined?: string;
  requiresAction?: string;
  idempotencyKey?: string;
  /** What the guest typed, so a retry after a decline does not start from an empty form (§10.4). */
  guest?: {
    name: string;
    surname: string;
    email: string;
    phone: string | null;
    requests: string;
    consent: boolean;
  };
}

/** `book.errors.<code>` when there is one, the "you haven't been charged" sentence otherwise. */
async function engineMessage(code: string): Promise<string> {
  const t = await getTranslations("book.errors");
  return t.has(code) ? t(code) : t("generic");
}

/** Steps 4 → 6: guest details, payment through the provider, idempotent confirm (BE-6). */
export const confirmAction = publicAction<[ConfirmState, FormData], ConfirmState>(
  "booking_engine",
  async (_prev, fd) => {
    const holdId = str(fd, "holdId");
    const orgId = await orgForHold(holdId);
    if (!orgId) return { error: await engineMessage("hold_gone"), errorCode: "hold_gone" };
    const deps = await engineDeps();
    const idempotencyKey = str(fd, "idempotencyKey");
    const typed = {
      name: str(fd, "firstName"),
      surname: str(fd, "lastName"),
      email: str(fd, "email"),
      phone: str(fd, "phone") || null,
      requests: str(fd, "requests"),
      consent: fd.get("consent") === "on",
    };
    try {
      if (str(fd, "firstName"))
        await asSystem(deps.db, orgId, (tx) =>
          saveHoldGuest(
            deps,
            tx,
            orgId,
            holdId,
            {
              name: str(fd, "firstName"),
              surname: str(fd, "lastName"),
              email: str(fd, "email"),
              phone: str(fd, "phone") || null,
              language: str(fd, "language") || "en",
              requests: typed.requests || null,
            },
            typed.consent,
          ),
        );
      const r = await confirmBooking(
        deps,
        orgId,
        { holdId, idempotencyKey, paymentMethodToken: str(fd, "cardToken") || null },
        (fn) => asSystem(deps.db, orgId, fn),
      );
      if (r.state === "declined")
        return { declined: r.reason, idempotencyKey: deps.crypto.randomToken(8), guest: typed };
      if (r.state === "requires_action")
        return { requiresAction: r.nextAction, idempotencyKey, guest: typed };
      redirect(
        `/book/confirmed/${r.bookingId}?ref=${encodeURIComponent(r.reference)}&email=${encodeURIComponent(str(fd, "email"))}`,
      );
    } catch (e) {
      if (e instanceof EngineError)
        return {
          error: await engineMessage(e.code),
          errorCode: e.code,
          idempotencyKey,
          guest: typed,
        };
      throw e;
    }
  },
);
