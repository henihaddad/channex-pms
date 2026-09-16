import type { ConnectionState } from "./types.js";

export type Severity = "info" | "p2" | "p1";

/** CH-7: every alert names the property, the channel, the consequence and the next action. */
export interface Alert {
  severity: Severity;
  title: string;
  consequence: string;
  action: string;
}

export interface EventContext {
  propertyTitle: string;
  channelTitle: string;
  detail?: string;
  deadline?: string;
}

export function describeChannelEvent(type: string, ctx: EventContext): Alert {
  const where = `${ctx.propertyTitle} on ${ctx.channelTitle}`;
  switch (type) {
    case "disconnect_channel":
    case "disconnect_listing":
      return {
        severity: "p1",
        title: `${where} is disconnected`,
        consequence: "You are not selling on this channel until it is reconnected.",
        action: "Reconnect the channel.",
      };
    case "channel_removal_warning":
    case "property_removal_warning":
      return {
        severity: "p1",
        title: `${where} will be removed${ctx.deadline ? ` on ${ctx.deadline}` : ""}`,
        consequence: "The channel will drop the listing and stop selling it.",
        action: ctx.detail ?? "Complete the action the channel requires before the deadline.",
      };
    case "credentials_invalid":
    case "oauth_expired":
      return {
        severity: "p1",
        title: `${where}: credentials rejected`,
        consequence:
          "Rates and availability are no longer reaching the channel; the push queue for it is paused.",
        action: "Reconnect with valid credentials.",
      };
    case "rate_error":
      return {
        severity: "p2",
        title: `${where}: rate rejected`,
        consequence:
          ctx.detail ??
          "The channel refused a rate; the affected dates keep their previous price there.",
        action: "Fix the rate (often below the channel minimum) and it re-syncs automatically.",
      };
    case "messages_app_missing":
      // CXMSG-1: a silent empty inbox is a support ticket, so the gap is named with its remedy
      return {
        severity: "p2",
        title: `Messages are not enabled for ${ctx.propertyTitle} on ${ctx.channelTitle}`,
        consequence:
          "Guest conversations from Airbnb, Booking.com and Expedia are not reaching the inbox.",
        action:
          "In Channex, open the property's Applications and install Channex Messages; conversations appear within two minutes.",
      };
    case "readiness_regression":
      return {
        severity: "p2",
        title: `${where}: mapping gaps`,
        consequence: ctx.detail ?? "Some inventory is no longer mapped and will not sell.",
        action: "Open the mapping screen and close the listed gaps.",
      };
    case "drift":
      return {
        severity: "p2",
        title: `${where}: channel differs from our calendar`,
        consequence: ctx.detail ?? "Some cells on the channel do not match what we hold.",
        action: "Force a resync; the affected cells are re-pushed.",
      };
    case "sync_warning":
      return {
        severity: "info",
        title: `${where}: sync warning`,
        consequence: ctx.detail ?? "The channel accepted the push with a warning.",
        action: "No action needed unless it repeats.",
      };
    default:
      return {
        severity: "info",
        title: `${where}: ${type.replace(/_/g, " ")}`,
        consequence: ctx.detail ?? "Informational event from the channel.",
        action: "None.",
      };
  }
}

export interface ConnectionHealth {
  id: string;
  state: ConnectionState;
  ready: boolean;
  failedCells: number;
  pendingCells: number;
  openP1: number;
  openP2: number;
  lastPushAt: string | null;
}

/** Worst first (spec 07 §7.4): the only thing a manager wants on this page is "what is broken". */
export function healthScore(h: ConnectionHealth): number {
  let s = 0;
  if (h.state === "error") s += 1000;
  if (h.state === "paused") s += 100;
  if (!h.ready) s += 500;
  s +=
    h.openP1 * 200 +
    h.openP2 * 50 +
    Math.min(h.failedCells, 100) * 2 +
    Math.min(h.pendingCells, 100) / 10;
  return s;
}

export function sortWorstFirst<T extends ConnectionHealth>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => healthScore(b) - healthScore(a) || a.id.localeCompare(b.id));
}
