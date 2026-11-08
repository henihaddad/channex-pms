import type { ReactNode } from "react";
import type { BalanceState, StayPhase, StayStatus } from "@pms/core";
import { Chip } from "@/components/ui";
import { money } from "@/lib/format";
import { channelLook } from "@/lib/channel";

/**
 * The words a reservation is shown in, shared by the list, the detail, check-in and guests:
 * a status chip, a balance in words, where the stay is, the channel with its dot.
 */
type T = (key: string, values?: Record<string, string | number>) => string;

const STATUS_COLOR: Record<StayStatus, "success" | "info" | "warning" | "default" | "danger"> = {
  confirmed: "success",
  checked_in: "info",
  checked_out: "default",
  needs_room: "warning",
  changed: "warning",
  no_show: "danger",
  cancelled: "default",
};

export function StatusChip({ status, t }: { status: StayStatus; t: T }) {
  return (
    <Chip color={STATUS_COLOR[status]} data-status={status}>
      {t(`stayStatus.${status}`)}
    </Chip>
  );
}

/** "Paid by Airbnb", "Paid" (green), "ZAR 450 due" (amber), "—". */
export function BalanceWords({
  balance,
  currency,
  otaName,
  t,
}: {
  balance: BalanceState;
  currency: string;
  otaName: string | null;
  t: T;
}) {
  if (balance.kind === "ota")
    return (
      <span className="text-muted">
        {t("balanceWords.ota", { ota: channelLook(otaName).label })}
      </span>
    );
  if (balance.kind === "paid")
    return <span className="text-success-soft-foreground">{t("balanceWords.paid")}</span>;
  if (balance.kind === "due")
    return (
      <span className="font-semibold text-warning">
        {t("balanceWords.due", { amount: money(balance.dueMinor, currency) })}
      </span>
    );
  return <span className="text-muted">—</span>;
}

/** The same balance as a chip, for the check-in board. */
export function BalanceChip({
  balance,
  currency,
  otaName,
  t,
}: {
  balance: BalanceState;
  currency: string;
  otaName: string | null;
  t: T;
}) {
  if (balance.kind === "ota")
    return (
      <Chip color="success">{t("balanceWords.ota", { ota: channelLook(otaName).label })}</Chip>
    );
  if (balance.kind === "paid") return <Chip color="success">{t("balanceWords.paid")}</Chip>;
  if (balance.kind === "due")
    return (
      <Chip color="warning">
        {t("balanceWords.due", { amount: money(balance.dueMinor, currency) })}
      </Chip>
    );
  return <span className="text-muted">—</span>;
}

/** "arrives in 11 days", "arrives today", "in house", "left 3 days ago". */
export function phaseWords(p: StayPhase, t: T): string {
  if (p.kind === "arrives")
    return p.inDays === 0
      ? t("phase.arrivesToday")
      : p.inDays === 1
        ? t("phase.arrivesTomorrow")
        : t("phase.arrivesIn", { days: p.inDays });
  if (p.kind === "in_house") return t("phase.inHouse");
  if (p.kind === "departs_today") return t("phase.departsToday");
  return p.daysAgo === 1 ? t("phase.leftYesterday") : t("phase.leftAgo", { days: p.daysAgo });
}

export function ChannelDot({
  otaName,
  children,
}: {
  otaName: string | null;
  children?: ReactNode;
}) {
  const c = channelLook(otaName);
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span
        aria-hidden="true"
        className="size-2 shrink-0 rounded-full"
        style={{ background: c.color }}
      />
      {children ?? c.label}
    </span>
  );
}

/** "2 adults", "2 adults · 1 child". */
export function partyWords(adults: number, children: number, t: T): string {
  const a = t("party.adults", { n: adults });
  return children > 0 ? `${a} · ${t("party.children", { n: children })}` : a;
}
