import type { ComponentProps, ReactNode } from "react";
import { Children, isValidElement } from "react";
import NextLink from "next/link";
import { cn } from "./cn";
import { buttonClasses, type ButtonSize, type ButtonVariant } from "./button";
import { controlClasses, controlHeight } from "./controls";
import { DateInput as DateInputField } from "./date-input";

/**
 * The OTAbridge kit (ADR-0011). Every component is ours: native elements,
 * Tailwind classes, the tokens in globals.css. Pages import from here and
 * never from a component library, so the look is decided in one place and a
 * server component can render every piece. Props are strings, booleans and
 * elements; the few interactive pieces (tabs, dialogs, the palette) live in
 * their own client files and are re-exported at the bottom.
 */

export { cn };
export { buttonClasses };
export { DateInput } from "./date-input";

// ---------------------------------------------------------------- buttons

export function Button({
  variant = "primary",
  size = "md",
  disabled,
  fullWidth,
  className,
  type = "button",
  children,
  ...rest
}: Omit<ComponentProps<"button">, "children"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  children?: ReactNode;
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      className={buttonClasses(variant, size, className, fullWidth)}
      {...rest}
    >
      {children}
    </button>
  );
}

/** A link that looks like a button (client-side navigation, no JavaScript of its own). */
export function LinkButton({
  variant = "secondary",
  size = "md",
  fullWidth,
  className,
  ...rest
}: ComponentProps<typeof NextLink> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
}) {
  return <NextLink className={buttonClasses(variant, size, className, fullWidth)} {...rest} />;
}

/** A plain anchor that looks like a button, for downloads and API links. */
export function AnchorButton({
  variant = "secondary",
  size = "md",
  fullWidth,
  className,
  ...rest
}: ComponentProps<"a"> & { variant?: ButtonVariant; size?: ButtonSize; fullWidth?: boolean }) {
  return <a className={buttonClasses(variant, size, className, fullWidth)} {...rest} />;
}

// ---------------------------------------------------------------- fields

