/** Realtime channel names (spec 04 §4.5): `org:{id}:property:{id}:{topic}`. */
export const realtimeChannel = (
  orgId: string,
  propertyId: string,
  topic: "ari" | "presence",
): string => `org:${orgId}:property:${propertyId}:${topic}`;

export interface RealtimePublisher {
  publish(channel: string, message: string): Promise<unknown>;
}

export interface AriRealtimeMessage {
  type: "ari.synced" | "ari.changed";
  orgId: string;
  propertyId: string;
  at: string;
}

export async function publishAri(
  pub: RealtimePublisher | null,
  msg: AriRealtimeMessage,
): Promise<void> {
  if (!pub) return;
  await pub.publish(realtimeChannel(msg.orgId, msg.propertyId, "ari"), JSON.stringify(msg));
}
