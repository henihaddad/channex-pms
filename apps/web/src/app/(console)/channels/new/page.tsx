import { getTranslations } from "next-intl/server";
import { Card, PageHeader } from "@/components/ui";
import { guard } from "@/server/guard";
import { listProperties } from "../../properties/properties.actions";
import { loadHealthBoard } from "../channels.actions";
import { ConnectionWizard } from "./wizard";

export default async function NewChannelPage({
  searchParams,
}: {
  searchParams: Promise<{ propertyId?: string }>;
}) {
  const { propertyId } = await searchParams;
  const t = await getTranslations("channels");
  const tw = await getTranslations("channels.wizard");
  const [properties, board] = await guard(() => Promise.all([listProperties(), loadHealthBoard()]));
  return (
    <div className="space-y-6">
      <PageHeader title={t("connect")} />
      <Card>
        <ConnectionWizard
          properties={properties.map((p) => ({ id: p.id, title: p.title }))}
          accounts={board.accounts.map((a) => ({
            id: a.id,
            label: a.label,
            adapterCode: a.adapterCode,
          }))}
          initialPropertyId={propertyId}
          labels={{
            steps: [1, 2, 3, 4, 5, 6, 7, 8].map((n) => tw(`step${n}`)),
            channel: tw("channel"),
            property: tw("property"),
            account: tw("account"),
            none: tw("none"),
            next: tw("next"),
            airbnbBody: tw("airbnbBody"),
            airbnbButton: tw("airbnbButton"),
          }}
        />
      </Card>
    </div>
  );
}
