import { getTranslations } from "next-intl/server";
import { Card, PageTitle } from "@/components/ui";
import { guard } from "@/server/guard";
import { listProperties } from "../../properties/properties.actions";
import { StaffBookingForm } from "./form";

export default async function NewBookingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const t = await getTranslations("reservations");
  const properties = await guard(() => listProperties());
  return (
    <div className="space-y-4">
      <PageTitle>{t("newBooking")}</PageTitle>
      <Card>
        <StaffBookingForm
          properties={properties.map((p) => ({ id: p.id, title: p.title }))}
          initial={{
            propertyId: sp.propertyId,
            arrivalDate: sp.arrivalDate,
            departureDate: sp.departureDate,
          }}
        />
      </Card>
    </div>
  );
}
