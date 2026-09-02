import type { Mailer } from "@pms/core";
import type { Logger } from "pino";

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
