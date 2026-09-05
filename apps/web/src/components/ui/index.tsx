import type { ComponentProps, ReactNode } from "react";
import { Children, isValidElement } from "react";
import NextLink from "next/link";
import { DateInput as DateInputField } from "./date-input";
import {
  Alert as HAlert,
  Button as HButton,
  Card as HCard,
  Checkbox as HCheckbox,
  Chip as HChip,
  Description,
  EmptyState as HEmptyState,
  FieldError,
  Input as HInput,
  Label as HLabel,
  ListBox,
  Select as HSelect,
  Separator as HSeparator,
  TextArea as HTextArea,
  TextField,
  cn,
} from "@heroui/react";

/**
 * The OTAbridge kit: a thin, opinionated layer over HeroUI. Pages import from
 * here and never from @heroui/react directly, so the component system can be
 * configured (or swapped) in one place. Props stay plain (strings, booleans,
 * elements) so server components can render every piece; the client boundary
 * lives inside HeroUI.
 */

export { cn, Description, FieldError, HSeparator as Separator };
export { DateInput } from "./date-input";
export { UiProvider } from "./provider";

// ---------------------------------------------------------------- buttons

type ButtonVariant = "primary" | "secondary" | "tertiary" | "outline" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

export function Button({
  variant = "primary",
  size = "md",
  disabled,
  className,
  children,
  ...rest
}: Omit<ComponentProps<typeof HButton>, "variant" | "size" | "isDisabled" | "children"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  children?: ReactNode;
}) {
  return (
    <HButton variant={variant} size={size} isDisabled={disabled} className={className} {...rest}>
      {children}
    </HButton>
  );
}

/** A link that looks like a button (client-side navigation, no JavaScript of its own). */
export function LinkButton({
  variant = "secondary",
  size = "md",
  className,
  ...rest
}: ComponentProps<typeof NextLink> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return (
    <NextLink
      className={cn("button", `button--${variant}`, `button--${size}`, className)}
      {...rest}
    />
  );
}

/** A plain anchor that looks like a button, for downloads and API links. */
export function AnchorButton({
  variant = "secondary",
  size = "md",
  className,
  ...rest
}: ComponentProps<"a"> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return (
    <a className={cn("button", `button--${variant}`, `button--${size}`, className)} {...rest} />
  );
}

// ---------------------------------------------------------------- fields

