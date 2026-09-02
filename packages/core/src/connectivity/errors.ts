/**
 * Provider error taxonomy (spec 05 §5.10). Each class maps to a metric, a log
 * shape, a plain-language user message and a runbook entry.
 */
export type ProviderErrorKind =
  | "auth"
  | "authorization"
  | "validation"
  | "partial"
  | "throttle"
  | "transient"
  | "mapping"
  | "channel"
  | "contract";

export class ProviderError extends Error {
  constructor(
    readonly kind: ProviderErrorKind,
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "ProviderError";
  }

  /** Whether the pipeline should retry the same call later. */
  get retryable(): boolean {
    return this.kind === "throttle" || this.kind === "transient";
  }
}

export class AuthError extends ProviderError {
  constructor(message = "Provider rejected the API key") {
    super("auth", message);
  }
}
export class AuthorizationError extends ProviderError {
  constructor(message = "Provider permission missing", details?: Record<string, unknown>) {
    super("authorization", message, details);
  }
}
export class ValidationError extends ProviderError {
  constructor(message: string, details?: Record<string, unknown>) {
    super("validation", message, details);
  }
}
export class ThrottleError extends ProviderError {
  constructor(readonly retryAfterMs?: number) {
    super("throttle", "Provider rate limit exceeded", { retryAfterMs });
  }
}
export class TransientError extends ProviderError {
  constructor(message: string, details?: Record<string, unknown>) {
    super("transient", message, details);
  }
}
export class ContractError extends ProviderError {
  constructor(message: string, details?: Record<string, unknown>) {
    super("contract", message, details);
  }
}
