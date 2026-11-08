import type { Crypto } from "@pms/core";

/** The iCal link's secret part: a hash of the property's webhook token, so the token itself never leaves. */
export const icalToken = (crypto: Crypto, webhookToken: string): string =>
  crypto.sha256Hex(`ical:${webhookToken}`).slice(0, 40);

export const icalPath = (propertyId: string, token: string): string =>
  `/api/v1/ical/${propertyId}/${token}.ics`;
