"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";

export interface PaletteItem {
  id: string;
  title: string;
  /** Text after the bold title on the same line. */
  inline?: string;
  subtitle?: string;
  href: string;
  /** A hint shown at the end of the row, such as a shortcut. */
  hint?: string;
  initials?: string;
  guestName?: string;
  propertyId?: string;
}

export interface PaletteLabels {
  placeholder: string;
  empty: string;
  reservations: string;
  properties: string;
  pages: string;
  actions: string;
  footer: string;
  keys: string;
  replyTo: string;
  replySub: string;
  newFor: string;
  newForSub: string;
  block: string;
  blockSub: string;
  calendarOf: string;
  calendarOfSub: string;
  try: string;
  blockCmd: string;
  blockCmdSub: string;
  fromDay: string;
  priceCmd: string;
  priceCmdSub: string;
  switchCmd: string;
  switchCmdSub: string;
  examples: string[];
  /** Language names by locale, in the viewer's language. */
  languages: Record<string, string>;
}

type SearchFn = (q: {
  q: string;
}) => Promise<{ reservations: PaletteItem[]; properties: PaletteItem[] }>;

const fill = (s: string, v: Record<string, string>) =>
  s.replace(/\{(\w+)\}/g, (_, k: string) => v[k] ?? "");

/** Words a host might type for a language, in English and in the language itself. */
const LANGUAGE_WORDS: Record<string, string> = {
  english: "en",
  anglais: "en",
  french: "fr",
  français: "fr",
  francais: "fr",
  arabic: "ar",
  arabe: "ar",
  العربية: "ar",
  spanish: "es",
  español: "es",
  espagnol: "es",
  portuguese: "pt",
  português: "pt",
  portugais: "pt",
};
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** "24–26 dec", "24 dec", "dec 24" → the first night as ISO, this year or next. */
function parseFrom(text: string, today: Date): { iso: string | null; rest: string } {
  const m =
    /(\d{1,2})(?:\s*[-–]\s*\d{1,2})?\s+([a-zé]{3,})/i.exec(text) ??
    /([a-zé]{3,})\s+(\d{1,2})/i.exec(text);
  if (!m) return { iso: null, rest: text };
  const [dayStr, monStr] = /^\d/.test(m[1]!) ? [m[1]!, m[2]!] : [m[2]!, m[1]!];
  const month = MONTHS.indexOf(monStr.slice(0, 3).toLowerCase());
  if (month < 0) return { iso: null, rest: text };
  let year = today.getUTCFullYear();
  const candidate = Date.UTC(year, month, Number(dayStr));
  if (candidate < Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()))
    year += 1;
  const iso = new Date(Date.UTC(year, month, Number(dayStr))).toISOString().slice(0, 10);
  return { iso, rest: text.replace(m[0], " ").replace(/\s+/g, " ").trim() };
}

/** What the typed text asks for, if it is a command rather than a search. */
function parseCommand(q: string): {
  kind: "block" | "price" | "switch" | null;
  search: string;
  from: string | null;
  locale: string | null;
} {
  const text = q.trim();
  const sw = /^>\s*switch\s+to\s+(\S+)/i.exec(text);
  if (sw)
    return {
      kind: "switch",
      search: "",
      from: null,
      locale: LANGUAGE_WORDS[sw[1]!.toLowerCase()] ?? null,
    };
  const block = /^block\s+(.+)/i.exec(text);
  if (block) {
    const { iso, rest } = parseFrom(block[1]!, new Date());
    return { kind: "block", search: rest, from: iso, locale: null };
  }
  const price = /^prices?\s+(.+)/i.exec(text);
  if (price)
    return {
      kind: "price",
      search: price[1]!.replace(/[+-]\d+%.*$/, "").trim(),
      from: null,
      locale: null,
    };
  return { kind: null, search: text, from: null, locale: null };
}

/**
 * ⌘K (design canvas board "⌘K · search, jump, act"). One box that searches guests,
 * reservations and properties on the server, offers the actions that make sense for the
 * first guest it found, jumps to pages, and understands three typed commands:
 * "block <property> <dates>", "price <property>" and "> switch to <language>".
 * Results are ours; cmdk only provides the keyboard model and the dialog.
 */
