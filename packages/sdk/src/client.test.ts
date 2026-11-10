import { describe, expect, it } from "vitest";
import { ApiError, createClient } from "./index.js";

describe("sdk client", () => {
  it("sends bearer, org header and JSON, and maps problems to ApiError", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fake: typeof fetch = async (input, init) => {
      const url = input instanceof Request ? input.url : input.toString();
      calls.push({ url, init: init ?? {} });
      if (url.includes("/properties"))
        return new Response(JSON.stringify([{ id: "p1" }]), { status: 200 });
      return new Response(JSON.stringify({ status: 403, detail: "no", missing: "ari:read" }), {
        status: 403,
      });
    };
    const c = createClient({ baseUrl: "https://pms.example", token: "t", orgId: "o", fetch: fake });
    expect(await c.properties.list()).toEqual([{ id: "p1" }]);
    expect((calls[0]!.init.headers as Record<string, string>).authorization).toBe("Bearer t");
    expect((calls[0]!.init.headers as Record<string, string>)["x-pms-org"]).toBe("o");
    await expect(
      c.ari.grid({ from: "2026-10-01", to: "2026-10-02", propertyIds: ["a", "b"] }),
    ).rejects.toBeInstanceOf(ApiError);
    expect(calls[1]!.url).toContain("propertyId=a&propertyId=b");
  });

  it("speaks the day-to-day operations with an API key, which carries its own organization", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fake: typeof fetch = async (input, init) => {
      calls.push({
        url: input instanceof Request ? input.url : input.toString(),
        init: init ?? {},
      });
      return new Response(JSON.stringify({ applied: true }), { status: 200 });
    };
    const key = `otab_${"a".repeat(40)}`;
    const c = createClient({ baseUrl: "https://pms.example", token: key, orgId: "o", fetch: fake });
    await c.ari.setPrices({
      propertyId: "p",
      firstNight: "2026-12-01",
      lastNight: "2026-12-03",
      priceMinor: 12000,
    });
    await c.conversations.list({ filter: "needs_reply", limit: 5 });
    await c.conversations.send("t1", "p", "Hello");
    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers.authorization).toBe(`Bearer ${key}`);
    expect(headers["x-pms-org"]).toBeUndefined();
    expect(calls[0]!.init.method).toBe("PUT");
    expect(calls[0]!.url).toBe("https://pms.example/api/v1/ari/prices");
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({
      propertyId: "p",
      firstNight: "2026-12-01",
      lastNight: "2026-12-03",
      priceMinor: 12000,
    });
    expect(calls[1]!.url).toBe(
      "https://pms.example/api/v1/conversations?filter=needs_reply&limit=5",
    );
    expect(calls[2]!.url).toBe("https://pms.example/api/v1/conversations/t1/messages");
    expect(JSON.parse(calls[2]!.init.body as string)).toEqual({ propertyId: "p", text: "Hello" });
  });
});
