// Reservation list, grid and dashboard reads under the spec 13 §13.7 budgets.
import http from "k6/http";
import { check, sleep } from "k6";
import { BASE, authHeaders, login } from "./common.js";

export const options = {
  scenarios: { reads: { executor: "constant-vus", vus: 20, duration: __ENV.DURATION || "2m" } },
  thresholds: {
    "http_req_duration{name:reservations}": ["p(95)<500"],
    "http_req_duration{name:grid}": ["p(95)<1000"],
    "http_req_duration{name:dashboard}": ["p(95)<2000"],
    http_req_failed: ["rate<0.01"],
  },
};
export function setup() {
  return { token: login(http, __ENV.EMAIL, __ENV.PASSWORD) };
}
export default function (data) {
  const h = authHeaders(data.token);
  check(
    http.get(`${BASE}/api/v1/reservations?limit=50`, { ...h, tags: { name: "reservations" } }),
    { "reservations 200": (r) => r.status === 200 },
  );
  check(
    http.get(`${BASE}/api/v1/ari/grid?from=2026-10-01&to=2026-10-30`, {
      ...h,
      tags: { name: "grid" },
    }),
    { "grid 200": (r) => r.status === 200 },
  );
  check(http.get(`${BASE}/`, { ...h, tags: { name: "dashboard" } }), {
    "dashboard ok": (r) => r.status === 200,
  });
  sleep(1);
}