export function CommandPalette({
  open,
  onOpenChange,
  search,
  pages,
  actions,
  labels: L,
  onLocale,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  search: SearchFn;
  pages: PaletteItem[];
  actions: PaletteItem[];
  labels: PaletteLabels;
  onLocale?: (form: FormData) => Promise<void>;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<{ reservations: PaletteItem[]; properties: PaletteItem[] }>({
    reservations: [],
    properties: [],
  });
  const [pending, start] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const empty = { reservations: [], properties: [] };

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setQuery("");
      setHits(empty);
    }
    onOpenChange(next);
  };

  const onQuery = (q: string) => {
    setQuery(q);
    if (timer.current) clearTimeout(timer.current);
    const term = parseCommand(q).search;
    if (term.trim().length < 2) {
      setHits(empty);
      return;
    }
    timer.current = setTimeout(() => {
      start(async () => {
        try {
          setHits(await search({ q: term }));
        } catch {
          setHits(empty);
        }
      });
    }, 180);
  };

  const go = (href: string) => {
    handleOpenChange(false);
    router.push(href);
  };

  const cmd = parseCommand(query);
  const commands: PaletteItem[] = [];
  if (cmd.kind === "switch" && cmd.locale)
    commands.push({
      id: `switch-${cmd.locale}`,
      title: fill(L.switchCmd, { language: L.languages[cmd.locale] ?? cmd.locale }),
      subtitle: L.switchCmdSub,
      href: `#locale:${cmd.locale}`,
      initials: "A",
    });
  if (cmd.kind === "block")
    for (const p of hits.properties.slice(0, 3))
      commands.push({
        id: `block-${p.id}`,
        title: fill(L.blockCmd, {
          property: p.title,
          from: cmd.from
            ? fill(L.fromDay, {
                day:
                  cmd.from.slice(8, 10) +
                  " " +
                  MONTHS[Number(cmd.from.slice(5, 7)) - 1]!.replace(/^./, (c) => c.toUpperCase()),
              })
            : "",
        }),
        subtitle: L.blockCmdSub,
        href: `/calendar?propertyId=${p.propertyId ?? p.id}${cmd.from ? `&from=${cmd.from}` : ""}`,
        initials: "▦",
        hint: "B",
      });
  if (cmd.kind === "price")
    for (const p of hits.properties.slice(0, 3))
      commands.push({
        id: `price-${p.id}`,
        title: fill(L.priceCmd, { property: p.title }),
        subtitle: L.priceCmdSub,
        href: `/properties/${p.propertyId ?? p.id}/pricing`,
        initials: "€",
      });

  const needle = cmd.kind ? "" : query.trim().toLowerCase();
  const match = (it: PaletteItem) =>
    needle.length === 0 ||
    it.title.toLowerCase().includes(needle) ||
    (it.subtitle ?? "").toLowerCase().includes(needle);
  const guest = hits.reservations[0];
  const contextual: PaletteItem[] =
    guest && !cmd.kind
      ? [
          {
            id: "reply",
            title: fill(L.replyTo, { name: guest.guestName ?? guest.title }),
            subtitle: L.replySub,
            href: `/inbox?view=all&q=${encodeURIComponent(guest.guestName ?? guest.title)}`,
            initials: "↵",
            hint: "R",
          },
          {
            id: "new-for",
            title: fill(L.newFor, { name: guest.guestName ?? guest.title }),
            subtitle: L.newForSub,
            href: `/reservations/new?guest=${encodeURIComponent(guest.guestName ?? guest.title)}${guest.propertyId ? `&propertyId=${guest.propertyId}` : ""}`,
            initials: "+",
            hint: "N",
          },
          {
            id: "block",
            title: L.block,
            subtitle: L.blockSub,
            href: "/calendar",
            initials: "▦",
            hint: "B",
          },
        ]
      : [];
  const visibleActions = cmd.kind ? commands : [...contextual, ...actions.filter(match)];
  const firstProperty = hits.properties[0] ?? null;
  const goTo: PaletteItem[] = [
    ...(firstProperty && !cmd.kind
      ? [
          {
            id: "cal-prop",
            title: fill(L.calendarOf, { property: firstProperty.title }),
            subtitle: L.calendarOfSub,
            href: `/calendar?propertyId=${firstProperty.propertyId ?? firstProperty.id}`,
            hint: "G C",
          },
        ]
      : []),
    ...(cmd.kind ? [] : pages.filter(match)),
  ];
  const nothing =
    (cmd.kind ? 0 : hits.reservations.length + hits.properties.length) +
      visibleActions.length +
      goTo.length ===
    0;

  const select = async (it: PaletteItem) => {
    if (it.href.startsWith("#locale:")) {
      const fd = new FormData();
      fd.set("locale", it.href.slice(8));
      handleOpenChange(false);
      await onLocale?.(fd);
      router.refresh();
      return;
    }
    go(it.href);
  };

  return (
    <Command.Dialog
      open={open}
      onOpenChange={handleOpenChange}
      label={L.placeholder}
      shouldFilter={false}
      overlayClassName="fixed inset-0 z-[60] bg-[#101413]/45"
      contentClassName="fixed inset-x-4 top-[14vh] z-[61] mx-auto max-w-[680px] overflow-hidden rounded-2xl border border-border bg-surface text-foreground shadow-float"
      data-testid="command-palette"
    >
      <div className="flex items-center gap-3 border-b border-border px-4 py-3.5">
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
          className="text-muted"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <Command.Input
          value={query}
          onValueChange={onQuery}
          placeholder={L.placeholder}
          className="h-8 min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted"
          data-testid="palette-input"
        />
        {pending ? (
          <span className="h-2 w-2 animate-pulse rounded-full bg-accent" aria-hidden="true" />
        ) : null}
        <span className="hidden shrink-0 items-center gap-1 text-[11px] text-muted sm:flex">
          <Kbd>↑↓</Kbd> <Kbd>↵</Kbd> <Kbd>Esc</Kbd>
          <span className="ms-1">{L.keys}</span>
        </span>
      </div>
      <Command.List className="scrollbar max-h-[58vh] overflow-y-auto p-1.5">
        {nothing ? (
          <Command.Empty className="px-3 py-8 text-center text-sm text-muted">
            {L.empty}
          </Command.Empty>
        ) : null}
        {!cmd.kind && hits.reservations.length > 0 ? (
          <Group heading={L.reservations}>
            {hits.reservations.map((it) => (
              <Row key={it.id} item={it} onSelect={select} avatar />
            ))}
          </Group>
        ) : null}
        {!cmd.kind && hits.properties.length > 0 ? (
          <Group heading={L.properties}>
            {hits.properties.map((it) => (
              <Row
                key={it.id}
                item={{ ...it, initials: it.title.slice(0, 1).toUpperCase() }}
                onSelect={select}
                avatar
              />
            ))}
          </Group>
        ) : null}
        {visibleActions.length > 0 ? (
          <Group heading={L.actions}>
            {visibleActions.map((it) => (
              <Row key={it.id} item={{ ...it, initials: it.initials ?? "↵" }} onSelect={select} />
            ))}
          </Group>
        ) : null}
        {goTo.length > 0 ? (
          <Group heading={L.pages}>
            {goTo.map((it) => (
              <Row key={it.id} item={{ ...it, initials: "→" }} onSelect={select} />
            ))}
          </Group>
        ) : null}
      </Command.List>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border px-4 py-2.5 text-xs text-muted">
        <span>{L.try}</span>
        {L.examples.map((ex) => (
          <button
            key={ex}
            type="button"
            className="italic hover:text-foreground"
            onClick={() => onQuery(ex)}
          >
            {ex}
          </button>
        ))}
      </div>
    </Command.Dialog>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded-md border border-border bg-surface px-1.5 py-0.5 font-sans text-[11px] font-semibold text-muted">
      {children}
    </kbd>
  );
}

