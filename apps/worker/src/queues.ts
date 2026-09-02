/**
 * Queue names are the contract between web (producers) and worker (consumers).
 * Per-property serialisation for ARI pushes (spec 05) arrives with M1; for now
 * only the system queue exists so the process shape is real from day one.
 */
export const QUEUES = {
  system: "system",
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

export type SystemJob = { name: "heartbeat"; data: { at: string } };
