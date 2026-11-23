"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { buttonClasses, type ButtonSize, type ButtonVariant } from "./button";
import { cn } from "./cn";

/**
 * The submit button of a server-action form. While the action runs it is disabled (no double
 * submit: a guest message sent twice cannot be unsent) and says so, as `pendingLabel` or the label
 * with an ellipsis (Nielsen #1, "Saving…").
 */
export function SubmitButton({
  children,
  pendingLabel,
  variant = "primary",
  size = "md",
  className,
  fullWidth,
  disabled,
  name,
  value,
  formAction,
  testId,
  "aria-label": ariaLabel,
}: {
  children: ReactNode;
  pendingLabel?: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  fullWidth?: boolean;
  disabled?: boolean;
  name?: string;
  value?: string;
  formAction?: (fd: FormData) => void | Promise<void>;
  testId?: string;
  "aria-label"?: string;
}) {
  const { pending } = useFormStatus();
  const label = pending
    ? (pendingLabel ?? (typeof children === "string" ? `${children}…` : children))
    : children;
  return (
    <button
      type="submit"
      name={name}
      value={value}
      formAction={formAction}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      aria-label={ariaLabel}
      data-testid={testId}
      className={buttonClasses(variant, size, className, fullWidth)}
    >
      {label}
    </button>
  );
}

/**
 * A destructive submit that asks first (Nielsen #5): the trigger opens a native modal dialog that
 * names the object and the consequence, with specific buttons ("Cancel reservation" / "Keep it").
 * Place it inside the action's <form>; the dialog's confirm button submits that form. The native
 * dialog traps focus, closes on Escape and returns focus to the trigger.
 */
export function ConfirmSubmit({
  children,
  title,
  body,
  confirmLabel,
  cancelLabel,
  pendingLabel,
  variant = "danger",
  size = "sm",
  className,
  testId,
  name,
  value,
  "aria-label": ariaLabel,
}: {
  /** The trigger's text. */
  children: ReactNode;
  title: ReactNode;
  body?: ReactNode;
  confirmLabel: ReactNode;
  cancelLabel: ReactNode;
  pendingLabel?: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  testId?: string;
  name?: string;
  value?: string;
  "aria-label"?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const bodyId = useId();
  const { pending } = useFormStatus();
  useEffect(() => {
    if (!pending) return;
    ref.current?.close();
  }, [pending]);
  return (
    <>
      <button
        type="button"
        onClick={() => ref.current?.showModal()}
        disabled={pending}
        aria-busy={pending || undefined}
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        data-testid={testId}
        className={buttonClasses(variant, size, className)}
      >
        {pending && pendingLabel ? pendingLabel : children}
      </button>
      <dialog
        ref={ref}
        aria-labelledby={titleId}
        aria-describedby={body ? bodyId : undefined}
        className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-card border border-border bg-surface p-5 text-foreground shadow-float backdrop:bg-foreground/40"
      >
        <p id={titleId} className="font-display text-lg font-bold">
          {title}
        </p>
        {body ? (
          <div id={bodyId} className="mt-2 text-sm leading-relaxed text-muted">
            {body}
          </div>
        ) : null}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            autoFocus
            onClick={() => ref.current?.close()}
            className={buttonClasses("secondary", "md")}
          >
            {cancelLabel}
          </button>
          <button
            type="submit"
            name={name}
            value={value}
            data-testid={testId ? `${testId}-confirm` : undefined}
            className={buttonClasses(
              variant === "danger" ? "primary" : variant,
              "md",
              cn(variant === "danger" && "bg-danger hover:bg-danger/90"),
            )}
          >
            {confirmLabel}
          </button>
        </div>
      </dialog>
    </>
  );
}

/**
 * Say something to screen-reader users without moving focus (WCAG 4.1.3): the one polite live
 * region the root layout mounts. Clearing first makes a repeated message announce again.
 */
export function announce(message: string): void {
  const el = typeof document === "undefined" ? null : document.getElementById("pms-announcer");
  if (!el) return;
  el.textContent = "";
  window.setTimeout(() => {
    el.textContent = message;
  }, 50);
}
