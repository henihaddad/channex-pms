import type { Mailer } from "@pms/core";

/**
 * Test-only hooks, enabled by PMS_TEST_HOOKS=1 and never in production. The
 * recording mailer keeps the last mails in memory so end-to-end tests can read
 * invitation and magic-link tokens the way a mailbox would.
 */
export function testHooksEnabled(): boolean {
  return process.env.PMS_TEST_HOOKS === "1" && process.env.PMS_ENV !== "production";
}

type Mail = Parameters<Mailer["send"]>[0];

declare global {
  var __pmsSentMail: Mail[] | undefined;
}

/** Shared through globalThis: Next bundles each route separately, so module state would not be. */
export const sentMail: Mail[] = (globalThis.__pmsSentMail ??= []);

export function recordingMailer(inner: Mailer): Mailer {
  return {
    send: async (mail) => {
      sentMail.push(mail);
      if (sentMail.length > 200) sentMail.shift();
      await inner.send(mail);
    },
  };
}
