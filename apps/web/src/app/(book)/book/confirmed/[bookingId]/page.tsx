import { getTranslations } from "next-intl/server";
import { Card } from "@/components/ui";

/** Step 6 (spec 10 §10.2): reference on screen, mail with .ics and the portal link on its way (BE-7). */
export default async function ConfirmedPage({
  params,
  searchParams,
}: {
  params: Promise<{ bookingId: string }>;
  searchParams: Promise<{ ref?: string; email?: string }>;
}) {
  const { bookingId } = await params;
  const sp = await searchParams;
  const t = await getTranslations("book");
  return (
    <Card data-testid="booking-confirmed" data-booking-id={bookingId}>
      <h1 className="text-2xl font-bold">{t("confirmedTitle")}</h1>
      <p className="mt-2 text-sm">
        {t("reference")}:{" "}
        <strong data-testid="booking-reference">{sp.ref ?? bookingId.slice(0, 8)}</strong>
      </p>
      <p className="mt-2 text-sm text-slate-600">{t("confirmedHint", { email: sp.email ?? "" })}</p>
    </Card>
  );
}
