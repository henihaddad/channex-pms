"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { LOCALES } from "@/i18n/request";
import { COOKIES } from "@/server/session";
import { publicAction } from "@/server/public";

/** The console's language, per user and browser (spec 13 §13.8), chosen from the header. */
export const setLocaleAction = publicAction<[FormData], void>("auth", async (fd) => {
  const locale = String(fd.get("locale") ?? "");
  if (!(LOCALES as readonly string[]).includes(locale)) return;
  const jar = await cookies();
  jar.set(COOKIES.locale, locale, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath("/", "layout");
});
