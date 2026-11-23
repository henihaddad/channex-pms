import { describe, expect, it } from "vitest";
import { createTranslator } from "next-intl";
import en from "../../../messages/en.json";
import fr from "../../../messages/fr.json";
import ar from "../../../messages/ar.json";

type Tree = { [k: string]: string | Tree };
const leaves = (t: Tree, p = ""): string[] =>
  Object.entries(t).flatMap(([k, v]) =>
    typeof v === "string" ? [`${p}${k}`] : leaves(v, `${p}${k}.`),
  );

/** Every inbox and reservations message parses as ICU and formats, in every console language. */
describe("inbox and reservations messages", () => {
  const values = {
    n: 3,
    nights: 2,
    hours: 2,
    minutes: 5,
    name: "Ana",
    channel: "Airbnb",
    state: "closed",
    dates: "24 Nov",
  };
  for (const [locale, messages] of [
    ["en", en],
    ["fr", fr],
    ["ar", ar],
  ] as const) {
    it(`formats in ${locale}`, () => {
      const errors: string[] = [];
      const t = createTranslator({
        locale,
        messages: messages as never,
        onError: (e) => errors.push(e.message),
        getMessageFallback: ({ key }) => key,
      }) as unknown as (key: string, v?: Record<string, string | number>) => string;
      for (const ns of ["inbox", "reservations"] as const)
        for (const key of leaves((messages as unknown as Record<string, Tree>)[ns]!, `${ns}.`))
          t(key, values);
      // values a message does not name are fine; a syntax error or a missing branch is not
      expect(errors.filter((e) => !/FORMATTING_ERROR.*not provided/i.test(e))).toEqual([]);
    });
  }
});
