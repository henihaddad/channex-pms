"use server";

import { redirect } from "next/navigation";
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

export interface FormState {
  error?: string | null;
  message?: string;
}

const field = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

const signUpSchema = z.object({
  email: z.string().email(),
  password: z.string().min(12),
  name: z.string().min(1),
  organizationName: z.string().min(1),
  slug: z.string().regex(/^[a-z0-9-]{3,40}$/),
  country: z.string().length(2),
  currency: z.string().length(3),
});

async function guarded(fn: () => Promise<unknown>): Promise<FormState> {
  try {
    await fn();
    return {};
  } catch (e) {
    if (e instanceof HttpProblem) return { error: e.message };
    throw e;
  }
}

export const signUpAction = publicAction<[FormState, FormData], FormState>(
  "auth",
  async (_prev, fd) => {
    const parsed = signUpSchema.safeParse({
      email: field(fd, "email"),
      password: field(fd, "password"),
      name: field(fd, "name"),
      organizationName: field(fd, "organizationName"),
      slug: field(fd, "slug"),
      country: field(fd, "country").toUpperCase(),
      currency: field(fd, "currency").toUpperCase(),
    });
    if (!parsed.success)
      return {
        error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
      };
    const state = await guarded(() => signUpFlow(parsed.data));
    if (state.error) return state;
    redirect("/");
  },
);

export const loginAction = publicAction<[FormState, FormData], FormState>(
  "auth",
  async (_prev, fd) => {
    let next = "/";
    const state = await guarded(async () => {
      const r = await loginFlow(field(fd, "email"), field(fd, "password"));
      if (r.kind === "totp_required") next = "/totp";
    });
    if (state.error) return state;
    redirect(next);
  },
);

export const totpAction = publicAction<[FormState, FormData], FormState>(
  "auth",
  async (_prev, fd) => {
    const state = await guarded(() => totpFlow(field(fd, "code")));
    if (state.error) return state;
    redirect("/");
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
    if (state.error) return state;
    redirect("/");
  },
);

/** Owner portal: passwordless. Always the same answer (no enumeration). */
export const requestMagicLinkAction = publicAction<[FormState, FormData], FormState>(
  "auth",
  async (_prev, fd) => {
    const { requestMagicLinkFlow } = await import("@/server/auth-flows");
    await requestMagicLinkFlow(field(fd, "email"), "en");
    return {
      error: null,
      message: "If that address belongs to an owner, a sign-in link is on its way.",
    };
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
    const state = await guarded(() => stepUpFlow(field(fd, "password")));
    if (state.error) return state;
    const next = field(fd, "next");
    redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
  },
);
