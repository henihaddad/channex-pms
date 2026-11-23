import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import fr from "../../messages/fr.json";
import ar from "../../messages/ar.json";
import { authErrorFor, FIELD_ERROR } from "./auth-errors";

describe("authErrorFor", () => {
  it("puts a sign-up conflict on its field", () => {
    expect(authErrorFor("identity.slug_taken")).toEqual({ key: "slugTaken", field: "slug" });
    expect(authErrorFor("identity.email_taken")).toEqual({ key: "emailTaken", field: "email" });
    expect(authErrorFor("identity.weak_password")).toEqual({
      key: "passwordShort",
      field: "password",
    });
  });

  it("keeps a sign-in failure at the top of the form", () => {
    expect(authErrorFor("identity.invalid_credentials")).toEqual({ key: "credentialsInvalid" });
    expect(authErrorFor("identity.totp_invalid")).toEqual({ key: "codeInvalid" });
  });

  it("never shows a code it does not know", () => {
    expect(authErrorFor("identity.something_new")).toEqual({ key: "generic" });
    expect(authErrorFor("")).toEqual({ key: "generic" });
  });

  it("has a message for every key in every language we ship", () => {
    const keys = new Set([
      "generic",
      "passwordWrong",
      ...Object.values(FIELD_ERROR),
      ...[
        "identity.email_taken",
        "identity.slug_taken",
        "identity.invalid_credentials",
        "identity.locked",
        "identity.challenge_invalid",
        "identity.totp_invalid",
        "identity.invitation_invalid",
        "identity.session_invalid",
      ].map((c) => authErrorFor(c).key),
    ]);
    for (const messages of [en, fr, ar]) {
      const errors = messages.auth.errors as Record<string, string>;
      for (const k of keys) expect(errors[k], k).toBeTruthy();
    }
  });
});
