import type { ComponentProps, ReactNode } from "react";

const cx = (...c: Array<string | false | undefined>) => c.filter(Boolean).join(" ");

export function Button({
  className,
  variant = "primary",
  ...props
}: ComponentProps<"button"> & { variant?: "primary" | "secondary" | "danger" }) {
  const styles = {
    primary:
      "bg-ink text-white hover:bg-ink-3 active:bg-ink shadow-[inset_0_-1px_0_rgba(255,255,255,0.08)]",
    secondary: "border border-line-strong bg-surface text-text hover:border-ink-3 hover:bg-canvas",
    danger: "border border-rose/40 bg-surface text-rose hover:bg-rose-soft",
  }[variant];
  return (
    <button
      className={cx(
        "inline-flex h-10 items-center justify-center rounded-lg px-4 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        styles,
        className,
      )}
      {...props}
    />
  );
}

export function Input({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      className={cx(
        "h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm text-text placeholder:text-faint outline-none transition-colors focus:border-sky focus:ring-2 focus:ring-sky/25",
        className,
      )}
      {...props}
    />
  );
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return (
    <select
      className={cx(
        "h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm text-text outline-none transition-colors focus:border-sky focus:ring-2 focus:ring-sky/25",
        className,
      )}
      {...props}
    />
  );
}

export function Label({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-text">
      {children}
    </label>
  );
}

export function Field({
  label,
  name,
  type = "text",
  required = true,
  autoComplete,
  placeholder,
  defaultValue,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  autoComplete?: string;
  placeholder?: string;
  defaultValue?: string;
}) {
  return (
    <div>
      <Label htmlFor={name}>{label}</Label>
      <Input
        id={name}
        name={name}
        type={type}
        required={required}
        autoComplete={autoComplete}
        placeholder={placeholder}
        defaultValue={defaultValue}
      />
    </div>
  );
}

export function Card({ children, className, ...rest }: ComponentProps<"div">) {
  return (
    <div
      className={cx("rounded-card border border-line bg-surface p-6 shadow-card", className)}
      {...rest}
    >
      {children}
    </div>
  );
}

export function Alert({
  children,
  tone = "error",
}: {
  children: ReactNode;
  tone?: "error" | "success";
}) {
  const styles =
    tone === "error"
      ? "border-rose/30 bg-rose-soft text-rose"
      : "border-mint/40 bg-mint-soft text-mint-deep";
  return (
    <p role="alert" className={cx("rounded-lg border px-3 py-2 text-sm", styles)}>
      {children}
    </p>
  );
}

export function PageTitle({ children }: { children: ReactNode }) {
  return (
    <h1 className="font-display text-[1.75rem] leading-tight font-bold tracking-tight text-ink">
      {children}
    </h1>
  );
}
