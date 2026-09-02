// Shared helpers for the k6 scenarios (spec 13 §13.7 budgets).
export const BASE = __ENV.BASE_URL || "http://localhost:3100";
export const ORG = __ENV.ORG_ID || "";
export function authHeaders(token) {
  return {
    headers: {
      authorization: `Bearer ${token}`,
      "x-pms-org": ORG,
      "content-type": "application/json",
    },
  };
}
export function login(http, email, password) {
  const r = http.post(`${BASE}/api/v1/auth/login`, JSON.stringify({ email, password }), {
    headers: { "content-type": "application/json" },
  });
  return r.status === 200 ? r.json("accessToken") : "";
}
