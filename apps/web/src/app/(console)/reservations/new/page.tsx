import { getLocale, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/ui";
import { guard } from "@/server/guard";
import { listProperties } from "../../properties/properties.actions";
import { StaffBookingForm } from "./form";

const KEYS = [
  "where",
  "property",
  "room",
  "sleeps",
  "checkIn",
  "checkOut",
  "adults",
  "children",
  "available",
  "availableDetail",
  "minStay",
  "noRestrictions",
  "channelsClose",
  "unavailable",
  "guest",
  "fullName",
  "fullNameHint",
  "returning",
  "stays",
  "email",
  "phone",
  "language",
  "languageUnknown",
  "price",
  "ratePlan",
  "total",
  "totalHint",
  "source",
  "sourcePhone",
  "sourceWalkIn",
  "sourceDirect",
  "sourceStaff",
  "payment",
  "payLater",
  "payCard",
  "payCash",
  "payTransfer",
  "note",
  "noteHint",
  "summary",
  "nights",
  "adultsN",
  "pickDates",
  "totalLabel",
  "dueNow",
  "create",
  "cancel",
  "sideEffects",
  "night1",
  "adult1",
  "stay1",
] as const;

/** New reservation (spec 08 §8.11): prefilled from ?propertyId, ?arrivalDate, ?departureDate and ?guest. */
export default async function NewBookingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const t = await getTranslations("reservations");
  const tn = await getTranslations("reservations.new");
  const locale = await getLocale();
  const properties = await guard(() => listProperties());
  // ICU placeholders stay as {name} for the client to fill
  const labels = Object.fromEntries(KEYS.map((k) => [k, tn.raw(k) as string])) as Record<
    string,
    string
  >;
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={t("newReservation")}
        tabs={false}
        crumb={[{ href: "/reservations", label: t("title") }, { label: tn("crumb") }]}
      />
      <StaffBookingForm
        properties={properties.map((p) => ({ id: p.id, title: p.title }))}
        initial={{
          propertyId: sp.propertyId,
          arrivalDate: sp.arrivalDate,
          departureDate: sp.departureDate,
          guest: sp.guest,
        }}
        labels={labels}
        locale={locale}
      />
    </div>
  );
}