function Group({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <Command.Group
      heading={heading}
      className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-2.5 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-bold [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-muted [&_[cmdk-group-heading]]:uppercase"
    >
      {children}
    </Command.Group>
  );
}

function Row({
  item,
  onSelect,
  avatar = false,
}: {
  item: PaletteItem;
  onSelect: (item: PaletteItem) => void;
  avatar?: boolean;
}) {
  return (
    <Command.Item
      value={`${item.id} ${item.title}`}
      onSelect={() => onSelect(item)}
      className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-foreground data-[selected=true]:bg-accent-soft/60"
      data-testid="palette-item"
    >
      <span
        className={
          avatar
            ? "grid h-8 w-8 shrink-0 place-items-center rounded-full bg-linear-to-br from-[#34d399] to-[#22d3ee] text-[11px] font-bold text-[#0b1020]"
            : "grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-default text-sm font-semibold text-accent"
        }
        aria-hidden="true"
      >
        {item.initials ?? "→"}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate">
          <strong className="font-semibold">{item.title}</strong>
          {item.inline ? <span className="text-muted"> · {item.inline}</span> : null}
        </span>
        {item.subtitle ? (
          <span className="block truncate text-xs text-muted">{item.subtitle}</span>
        ) : null}
      </span>
      {item.hint ? (
        <span className="flex shrink-0 gap-1">
          {item.hint.split(" ").map((k, i) => (
            <Kbd key={i}>{k}</Kbd>
          ))}
        </span>
      ) : null}
    </Command.Item>
  );
}
