import { DomainError, err, ok, type Result } from "../shared/result.js";
import type { ConnectionEvent, ConnectionState } from "./types.js";

const TRANSITIONS: Record<ConnectionState, Partial<Record<ConnectionEvent, ConnectionState>>> = {
  draft: { test_ok: "testing", test_failed: "draft", removed: "removed" },
  testing: { mappings_saved: "mapped", test_failed: "draft", removed: "removed" },
  mapped: {
    readiness_ok: "mapped",
    readiness_failed: "mapped",
    activated: "active",
    mappings_saved: "mapped",
    removed: "removed",
  },
  active: {
    paused: "paused",
    provider_error: "error",
    mappings_saved: "active",
    readiness_ok: "active",
    readiness_failed: "error",
    removed: "removed",
  },
  paused: { resumed: "active", mappings_saved: "paused", removed: "removed" },
  error: {
    recovered: "active",
    readiness_ok: "active",
    paused: "paused",
    mappings_saved: "error",
    readiness_failed: "error",
    provider_error: "error",
    removed: "removed",
  },
  removed: {},
};

/**
 * The connection state machine. Activation is only reachable from `mapped`
 * (CH-4); pausing stops inventory updates, not selling (CH-8), so `paused`
 * resumes straight to `active` without re-testing.
 */
export function transition(
  state: ConnectionState,
  event: ConnectionEvent,
): Result<ConnectionState> {
  const next = TRANSITIONS[state][event];
  if (!next)
    return err(new DomainError("channel.transition", `cannot ${event} a ${state} connection`));
  return ok(next);
}

export const canPush = (s: ConnectionState): boolean => s === "active";
