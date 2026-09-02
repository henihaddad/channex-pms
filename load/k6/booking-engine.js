// The booking funnel: search → hold, mobile-sized pages, LCP proxy through TTFB.
import http from "k6/http";
import { check, sleep } from "k6";
import { BASE } from "./common.js";

export const options = {
  scenarios: {
    guests: {
      executor: "ramping-vus",
      startVUs: 1,
      stages: [
        { duration: "30s", target: 20 },
        { duration: __ENV.DURATION || "1m", target: 20 },
      ],
    },
  },
  thresholds: {
    "http_req_duration{name:storefront}": ["p(95)<800"],
    "http_req_duration{name:property}": ["p(95)<800"],
    http_req_failed: ["rate<0.01"],
  },
};
export default function () {
  check(
    http.get(`${BASE}/book?arrival=2026-10-10&departure=2026-10-12&adults=2`, {
      tags: { name: "storefront" },
    }),
    { "storefront 200": (r) => r.status === 200 },
  );
  if (__ENV.PROPERTY_ID)
    check(
      http.get(
        `${BASE}/book/${__ENV.PROPERTY_ID}?arrival=2026-10-10&departure=2026-10-12&adults=2`,
        { tags: { name: "property" } },
      ),
      { "property 200": (r) => r.status === 200 },
    );
  sleep(2);
}
