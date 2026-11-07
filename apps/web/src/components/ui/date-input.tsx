import { cn } from "./cn";
import { controlClasses } from "./controls";

/**
 * A date field that submits an ISO date (YYYY-MM-DD) under `name`. The native
 * control: every browser ships a picker, it needs no JavaScript, it reads the
 * user's locale, and a server component can render it. Values are strings.
 */
export function DateInput({
  name,
  label,
  defaultValue,
  min,
  max,
  required,
  disabled,
  className,
  testId,
  "aria-label": ariaLabel,
}: {
  name: string;
  label?: string;
  defaultValue?: string | null;
  min?: string | null;
  max?: string | null;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  testId?: string;
  "aria-label"?: string;
}) {
  const id = `date-${name}`;
  const input = (
    <input
      id={id}
      type="date"
      name={name}
      defaultValue={defaultValue?.slice(0, 10) ?? undefined}
      min={min?.slice(0, 10) ?? undefined}
      max={max?.slice(0, 10) ?? undefined}
      required={required}
      disabled={disabled}
      aria-label={label ? undefined : (ariaLabel ?? name)}
      data-testid={testId ?? id}
      className={cn(controlClasses, "tabular-nums", !label && className)}
    />
  );
  if (!label) return input;
  return (
    <label className={cn("flex w-full flex-col gap-1.5 text-sm font-semibold", className)}>
      {label}
      {input}
    </label>
  );
}
