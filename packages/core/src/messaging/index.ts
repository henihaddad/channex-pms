export * from "./types.js";
export { assertSendable, toOutbound, isNote, NoteNeverSentError } from "./guard.js";
export {
  firstResponseDue,
  slaState,
  matchesView,
  medianFirstResponseMinutes,
  type SlaState,
} from "./sla.js";
export { interpolate, pickVariant, promotionalWarnings, TEMPLATE_VARIABLES } from "./templates.js";
export {
  guardAutomation,
  inQuietHours,
  nextAllowed,
  scheduledAt,
  ruleApplies,
  DEFAULT_LIMITS,
  type GuardDecision,
  type BookingForAutomation,
} from "./automation.js";
export { parseInquiry, type InquiryCard } from "./inquiry.js";
export { channelCapabilities, providerCode } from "./capabilities.js";
