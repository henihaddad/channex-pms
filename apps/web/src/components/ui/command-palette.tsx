"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";

export interface PaletteItem {
  id: string;
  title: string;
  subtitle?: string;
  href: string;
  /** A hint shown at the end of the row, such as a shortcut. */
  hint?: string;
}

export interface PaletteLabels {
  placeholder: string;
  empty: string;
  reservations: string;
  properties: string;
  pages: string;
  actions: string;
  footer: string;
}

type SearchFn = (q: {
  q: string;
}) => Promise<{ reservations: PaletteItem[]; properties: PaletteItem[] }>;

/**
 * ⌘K. One box that searches guests, reservations and properties on the server,
 * and jumps to pages or runs actions from a static list. Results are ours;
 * cmdk only provides the keyboard model and the dialog.
 */
export function CommandPalette({
  open,
  onOpenChange,
  search,
  pages,
  actions,
  labels,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  search: SearchFn;
  pages: PaletteItem[];
  actions: PaletteItem[];
  labels: PaletteLabels;
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
    if (q.trim().length < 2) {
      setHits({ reservations: [], properties: [] });
      return;
    }
    timer.current = setTimeout(() => {
      start(async () => {
        try {
          setHits(await search({ q }));
        } catch {
          setHits({ reservations: [], properties: [] });
        }
      });
    }, 180);
  };

  const go = (href: string) => {
    handleOpenChange(false);
    router.push(href);
  };

  const needle = query.trim().toLowerCase();
  const match = (it: PaletteItem) =>
    needle.length === 0 ||
    it.title.toLowerCase().includes(needle) ||
    (it.subtitle ?? "").toLowerCase().includes(needle);
  const visiblePages = pages.filter(match);
  const visibleActions = actions.filter(match);
  const nothing =
    hits.reservations.length +
      hits.properties.length +
      visiblePages.length +
      visibleActions.length ===
    0;

  return (
    <Command.Dialog
      open={open}
      onOpenChange={handleOpenChange}
      label={labels.placeholder}
      shouldFilter={false}
      overlayClassName="fixed inset-0 z-[60] bg-[#101413]/45"
      contentClassName="fixed inset-x-4 top-[12vh] z-[61] mx-auto max-w-2xl overflow-hidden rounded-2xl border border-border bg-surface text-foreground shadow-float"
      data-testid="command-palette"
    >
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
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
          placeholder={labels.placeholder}
          className="h-8 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted"
          data-testid="palette-input"
        />
        {pending ? (
          <span className="h-2 w-2 animate-pulse rounded-full bg-accent" aria-hidden="true" />
        ) : null}
        <kbd className="rounded-md border border-border px-1.5 py-0.5 text-[11px] font-semibold text-muted">
          Esc
        </kbd>
      </div>
      <Command.List className="scrollbar max-h-[60vh] overflow-y-auto p-1.5">
        {nothing ? (
          <Command.Empty className="px-3 py-8 text-center text-sm text-muted">
            {labels.empty}
          </Command.Empty>
        ) : null}
        {hits.reservations.length > 0 ? (
          <Group heading={labels.reservations}>
            {hits.reservations.map((it) => (
              <Row key={it.id} item={it} onSelect={go} badge="guest" />
            ))}
          </Group>
        ) : null}
        {hits.properties.length > 0 ? (
          <Group heading={labels.properties}>
            {hits.properties.map((it) => (
              <Row key={it.id} item={it} onSelect={go} badge="home" />
            ))}
          </Group>
        ) : null}
        {visibleActions.length > 0 ? (
          <Group heading={labels.actions}>
            {visibleActions.map((it) => (
              <Row key={it.id} item={it} onSelect={go} badge="bolt" />
            ))}
          </Group>
        ) : null}
        {visiblePages.length > 0 ? (
          <Group heading={labels.pages}>
            {visiblePages.map((it) => (
              <Row key={it.id} item={it} onSelect={go} badge="arrow" />
            ))}
          </Group>
        ) : null}
      </Command.List>
      <div className="border-t border-border px-4 py-2 text-[11px] text-muted">{labels.footer}</div>
    </Command.Dialog>
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

const badges: Record<string, React.ReactNode> = {
  guest: <path d="M20 21a8 8 0 0 0-16 0M12 13a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />,
  home: <path d="M3 11.5 12 4l9 7.5M5 10v10h14V10" />,
  bolt: <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
};

function Row({
  item,
  onSelect,
  badge,
}: {
  item: PaletteItem;
  onSelect: (href: string) => void;
  badge: keyof typeof badges;
}) {
  return (
    <Command.Item
      value={`${item.id} ${item.title}`}
      onSelect={() => onSelect(item.href)}
      className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-foreground data-[selected=true]:bg-accent-soft/60"
      data-testid="palette-item"
    >
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-default text-accent">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          {badges[badge]}
        </svg>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{item.title}</span>
        {item.subtitle ? (
          <span className="block truncate text-xs text-muted">{item.subtitle}</span>
        ) : null}
      </span>
      {item.hint ? (
        <kbd className="rounded-md border border-border px-1.5 py-0.5 text-[11px] font-semibold text-muted">
          {item.hint}
        </kbd>
      ) : null}
    </Command.Item>
  );
}
