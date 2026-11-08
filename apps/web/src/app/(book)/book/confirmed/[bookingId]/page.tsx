import { getTranslations } from "next-intl/server";
import { orgBrand, orgForBooking } from "@/server/booking-engine";
import { SiteMain } from "@/components/site";
import { BookFooter, BookHeader } from "../../chrome";

/** Step 6 (spec 10 §10.2): reference on screen, mail with .ics and the portal link on its way (BE-7). */
export default async function ConfirmedPage({
  params,
  searchParams,
}: {
  params: Promise<{ bookingId: string }>;
  searchParams: Promise<{ ref?: string; email?: string; embed?: string }>;
}) {
  const { bookingId } = await params;
  const sp = await searchParams;
  const t = await getTranslations("book");
  const orgId = await orgForBooking(bookingId);
  const org = orgId ? await orgBrand(orgId) : null;
  const embed = Boolean(sp.embed);
  return (
    <>
      <BookHeader org={org} embed={embed} />
      <SiteMain id="main" className="max-w-[640px] py-12">
        <section
          className="flex flex-col gap-3 rounded-[20px] border border-border bg-surface p-8 shadow-[0_12px_32px_rgba(20,23,22,0.06)]"
          data-testid="booking-confirmed"
          data-booking-id={bookingId}
        >
          <span className="bridge-rail block h-[3px] w-10 rounded-sm" aria-hidden="true" />
          <h1 className="font-display text-[32px] font-extrabold tracking-[-0.025em] text-foreground">
            {t("confirmedTitle")}
          </h1>
          <p className="text-sm">
            {t("reference")}:{" "}
            <strong data-testid="booking-reference">{sp.ref ?? bookingId.slice(0, 8)}</strong>
          </p>
          <p className="text-sm text-muted">{t("confirmedHint", { email: sp.email ?? "" })}</p>
        </section>
      </SiteMain>
      <BookFooter org={org} embed={embed} />
    </>
  );
}
