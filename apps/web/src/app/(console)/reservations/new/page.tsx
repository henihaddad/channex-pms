import { getLocale, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/ui";
import { guard } from "@/server/guard";
import { listProperties } from "../../properties/properties.actions";
import { loadProperty } from "../../properties/[id]/property.actions";
import { StaffBookingForm, type Inventory } from "./form";

export async function generateMetadata() {
  const t = await getTranslations("reservations");
  return { title: t("newReservation") };
}

/** New reservation (spec 08 §8.11): prefilled from ?propertyId, ?arrivalDate, ?departureDate and ?guest. */
export default async function NewBookingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const [t, locale, properties] = await Promise.all([
    getTranslations("reservations"),
    getLocale(),
    guard(() => listProperties()),
  ]);
  const first = properties.find((p) => p.id === sp.propertyId) ?? properties[0];
  // the first property's rooms come with the page: no request after the form appears
  const inventory: Inventory = first
    ? await guard(() => loadProperty(first.id)).then((d) => ({
        roomTypes: d.roomTypes.map((r) => ({
          id: r.id,
          title: r.title,
          maxOccupancy: r.maxOccupancy,
        })),
        ratePlans: d.ratePlans.map((r) => ({ id: r.id, title: r.title, roomTypeId: r.roomTypeId })),
      }))
    : { roomTypes: [], ratePlans: [] };
  // ICU as written: the form formats plurals itself, in the page's locale
  const messages = t.raw("new") as Record<string, string>;
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={t("newReservation")}
        tabs={false}
        crumb={[{ href: "/reservations", label: t("title") }, { label: t("new.crumb") }]}
      />
      <StaffBookingForm
        properties={properties.map((p) => ({ id: p.id, title: p.title }))}
        initial={{
          propertyId: first?.id,
          arrivalDate: sp.arrivalDate,
          departureDate: sp.departureDate,
          guest: sp.guest,
        }}
        initialInventory={inventory}
        messages={messages}
        locale={locale}
      />
    </div>
  );
}