export function Input({
  className,
  variant,
  ...props
}: ComponentProps<"input"> & { variant?: "primary" | "secondary" }) {
  return (
    <input
      className={cn(
        controlClasses,
        controlHeight.md,
        variant === "secondary" && "bg-surface-secondary",
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({ className, rows = 4, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      rows={rows}
      className={cn(controlClasses, "resize-y py-2.5 leading-relaxed", className)}
      {...props}
    />
  );
}

export function Label({
  children,
  htmlFor,
  className,
}: {
  children: ReactNode;
  htmlFor?: string;
  className?: string;
}) {
  return (
    <label htmlFor={htmlFor} className={cn("text-sm font-semibold text-foreground", className)}>
      {children}
    </label>
  );
}

export function Description({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("text-xs text-muted", className)}>{children}</p>;
}

export function FieldError({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p role="alert" className={cn("text-xs font-medium text-danger", className)}>
      {children}
    </p>
  );
}

export function Separator({ className }: { className?: string }) {
  return <hr className={cn("border-0 border-t border-border", className)} />;
}

/** Label + input + optional hint and error, the one way a form field is built. */
export function Field({
  label,
  name,
  type = "text",
  required = true,
  autoComplete,
  placeholder,
  defaultValue,
  description,
  error,
  className,
  min,
  max,
  step,
  disabled,
  readOnly,
  testId,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  autoComplete?: string;
  placeholder?: string;
  defaultValue?: string | number | null;
  description?: ReactNode;
  error?: ReactNode;
  className?: string;
  min?: string | number;
  max?: string | number;
  step?: string | number;
  disabled?: boolean;
  readOnly?: boolean;
  testId?: string;
}) {
  if (type === "date")
    return (
      <DateInputField
        label={label}
        name={name}
        defaultValue={defaultValue == null ? null : String(defaultValue)}
        min={min == null ? null : String(min)}
        max={max == null ? null : String(max)}
        required={required}
        disabled={disabled}
        className={className}
        testId={testId}
      />
    );
  const id = `field-${name}`;
  return (
    <div className={cn("flex w-full flex-col gap-1.5", className)}>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={name}
        type={type}
        required={required}
        disabled={disabled}
        readOnly={readOnly}
        aria-invalid={error ? true : undefined}
        defaultValue={defaultValue == null ? undefined : String(defaultValue)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        min={min}
        max={max}
        step={step}
        data-testid={testId}
      />
      {description ? <Description>{description}</Description> : null}
      {error ? <FieldError>{error}</FieldError> : null}
    </div>
  );
}

/** Label + textarea. */
export function TextareaField({
  label,
  name,
  required = false,
  placeholder,
  defaultValue,
  description,
  rows = 4,
  className,
}: {
  label: string;
  name: string;
  required?: boolean;
  placeholder?: string;
  defaultValue?: string | null;
  description?: ReactNode;
  rows?: number;
  className?: string;
}) {
  const id = `field-${name}`;
  return (
    <div className={cn("flex w-full flex-col gap-1.5", className)}>
      <Label htmlFor={id}>{label}</Label>
      <Textarea
        id={id}
        name={name}
        required={required}
        defaultValue={defaultValue ?? undefined}
        placeholder={placeholder}
        rows={rows}
      />
      {description ? <Description>{description}</Description> : null}
    </div>
  );
}

type OptionLike = { value: string; label: ReactNode; disabled?: boolean };

function optionsFromChildren(children: ReactNode): OptionLike[] {
  const out: OptionLike[] = [];
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    const p = child.props as {
      value?: string | number;
      children?: ReactNode;
      disabled?: boolean;
      label?: string;
    };
    if (child.type === "optgroup") {
      out.push(...optionsFromChildren(p.children));
      return;
    }
    const label = p.children ?? p.label ?? p.value ?? "";
    const value = p.value === undefined ? String(labelText(label)) : String(p.value);
    out.push({ value, label, disabled: p.disabled });
  });
  return out;
}

function labelText(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(labelText).join("");
  if (isValidElement(node)) return labelText((node.props as { children?: ReactNode }).children);
  return "";
}

const chevron = (
  <svg
    aria-hidden="true"
    viewBox="0 0 16 16"
    width="14"
    height="14"
    className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-muted"
  >
    <path
      d="M4 6l4 4 4-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/**
 * A select that accepts the same `<option>` children as the native element and
 * renders the native element, styled. Submits `name=value` with the form; the
 * first option is selected by default unless a placeholder is given. `onChange`
 * receives the value, not the event.
 */
export function Select({
  name,
  id,
  label,
  defaultValue,
  value,
  onChange,
  placeholder,
  required,
  disabled,
  className,
  size,
  options,
  children,
  "aria-label": ariaLabel,
  testId,
  form,
}: {
  name?: string;
  id?: string;
  label?: ReactNode;
  defaultValue?: string | number | null;
  value?: string | null;
  onChange?: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  size?: "sm" | "md";
  options?: OptionLike[];
  children?: ReactNode;
  "aria-label"?: string;
  testId?: string;
  form?: string;
}) {
  const items = options ?? optionsFromChildren(children);
  const selectId = id ?? (name ? `select-${name}` : undefined);
  const controlled = value !== undefined;
  const initial =
    defaultValue === undefined || defaultValue === null ? undefined : String(defaultValue);
  const select = (
    <div className={cn("relative", !label && className)}>
      <select
        id={selectId}
        name={name}
        form={form}
        required={required}
        disabled={disabled}
        aria-label={label ? undefined : (ariaLabel ?? name)}
        data-testid={testId}
        {...(controlled
          ? { value: value ?? "" }
          : { defaultValue: initial ?? (placeholder ? "" : undefined) })}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
        className={cn(
          controlClasses,
          size === "sm" ? controlHeight.sm : controlHeight.md,
          "appearance-none pe-9",
        )}
      >
        {placeholder ? (
          <option value="" disabled={required}>
            {placeholder}
          </option>
        ) : null}
        {items.map((i) => (
          <option key={i.value} value={i.value} disabled={i.disabled}>
            {labelText(i.label) || i.value}
          </option>
        ))}
      </select>
      {chevron}
    </div>
  );
  if (!label) return select;
  return (
    <div className={cn("flex w-full flex-col gap-1.5", className)}>
      <Label htmlFor={selectId}>{label}</Label>
      {select}
    </div>
  );
}

/** Label + select. */
export function SelectField(props: ComponentProps<typeof Select> & { label: ReactNode }) {
  return <Select {...props} />;
}

export function Checkbox({
  children,
  name,
  value,
  defaultChecked,
  className,
  disabled,
}: {
  children?: ReactNode;
  name?: string;
  value?: string;
  defaultChecked?: boolean;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <label
      className={cn(
        "inline-flex items-center gap-2.5 text-sm text-foreground",
        disabled && "opacity-60",
        className,
      )}
    >
      <input
        type="checkbox"
        name={name}
        value={value}
        defaultChecked={defaultChecked}
        disabled={disabled}
        className="h-4.5 w-4.5 shrink-0 rounded-md border-border accent-accent"
      />
      {children}
    </label>
  );
}

/** Controls laid out on one row that wraps; labels above, actions at the end. */
export function FormRow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex flex-wrap items-end gap-3", className)}>{children}</div>;
}

/** A form stacked vertically with the standard gap. */
export function FormStack({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex flex-col gap-4", className)}>{children}</div>;
}

// ---------------------------------------------------------------- surfaces

export function Card({
  children,
  className,
  title,
  description,
  actions,
  variant = "default",
  contentClassName,
  ...rest
}: Omit<ComponentProps<"div">, "title"> & {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  variant?: "default" | "secondary" | "tertiary" | "transparent";
  contentClassName?: string;
}) {
  // Layout utilities on a Card describe its content, not its frame.
  const layout =
    /^(sm:|md:|lg:|xl:)?(grid|flex|inline-flex|grid-cols-|gap-|items-|justify-|space-y-|space-x-|divide-|columns-)/;
  const own = (className ?? "").split(/\s+/).filter((c) => c && !layout.test(c));
  const inner = (className ?? "").split(/\s+/).filter((c) => c && layout.test(c));
  const frame = {
    default: "border border-border bg-surface",
    secondary: "border border-border bg-surface-secondary",
    tertiary: "bg-default",
    transparent: "",
  }[variant];
  return (
    <section className={cn("flex flex-col gap-4 rounded-card p-5", frame, own.join(" "))} {...rest}>
      {title || actions ? (
        <header className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            {title ? (
              <h2 className="font-sans text-base font-bold text-foreground">{title}</h2>
            ) : null}
            {description ? <p className="mt-0.5 text-sm text-muted">{description}</p> : null}
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </header>
      ) : null}
      <div className={cn(inner.length ? inner.join(" ") : "block", contentClassName)}>
        {children}
      </div>
    </section>
  );
}

export function PageTitle({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <h1
      className={cn(
        "font-display text-[1.875rem] leading-tight font-bold tracking-tight text-foreground",
        className,
      )}
    >
      {children}
    </h1>
  );
}

/** Title, optional description and the page's actions on one line. */
export function PageHeader({
  title,
  description,
  actions,
  crumb,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** A breadcrumb above the title, for pages inside a section (design: "Reservations / Ana Silva"). */
  crumb?: Array<{ href?: string; label: ReactNode }>;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-5">
      {crumb ? <Breadcrumbs items={crumb} className="-mb-2 text-[13px]" /> : null}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1.5">
          <PageTitle>{title}</PageTitle>
          {description ? <p className="max-w-[640px] text-sm text-muted">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      <SectionTabsSlot />
      {children}
    </div>
  );
}

/** Where this page sits: every crumb but the last is a link back up (Krug's trunk test). */
export function Breadcrumbs({
  items,
  className,
}: {
  items: Array<{ href?: string; label: ReactNode }>;
  className?: string;
}) {
  return (
    <nav aria-label="Breadcrumb" className={cn("text-sm text-muted", className)}>
      <ol className="flex flex-wrap items-center gap-1.5">
        {items.map((it, i) => (
          <li key={i} className="flex items-center gap-1.5">
            {i > 0 ? (
              <span aria-hidden="true" className="text-muted/60">
                /
              </span>
            ) : null}
            {it.href ? (
              <NextLink href={it.href} className="hover:text-foreground hover:underline">
                {it.label}
              </NextLink>
            ) : (
              <span className="text-foreground" aria-current="page">
                {it.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function SectionTitle({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <h2 className={cn("font-sans text-base font-bold text-foreground", className)}>{children}</h2>
  );
}

const alertTones = {
  error: "border-danger/30 bg-danger-soft text-danger-soft-foreground",
  success: "border-success/30 bg-success-soft text-success-soft-foreground",
  info: "border-accent/30 bg-accent-soft text-accent-soft-foreground",
  warning: "border-warning/30 bg-warning-soft text-warning-soft-foreground",
  default: "border-border bg-surface-secondary text-foreground",
} as const;

export function Alert({
  children,
  tone = "error",
  title,
  className,
  ...rest
}: Omit<ComponentProps<"div">, "title"> & {
  children?: ReactNode;
  tone?: keyof typeof alertTones;
  title?: ReactNode;
}) {
  return (
    <div
      role="alert"
      className={cn("rounded-control border px-4 py-3 text-sm", alertTones[tone], className)}
      {...rest}
    >
      {title ? <p className="font-semibold">{title}</p> : null}
      {children ? <div className={cn(title && "mt-0.5")}>{children}</div> : null}
    </div>
  );
}

type ChipColor = "default" | "accent" | "success" | "warning" | "danger";

const chipSoft: Record<ChipColor, string> = {
  default: "bg-default text-muted",
  accent: "bg-accent-soft text-accent-soft-foreground",
  success: "bg-success-soft text-success-soft-foreground",
  warning: "bg-warning-soft text-warning-soft-foreground",
  danger: "bg-danger-soft text-danger-soft-foreground",
};
const chipSolid: Record<ChipColor, string> = {
  default: "bg-foreground text-background",
  accent: "bg-accent text-accent-foreground",
  success: "bg-success text-white",
  warning: "bg-warning text-white",
  danger: "bg-danger text-white",
};

export function Chip({
  children,
  color = "default",
  variant = "soft",
  size = "md",
  className,
  ...rest
}: Omit<ComponentProps<"span">, "children"> & {
  children: ReactNode;
  color?: ChipColor;
  variant?: "soft" | "primary" | "secondary" | "tertiary";
  size?: "sm" | "md" | "lg";
}) {
  const look =
    variant === "primary"
      ? chipSolid[color]
      : variant === "secondary"
        ? cn("border border-current bg-transparent", chipSoft[color].split(" ")[1])
        : chipSoft[color];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full font-semibold whitespace-nowrap",
        size === "sm"
          ? "h-5 px-2 text-[11px]"
          : size === "lg"
            ? "h-7 px-3 text-sm"
            : "h-6 px-2.5 text-xs",
        look,
        className,
      )}
      {...rest}
    >
      {children}
    </span>
  );
}

/** The sync-state language: mint synced, sky in flight, amber attention, rose failed. */
export function StateChip({ state, children }: { state: string; children?: ReactNode }) {
  const color: ChipColor =
    /synced|live|paid|approved|active|confirmed|done|clean|verified|healthy|sent/.test(state)
      ? "success"
      : /pending|in_flight|syncing|draft|queued|new|hold|provisioning/.test(state)
        ? "accent"
        : /conflict|drift|attention|warning|expiring|snoozed|past_due|degraded/.test(state)
          ? "warning"
          : /fail|error|cancel|revoked|expired|suspended|breach|dirty|down/.test(state)
            ? "danger"
            : "default";
  return (
    <Chip color={color} size="sm">
      {children ?? state}
    </Chip>
  );
}

/**
 * A page with nothing in it yet says what the page is for and offers the one action
 * that fills it; `preview` shows the feature working, so an empty page reads as
 * "not started" rather than "broken".
 */
export function EmptyState({
  title,
  description,
  action,
  preview,
  className,
  ...rest
}: ComponentProps<"div"> & {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  preview?: ReactNode;
}) {
  if (preview)
    return (
      <div
        className={cn(
          "grid items-center gap-8 px-1 py-6 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]",
          className,
        )}
        {...rest}
      >
        <div>
          <p className="font-display text-xl font-bold text-foreground">{title}</p>
          {description ? (
            <p className="mt-2 text-sm leading-relaxed text-muted">{description}</p>
          ) : null}
          {action ? <div className="mt-4">{action}</div> : null}
        </div>
        <div
          className="rounded-card border border-border bg-surface-secondary p-4"
          aria-hidden="true"
        >
          {preview}
        </div>
      </div>
    );
  return (
    <div className={cn("flex flex-col items-start gap-1 px-1 py-4", className)} {...rest}>
      <p className="text-sm font-semibold text-foreground">{title}</p>
      {description ? <p className="text-sm text-muted">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

// ---------------------------------------------------------------- tables

/**
 * Tables are server-rendered markup: a bordered frame that scrolls sideways
 * when it must, a quiet header row, hairlines between rows. No client
 * JavaScript, so a list rendered once per request costs nothing more.
 */
export function Table({
  children,
  className,
  variant = "primary",
  dense,
  ...rest
}: ComponentProps<"table"> & { variant?: "primary" | "secondary"; dense?: boolean }) {
  return (
    <div
      className={cn(
        "overflow-x-auto rounded-card border border-border",
        variant === "secondary" ? "bg-surface-secondary" : "bg-surface",
      )}
    >
      <table
        className={cn(
          "w-full border-collapse text-sm text-foreground",
          dense ? "[&_td]:py-2 [&_th]:py-2" : "[&_td]:py-3.5 [&_th]:py-3",
          className,
        )}
        {...rest}
      >
        {children}
      </table>
    </div>
  );
}
export function THead({ children, className, ...rest }: ComponentProps<"thead">) {
  return (
    <thead className={cn("bg-surface-secondary text-xs text-muted", className)} {...rest}>
      {children}
    </thead>
  );
}
export function TBody({ children, className, ...rest }: ComponentProps<"tbody">) {
  return (
    <tbody className={cn("[&_tr:last-child_td]:border-b-0", className)} {...rest}>
      {children}
    </tbody>
  );
}
export function Tr({ children, className, ...rest }: ComponentProps<"tr">) {
  return (
    <tr className={cn("transition-colors hover:bg-surface-secondary/60", className)} {...rest}>
      {children}
    </tr>
  );
}
export function Th({ children, className, ...rest }: ComponentProps<"th">) {
  return (
    <th
      className={cn(
        "border-b border-border px-4 text-start font-semibold whitespace-nowrap",
        className,
      )}
      {...rest}
    >
      {children}
    </th>
  );
}
export function Td({ children, className, ...rest }: ComponentProps<"td">) {
  return (
    <td className={cn("border-b border-border/70 px-4 align-top", className)} {...rest}>
      {children}
    </td>
  );
}

type Column = string | { label: ReactNode; align?: "start" | "end" | "center"; className?: string };

/** Columns and rows in, a finished table out, with an empty state. */
export function DataTable({
  columns,
  rows,
  empty,
  rowKey,
  rowTestId,
  className,
  variant,
  dense,
  testId,
}: {
  columns: Column[];
  rows: ReactNode[][];
  empty?: ReactNode;
  rowKey?: (row: ReactNode[], index: number) => string;
  rowTestId?: string;
  className?: string;
  variant?: "primary" | "secondary";
  dense?: boolean;
  testId?: string;
}) {
  const cols = columns.map((c) => (typeof c === "string" ? { label: c } : c));
  const align = (a?: "start" | "end" | "center") =>
    a === "end" ? "text-end tabular-nums" : a === "center" ? "text-center" : "";
  return (
    <Table className={className} variant={variant} dense={dense} data-testid={testId}>
      <THead>
        <Tr className="hover:bg-transparent">
          {cols.map((c, i) => (
            <Th key={i} className={cn(align(c.align), c.className)}>
              {c.label}
            </Th>
          ))}
        </Tr>
      </THead>
      <TBody>
        {rows.length === 0 ? (
          <Tr>
            <Td colSpan={cols.length} className="text-muted">
              {empty ?? "—"}
            </Td>
          </Tr>
        ) : (
          rows.map((r, i) => (
            <Tr key={rowKey ? rowKey(r, i) : i} data-testid={rowTestId}>
              {r.map((cell, j) => (
                <Td key={j} className={cn(align(cols[j]?.align), cols[j]?.className)}>
                  {cell}
                </Td>
              ))}
            </Tr>
          ))
        )}
      </TBody>
    </Table>
  );
}

/** A definition list for facts about one thing: label on the left, value on the right. */
export function Facts({
  items,
  className,
}: {
  items: Array<[ReactNode, ReactNode]>;
  className?: string;
}) {
  return (
    <dl className={cn("grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5 text-sm", className)}>
      {items.map(([k, v], i) => (
        <div key={i} className="contents">
          <dt className="text-muted">{k}</dt>
          <dd className="min-w-0 text-foreground">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A big number with a small label, in its own card. */
export function Stat({
  label,
  value,
  hint,
  className,
  testId,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-1 rounded-card border border-border bg-surface px-4.5 py-4",
        className,
      )}
      data-testid={testId}
    >
      <span className="text-xs font-semibold text-muted">{label}</span>
      <span className="font-display text-[1.625rem] leading-none font-bold tracking-tight text-foreground tabular-nums">
        {value}
      </span>
      {hint ? <span className="text-xs text-muted">{hint}</span> : null}
    </div>
  );
}

export { SectionTabs, SectionTabsContext, SectionTabsSlot, type SectionTab } from "./section-tabs";
import { SectionTabsSlot } from "./section-tabs";
export { ConsoleHotkeys } from "./hotkeys";
export type { PaletteItem, PaletteLabels } from "./command-palette";
export type { ShortcutGroup } from "./shortcuts-sheet";