export function Input({ className, ...props }: ComponentProps<typeof HInput>) {
  return <HInput fullWidth className={className} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<typeof HTextArea>) {
  return <HTextArea fullWidth className={className} {...props} />;
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
    <HLabel htmlFor={htmlFor} className={className}>
      {children}
    </HLabel>
  );
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
  return (
    <TextField
      name={name}
      type={type}
      isRequired={required}
      isDisabled={disabled}
      isReadOnly={readOnly}
      isInvalid={error ? true : undefined}
      defaultValue={defaultValue == null ? undefined : String(defaultValue)}
      className={cn("w-full", className)}
      fullWidth
    >
      <HLabel>{label}</HLabel>
      <HInput
        placeholder={placeholder}
        autoComplete={autoComplete}
        min={min}
        max={max}
        step={step}
        data-testid={testId}
      />
      {description ? <Description>{description}</Description> : null}
      {error ? <FieldError>{error}</FieldError> : null}
    </TextField>
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
  return (
    <TextField
      name={name}
      isRequired={required}
      defaultValue={defaultValue ?? undefined}
      className={cn("w-full", className)}
      fullWidth
    >
      <HLabel>{label}</HLabel>
      <HTextArea placeholder={placeholder} rows={rows} />
      {description ? <Description>{description}</Description> : null}
    </TextField>
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

/**
 * A select that accepts the same `<option>` children as the native element (so
 * pages read naturally) and renders HeroUI's listbox. Submits `name=value`
 * with the form like a native select; the first option is selected by default
 * unless a placeholder is given.
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
  ...rest
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
  const first = items[0]?.value;
  const initial =
    defaultValue === undefined || defaultValue === null
      ? placeholder
        ? undefined
        : first
      : String(defaultValue);
  return (
    <HSelect
      // Uncontrolled selects remount when their first option appears, so a
      // list that loads later still starts on its first entry like a native select.
      key={value === undefined ? (initial ?? "empty") : undefined}
      name={name}
      id={id}
      {...(value !== undefined ? { value: value ?? null } : { defaultValue: initial ?? null })}
      onChange={onChange ? (k) => onChange(k == null ? "" : String(k)) : undefined}
      placeholder={placeholder}
      isRequired={required}
      isDisabled={disabled}
      aria-label={label ? undefined : (ariaLabel ?? name)}
      disabledKeys={items.filter((i) => i.disabled).map((i) => i.value)}
      className={cn("min-w-0", size === "sm" ? "text-xs" : "", className)}
      data-testid={testId}
      {...rest}
    >
      {label ? <HLabel>{label}</HLabel> : null}
      <HSelect.Trigger className={cn("w-full", size === "sm" ? "min-h-8 py-1 text-xs" : "")}>
        <HSelect.Value />
        <HSelect.Indicator />
      </HSelect.Trigger>
      <HSelect.Popover>
        <ListBox>
          {items.map((i) => (
            <ListBox.Item key={i.value} id={i.value} textValue={labelText(i.label) || i.value}>
              {i.label}
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </HSelect.Popover>
    </HSelect>
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
    <HCheckbox
      name={name}
      value={value}
      defaultSelected={defaultChecked}
      isDisabled={disabled}
      className={className}
    >
      <HCheckbox.Content>
        <HCheckbox.Control>
          <HCheckbox.Indicator />
        </HCheckbox.Control>
        {children}
      </HCheckbox.Content>
    </HCheckbox>
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
  variant,
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
  return (
    <HCard className={cn("gap-4 p-5", own.join(" "))} variant={variant} {...rest}>
      {title || actions ? (
        <HCard.Header className="flex-row items-start justify-between gap-4">
          <div className="min-w-0">
            {title ? <HCard.Title className="text-base font-semibold">{title}</HCard.Title> : null}
            {description ? <HCard.Description>{description}</HCard.Description> : null}
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </HCard.Header>
      ) : null}
      <HCard.Content className={cn(inner.length ? inner.join(" ") : "block", contentClassName)}>
        {children}
      </HCard.Content>
    </HCard>
  );
}

export function PageTitle({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <h1
      className={cn(
        "font-display text-2xl leading-tight font-semibold tracking-tight text-foreground",
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
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <PageTitle>{title}</PageTitle>
          {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
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
  return <h2 className={cn("text-base font-semibold text-foreground", className)}>{children}</h2>;
}

export function Alert({
  children,
  tone = "error",
  title,
  className,
  ...rest
}: {
  children?: ReactNode;
  tone?: "error" | "success" | "info" | "warning" | "default";
  title?: ReactNode;
  className?: string;
}) {
  const status = (
    {
      error: "danger",
      success: "success",
      info: "accent",
      warning: "warning",
      default: "default",
    } as const
  )[tone];
  return (
    <HAlert status={status} className={className} role="alert" {...rest}>
      <HAlert.Indicator />
      <HAlert.Content>
        {title ? <HAlert.Title>{title}</HAlert.Title> : null}
        {children ? <HAlert.Description>{children}</HAlert.Description> : null}
      </HAlert.Content>
    </HAlert>
  );
}

type ChipColor = "default" | "accent" | "success" | "warning" | "danger";

export function Chip({
  children,
  color = "default",
  variant = "soft",
  size = "md",
  className,
  ...rest
}: {
  children: ReactNode;
  color?: ChipColor;
  variant?: "soft" | "primary" | "secondary" | "tertiary";
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  return (
    <HChip color={color} variant={variant} size={size} className={className} {...rest}>
      {children}
    </HChip>
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
    <HChip color={color} variant="soft" size="sm">
      {children ?? state}
    </HChip>
  );
}

export function EmptyState({
  title,
  description,
  action,
  className,
  ...rest
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <HEmptyState className={cn("flex flex-col items-start gap-1 px-1 py-4", className)} {...rest}>
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description ? <p className="text-sm text-muted">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </HEmptyState>
  );
}

// ---------------------------------------------------------------- tables

/**
 * Tables are server-rendered markup carrying HeroUI's table classes: the same
 * look as HeroUI's Table with no client JavaScript and no collection
 * constraints, which suits lists that are rendered once per request.
 */
export function Table({
  children,
  className,
  variant = "primary",
  dense,
  ...rest
}: ComponentProps<"table"> & { variant?: "primary" | "secondary"; dense?: boolean }) {
  return (
    <div className={cn("table-root", `table-root--${variant}`, dense && "table--dense")}>
      <div className="table__scroll-container">
        <table className={cn("table__content", className)} {...rest}>
          {children}
        </table>
      </div>
    </div>
  );
}
export function THead({ children, className, ...rest }: ComponentProps<"thead">) {
  return (
    <thead className={cn("table__header", className)} {...rest}>
      {children}
    </thead>
  );
}
export function TBody({ children, className, ...rest }: ComponentProps<"tbody">) {
  return (
    <tbody className={cn("table__body", className)} {...rest}>
      {children}
    </tbody>
  );
}
export function Tr({ children, className, ...rest }: ComponentProps<"tr">) {
  return (
    <tr className={cn("table__row", className)} {...rest}>
      {children}
    </tr>
  );
}
export function Th({ children, className, ...rest }: ComponentProps<"th">) {
  return (
    <th className={cn("table__column", className)} {...rest}>
      {children}
    </th>
  );
}
export function Td({ children, className, ...rest }: ComponentProps<"td">) {
  return (
    <td className={cn("table__cell", className)} {...rest}>
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
        <Tr>
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

/** A big number with a small label. */
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
    <div className={cn("flex flex-col gap-0.5", className)} data-testid={testId}>
      <span className="text-xs font-medium text-muted">{label}</span>
      <span className="text-2xl font-semibold tracking-tight text-foreground tabular-nums">
        {value}
      </span>
      {hint ? <span className="text-xs text-muted">{hint}</span> : null}
    </div>
  );
}

export { SectionTabs } from "./section-tabs";
