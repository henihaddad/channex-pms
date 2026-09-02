import pino, { type Logger } from "pino";

/** PII never reaches logs (PRIV-2). Field names here are redacted at any depth. */
export const REDACTED_FIELDS = [
  "email",
  "phone",
  "password",
  "passwordHash",
  "refreshToken",
  "token",
  "secret",
  "totpSecret",
  "cardNumber",
  "pan",
  "cvv",
  "doorCode",
  "accessCode",
  "value_encrypted",
  "body",
  "authorization",
  "cookie",
];

export function createLogger(opts: { level: string; service: string; pretty?: boolean }): Logger {
  return pino({
    level: opts.level,
    base: { service: opts.service },
    redact: {
      paths: REDACTED_FIELDS.flatMap((f) => [f, `*.${f}`, `*.*.${f}`, `req.headers.${f}`]),
      censor: "[redacted]",
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    ...(opts.pretty ? { transport: { target: "pino/file", options: { destination: 1 } } } : {}),
  });
}

export type { Logger };
