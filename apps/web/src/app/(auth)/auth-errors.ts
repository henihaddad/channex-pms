/**
 * The UI side of the identity errors (spec 02 §2.6): a stable code from the identity service
 * becomes a message key under `auth.errors`, and the field it belongs to when it is about one
 * field. Codes are never shown; a code this table does not know reads as `generic`.
 */

export type AuthErrorKey =
  | "generic"
  | "emailInvalid"
  | "emailTaken"
  | "passwordShort"
  | "passwordWrong"
  | "nameRequired"
  | "organizationRequired"
  | "slugInvalid"
  | "slugTaken"
  | "countryRequired"
  | "currencyRequired"
  | "credentialsInvalid"
  | "locked"
  | "challengeExpired"
  | "codeInvalid"
  | "invitationInvalid"
  | "sessionExpired";

/** A sign-up or invitation field a server error can point at. */
export type AuthField =
  "email" | "password" | "name" | "organizationName" | "slug" | "country" | "currency";

const BY_CODE: Record<string, { key: AuthErrorKey; field?: AuthField }> = {
  "identity.email_taken": { key: "emailTaken", field: "email" },
  "identity.slug_taken": { key: "slugTaken", field: "slug" },
  "identity.weak_password": { key: "passwordShort", field: "password" },
  "identity.invalid_credentials": { key: "credentialsInvalid" },
  "identity.locked": { key: "locked" },
  "identity.challenge_invalid": { key: "challengeExpired" },
  "identity.totp_invalid": { key: "codeInvalid" },
  "identity.invitation_invalid": { key: "invitationInvalid" },
  "identity.session_invalid": { key: "sessionExpired" },
  "identity.session_device_mismatch": { key: "sessionExpired" },
  unauthenticated: { key: "sessionExpired" },
};

/** The message key (and field) for an identity error code. */
export function authErrorFor(code: string): { key: AuthErrorKey; field?: AuthField } {
  return BY_CODE[code] ?? { key: "generic" };
}

/** The message key for a sign-up field that failed validation. */
export const FIELD_ERROR: Record<AuthField, AuthErrorKey> = {
  email: "emailInvalid",
  password: "passwordShort",
  name: "nameRequired",
  organizationName: "organizationRequired",
  slug: "slugInvalid",
  country: "countryRequired",
  currency: "currencyRequired",
};
