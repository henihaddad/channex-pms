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
});
