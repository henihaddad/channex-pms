import type { DerivedOption } from "@pms/core";
import { money } from "@/lib/format";

/** "−10% derived", "+€15 derived": how a derived plan sits relative to its parent. */
export function derivedLabel(
  o: DerivedOption,
  currency: string,
  t: (key: "derived", values: { change: string }) => string,
): string {
  const sign = o.direction === "decrease" ? "−" : "+";
  const size = o.kind === "percent" ? `${String(o.value / 100)}%` : money(o.value, currency);
  return t("derived", { change: `${sign}${size}` });
}
