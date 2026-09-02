// Booking webhook storm: 500 bookings/day peaks compressed into minutes; the receiver must answer under 100 ms and never lose one.
import http from "k6/http";
import { check } from "k6";
import { BASE } from "./common.js";

export const options = {
  scenarios: {
    storm: {
      executor: "constant-arrival-rate",
      rate: 50,
      timeUnit: "1s",
      duration: __ENV.DURATION || "1m",
      preAllocatedVUs: 20,
    },
  },
  thresholds: { http_req_duration: ["p(95)<100"], http_req_failed: ["rate<0.001"] },
};
export default function () {
  const id = `${__VU}-${__ITER}-${Date.now()}`;
  const body = JSON.stringify({
    event: "booking",
    payload: { booking_id: `k6-${id}`, revision_id: `rev-${id}` },
    timestamp: new Date().toISOString(),
  });
  const r = http.post(`${BASE}/webhooks/channex/${__ENV.WEBHOOK_TOKEN}`, body, {
    headers: { "content-type": "application/json" },
  });
  check(r, { accepted: (x) => x.status === 200 || x.status === 202 });
}
