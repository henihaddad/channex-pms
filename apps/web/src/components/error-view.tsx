"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Button, LinkButton } from "@/components/ui";

/**
 * What a page that failed to render shows instead of the framework's blank error screen
 * (Nielsen #9): what happened, that nothing saved was lost, and two ways on.
 */
export function ErrorView({
  error,
  reset,
  home = "/",
  homeLabel,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  home?: string;
  homeLabel?: "backToToday" | "backHome";
}) {
  const t = useTranslations("system");
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div
      role="alert"
      className="mx-auto flex max-w-lg flex-col gap-3 px-1 py-16"
      data-testid="error-view"
    >
      <h1 className="font-display text-2xl font-bold text-foreground">{t("errorTitle")}</h1>
      <p className="text-sm leading-relaxed text-muted">{t("errorBody")}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button onClick={reset}>{t("tryAgain")}</Button>
        <LinkButton href={home} variant="secondary">
          {t(homeLabel ?? "backHome")}
        </LinkButton>
      </div>
      {error.digest ? (
        <p className="text-xs text-muted">{t("errorRef", { digest: error.digest })}</p>
      ) : null}
    </div>
  );
}
