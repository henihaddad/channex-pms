import type { Mailer } from "@pms/core";
import type { Logger } from "pino";
import type { Config } from "./config.js";

/** Development transport: logs the template and params (tokens included) so flows can be exercised locally. */
export function consoleMailer(log: Logger): Mailer {
  return {
    send: async (mail) => {
      log.info(
        {
          mail: {
            to: "[redacted]",
            template: mail.template,
            locale: mail.locale,
            params: mail.params,
          },
        },
        "mail.send",
      );
    },
  };
}

/** Records sent mail for tests. */
export function memoryMailer() {
  const sent: Parameters<Mailer["send"]>[0][] = [];
  const mailer: Mailer = {
    send: async (m) => {
      sent.push(m);
    },
  };
  return { mailer, sent };
}

type Mail = Parameters<Mailer["send"]>[0];

const SUBJECTS: Record<string, string> = {
  magic_link: "Your sign-in link",
  invitation: "You have been invited",
  booking_confirmation: "Your booking is confirmed",
  booking_abandoned: "Your stay is still available",
  guest_message: "New message about your stay",
  owner_statement: "Your owner statement is ready",
  scheduled_report: "Your scheduled report",
  billing_payment_failed: "Payment failed",
  billing_dunning: "Action needed on your subscription",
  billing_suspended: "Your account has been suspended",
  break_glass_notice: "Support access notice",
};

const HIDDEN = new Set(["token"]);

/** The action link of a template, when it has one. Links carry the tokens; the body never repeats them. */
function linkFor(mail: Mail, appUrl: string): string | undefined {
  switch (mail.template) {
    case "magic_link":
      return `${appUrl}/api/v1/auth/magic?token=${encodeURIComponent(mail.params.token ?? "")}`;
    case "invitation":
      return `${appUrl}/invite/${mail.params.orgId ?? ""}/${mail.params.token ?? ""}`;
    default:
      return mail.params.portalUrl ?? mail.params.url;
  }
}

/** Plain-text rendering shared by every HTTPS transport. Locale-specific copy is a later concern (Q10). */
export function renderMail(mail: Mail, appUrl: string): { subject: string; text: string } {
  const subject = SUBJECTS[mail.template] ?? mail.template.replace(/_/g, " ");
  const link = linkFor(mail, appUrl);
  const lines = Object.entries(mail.params)
    .filter(([k]) => !HIDDEN.has(k) && k !== "url" && k !== "portalUrl")
    .map(([k, v]) => `${k}: ${v}`);
  const text = [subject, "", ...lines, ...(link ? ["", link] : [])].join("\n");
  return { subject, text };
}

/** Resend over HTTPS: the transport that runs anywhere `fetch` does, Cloudflare Workers included. */
export function resendMailer(opts: {
  apiKey: string;
  from: string;
  appUrl: string;
  log: Logger;
  fetchImpl?: typeof fetch;
}): Mailer {
  const doFetch = opts.fetchImpl ?? fetch;
  return {
    send: async (mail) => {
      const { subject, text } = renderMail(mail, opts.appUrl);
      const res = await doFetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { authorization: `Bearer ${opts.apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({ from: opts.from, to: [mail.to], subject, text }),
      });
      if (!res.ok) {
        opts.log.error({ status: res.status, template: mail.template }, "mail.send.failed");
        throw new Error(`mail transport failed: ${String(res.status)}`);
      }
      opts.log.info({ template: mail.template, locale: mail.locale }, "mail.sent");
    },
  };
}

/** The transport the configuration names; console unless a real one is fully configured. */
export function selectMailer(config: Config, log: Logger): Mailer {
  if (config.MAIL_TRANSPORT === "resend" && config.RESEND_API_KEY)
    return resendMailer({
      apiKey: config.RESEND_API_KEY,
      from: config.MAIL_FROM,
      appUrl: config.NEXT_PUBLIC_APP_URL,
      log,
    });
  if (config.MAIL_TRANSPORT !== "console")
    log.warn({ transport: config.MAIL_TRANSPORT }, "mail.transport.unconfigured: using console");
  return consoleMailer(log);
}
