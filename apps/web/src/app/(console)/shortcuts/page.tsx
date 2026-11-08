import { getTranslations } from "next-intl/server";
import { Card, PageHeader } from "@/components/ui";

type Item = { keys: string[]; label: string };

/** Keyboard shortcuts (design canvas board): every key that works, by where it works. "?" opens it. */
export default async function ShortcutsPage() {
  const t = await getTranslations("nav.shortcuts");
  const then = t("then");
  const groups: Array<{ title: string; items: Item[] }> = [
    {
      title: t("everywhere"),
      items: [
        { keys: ["⌘", "K"], label: t("palette") },
        { keys: ["/"], label: t("focusSearch") },
        { keys: ["?"], label: t("sheet") },
        { keys: ["N"], label: t("newReservation") },
        { keys: ["G", then, "T / I / C / R / O / P / S"], label: t("goTo") },
        { keys: ["⌘", "Z"], label: t("undo") },
        { keys: ["Esc"], label: t("close") },
      ],
    },
    {
      title: t("calendar"),
      items: [
        { keys: [t("drag")], label: t("selectNights") },
        { keys: ["Shift", "+", t("click")], label: t("extend") },
        { keys: ["⌘", "+", t("click")], label: t("addRange") },
        { keys: [t("typeNumber")], label: t("setPrice") },
        { keys: ["B", "/", "O"], label: t("blockOpen") },
        { keys: ["M"], label: t("minStay") },
        { keys: ["↵"], label: t("save") },
        { keys: ["←", "→"], label: t("week") },
        { keys: ["T"], label: t("today") },
        { keys: ["1", "2", "3", "4"], label: t("ranges") },
        { keys: ["Y"], label: t("year") },
      ],
    },
    {
      title: t("inbox"),
      items: [
        { keys: ["J", "/", "K"], label: t("nextPrev") },
        { keys: ["R"], label: t("reply") },
        { keys: ["S"], label: t("suggest") },
        { keys: ["E"], label: t("archive") },
        { keys: ["A"], label: t("assign") },
        { keys: ["⌘", "↵"], label: t("send") },
      ],
    },
    {
      title: t("reservations"),
      items: [
        { keys: ["C"], label: t("checkIn") },
        { keys: ["D"], label: t("changeDates") },
        { keys: ["$"], label: t("payment") },
        { keys: ["O"], label: t("portal") },
      ],
    },
  ];
  return (
    <div className="flex flex-col gap-5" data-testid="shortcuts-page">
      <PageHeader
        title={t("title")}
        description={t("lead")}
        crumb={[{ label: t("help") }, { label: t("title") }]}
      />
      <div className="grid gap-5 md:grid-cols-2">
        {groups.map((g) => (
          <Card key={g.title} title={g.title}>
            <dl className="grid grid-cols-[auto_1fr] items-center gap-x-5 gap-y-2.5 text-sm">
              {g.items.map((it) => (
                <div key={it.label} className="contents">
                  <dt className="flex flex-wrap items-center gap-1 whitespace-nowrap">
                    {it.keys.map((k, i) =>
                      k === "/" || k === "+" || k === then ? (
                        <span key={i} className="text-xs text-muted">
                          {k}
                        </span>
                      ) : (
                        <kbd
                          key={i}
                          className="rounded-md border border-b-2 border-border bg-surface px-1.5 py-0.5 font-sans text-[11px] font-semibold text-muted"
                        >
                          {k}
                        </kbd>
                      ),
                    )}
                  </dt>
                  <dd>{it.label}</dd>
                </div>
              ))}
            </dl>
          </Card>
        ))}
      </div>
      <Card title={t("whyTitle")}>
        <p className="max-w-3xl text-sm leading-relaxed text-muted">{t("whyBody")}</p>
      </Card>
    </div>
  );
}
