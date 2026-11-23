import { getTranslations } from "next-intl/server";

/**
 * Shown the moment a console link is followed, until the page streams in (Nielsen #1): the shape
 * of a header and a card at their real size, so nothing jumps when the page arrives.
 */
export default async function ConsoleLoading() {
  const t = await getTranslations("system");
  return (
    <div className="flex flex-col gap-5" aria-busy="true" data-testid="page-loading">
      <span className="sr-only" role="status">
        {t("loading")}
      </span>
      <div className="h-8 w-56 animate-pulse rounded-control bg-default" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-24 animate-pulse rounded-card border border-border bg-surface"
          />
        ))}
      </div>
      <div className="h-80 animate-pulse rounded-card border border-border bg-surface" />
    </div>
  );
}
