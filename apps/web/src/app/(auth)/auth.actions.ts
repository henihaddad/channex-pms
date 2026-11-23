"use server";

import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { z } from "zod";
import type { Id } from "@pms/core";
import { publicAction } from "@/server/public";
import {
  acceptInviteFlow,
  loginFlow,
  logoutFlow,
  signUpFlow,
  stepUpFlow,
  totpFlow,
} from "@/server/auth-flows";
import { HttpProblem } from "@/server/errors";
import { authErrorFor, FIELD_ERROR, type AuthErrorKey, type AuthField } from "./auth-errors";

export interface FormState {
  error?: string | null;
  message?: string;
  /** One translated message per field, shown under it. */
  fieldErrors?: Partial<Record<AuthField, string>>;
  /** What was typed (never a password), so React's reset after the action does not empty the form. */
  values?: Record<string, string>;
}

const field = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

/** Where to go after signing in: a same-site path only, so the parameter is never an open redirect. */
function safeNext(raw: string): string {
  return raw.startsWith("/") && !raw.startsWith("//") && !raw.startsWith("/\\") ? raw : "/";
}

const signUpSchema = z.object({
  email: z.string().email(),
  password: z.string().min(12),
  name: z.string().min(1),
  organizationName: z.string().min(1),
  slug: z.string().regex(/^[a-z0-9-]{3,40}$/),
  country: z.string().length(2),
  currency: z.string().length(3),
});

/**
 * Run a flow and turn an expected identity failure into a translated message: under its field
 * when it is about one, at the top of the form otherwise. Codes never reach the screen.
 * `overrides` rewords a code for one form ("Invalid password" on step-up is not a wrong email).
 */
async function guarded(
  fn: () => Promise<unknown>,
  overrides: Partial<Record<string, AuthErrorKey>> = {},
): Promise<FormState> {
  try {
    await fn();
    return {};
  } catch (e) {
    if (!(e instanceof HttpProblem)) throw e;
    const t = await getTranslations("auth.errors");
    const override = overrides[e.code];
    if (override) return { error: t(override) };
    const mapped = authErrorFor(e.code);
    return mapped.field
      ? { fieldErrors: { [mapped.field]: t(mapped.key) } }
      : { error: t(mapped.key) };
  }
}

const failed = (s: FormState) => Boolean(s.error || s.fieldErrors);

export const signUpAction = publicAction<[FormState, FormData], FormState>(
  "auth",
  async (_prev, fd) => {
    const values = {
      email: field(fd, "email"),
      name: field(fd, "name"),
      organizationName: field(fd, "organizationName"),
      slug: field(fd, "slug"),
      country: field(fd, "country").toUpperCase(),
      currency: field(fd, "currency").toUpperCase(),
    };
    const parsed = signUpSchema.safeParse({ ...values, password: field(fd, "password") });
    if (!parsed.success) {
      const t = await getTranslations("auth.errors");
      const fieldErrors: Partial<Record<AuthField, string>> = {};
      for (const issue of parsed.error.issues) {
        const f = String(issue.path[0] ?? "") as AuthField;
        if (f in FIELD_ERROR) fieldErrors[f] ??= t(FIELD_ERROR[f]);
      }
      return { fieldErrors, values };
    }
    const state = await guarded(() => signUpFlow(parsed.data));
    if (failed(state)) return { ...state, values };
    redirect("/");
  },
);

export const loginAction = publicAction<[FormState, FormData], FormState>(
  "auth",
  async (_prev, fd) => {
    // spec 02 §2.6: back to the page that asked for a sign-in (an MCP client's consent screen)
    const after = safeNext(field(fd, "next"));
    let next = after;
    const state = await guarded(async () => {
      const r = await loginFlow(field(fd, "email"), field(fd, "password"));
      if (r.kind === "totp_required")
        next = after === "/" ? "/totp" : `/totp?next=${encodeURIComponent(after)}`;
    });
    // a failed attempt keeps the email: only the password is typed again
    if (failed(state)) return { ...state, values: { email: field(fd, "email") } };
    redirect(next);
  },
);

export const totpAction = publicAction<[FormState, FormData], FormState>(
  "auth",
  async (_prev, fd) => {
    const state = await guarded(() => totpFlow(field(fd, "code")));
    if (failed(state)) return state;
    redirect(safeNext(field(fd, "next")));
  },
);

export const acceptInviteAction = publicAction<[FormState, FormData], FormState>(
  "auth",
  async (_prev, fd) => {
    const state = await guarded(() =>
      acceptInviteFlow(field(fd, "orgId") as Id, field(fd, "token"), {
        name: field(fd, "name"),
        ...(field(fd, "password") ? { password: field(fd, "password") } : {}),
      }),
    );
    if (failed(state)) return { ...state, values: { name: field(fd, "name") } };
    redirect("/");
  },
);

/** Owner portal: passwordless. Always the same answer (no enumeration). */
export const requestMagicLinkAction = publicAction<[FormState, FormData], FormState>(
  "auth",
  async (_prev, fd) => {
    const { requestMagicLinkFlow } = await import("@/server/auth-flows");
    const [t, locale] = await Promise.all([getTranslations("owner"), getLocale()]);
    const email = field(fd, "email");
    if (!z.string().email().safeParse(email).success)
      return { error: t("linkEmailInvalid"), values: { email } };
    await requestMagicLinkFlow(email, locale);
    return { error: null, message: t("linkSent"), values: { email } };
  },
);

/** Console "Email me a sign-in link": the same no-enumeration answer; the link stands in for the password only. */
export const requestSignInLinkAction = publicAction<[FormState, FormData], FormState>(
  "auth",
  async (_prev, fd) => {
    const { requestMagicLinkFlow } = await import("@/server/auth-flows");
    const t = await getTranslations("auth");
    const email = field(fd, "email");
    if (!z.string().email().safeParse(email).success)
      return { error: t("linkEmailInvalid"), values: { email } };
    await requestMagicLinkFlow(email, await getLocale(), "login");
    return { error: null, message: t("linkSent"), values: { email } };
  },
);

export const logoutAction = publicAction<[], void>("auth", async () => {
  await logoutFlow();
  redirect("/login");
});

/** Step-up re-authentication, then back to where the sensitive action lives. */
export const stepUpAction = publicAction<[FormState, FormData], FormState>(
  "auth",
  async (_prev, fd) => {
    const state = await guarded(() => stepUpFlow(field(fd, "password")), {
      "identity.invalid_credentials": "passwordWrong",
    });
    if (failed(state)) return state;
    redirect(safeNext(field(fd, "next")));
  },
);
