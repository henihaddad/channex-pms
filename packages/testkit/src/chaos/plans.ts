import type { FaultPlan } from "@pms/connectivity";

/** The failures that matter (spec 15 M1). Probabilities are per call. */
export const STORM: FaultPlan["rules"] = [
  { op: "push", probability: 0.15, fault: "429" },
  { op: "push", probability: 0.05, fault: "5xx" },
  { op: "push.restrictions", probability: 0.05, fault: "partial_422" },
  { op: "feed", probability: 0.1, fault: "timeout" },
  { op: "ack", probability: 0.15, fault: "5xx" },
  { op: "webhook.deliver", probability: 0.2, fault: "duplicate_webhook" },
  { op: "webhook.deliver", probability: 0.15, fault: "drop_webhook" },
  { op: "webhook.order", probability: 0.5, fault: "reorder_webhooks" },
  { op: "booking.emit", probability: 0.05, fault: "unmapped_booking" },
];
