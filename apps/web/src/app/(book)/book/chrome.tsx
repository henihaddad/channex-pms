import { getTranslations } from "next-intl/server";
import { Logo, LogoMark } from "@/components/logo";
import { Brand, SiteFooter, SiteHeader, SiteLink } from "@/components/site";

/**
 * The booking site's header and footer. With one organization the site wears its
 * name; the cross-tenant storefront wears the product's. Embedded in a manager's own
 * site (`embed=1`) neither is drawn: the host page has its own.
 */
export async function BookHeader({
  org,
  embed,
  secure,
}: {
  org: { id: string; name: string } | null;
  embed?: boolean;
  /** Checkout: a padlock line instead of the site navigation. */
  secure?: boolean;
}) {
  if (embed) return null;
  const t = await getTranslations("book");
  const home = org ? `/book?org=${org.id}` : "/book";
  return (
    <SiteHeader brand={org ? <Brand name={org.name} href={home} /> : <Logo size={30} />}>
      {secure ? (
        <span className="inline-flex items-center gap-1.5 text-muted">
          <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden="true" fill="none">
            <rect
              x="3"
              y="7"
              width="10"
              height="7"
              rx="1.5"
              stroke="currentColor"
              strokeWidth="1.4"
            />
            <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" stroke="currentColor" strokeWidth="1.4" />
          </svg>
          {t("secureCheckout")}
        </span>
      ) : (
        <>
          <SiteLink href={`${home}#stays`} className="hidden sm:inline">
            {t("ourPlaces")}
          </SiteLink>
          <SiteLink href={`${home}#why`} className="hidden sm:inline">
            {t("whyDirect")}
          </SiteLink>
          <SiteLink href="/guest" pill>
            <span className="hidden sm:inline">{t("manageBooking")}</span>
            <span className="sm:hidden">{t("myBooking")}</span>
          </SiteLink>
        </>
      )}
    </SiteHeader>
  );
}

export async function BookFooter({
  org,
  embed,
}: {
  org: { id: string; name: string } | null;
  embed?: boolean;
}) {
  const t = await getTranslations("book");
  if (embed)
    return (
      <p className="mx-auto mt-8 max-w-[1200px] px-4 pb-4 text-xs text-muted">{t("poweredBy")}</p>
    );
  return (
    <SiteFooter
      left={
        <>
          <LogoMark size={18} />
          {org ? <span>© {org.name} · </span> : null}
          <span>
            {t("engineBy")} <strong className="text-foreground">OTAbridge</strong>
          </span>
        </>
      }
      right={
        <SiteLink href="/guest" className="text-accent hover:text-accent-soft-foreground">
          {t("manageBooking")}
        </SiteLink>
      }
    />
  );
}
