import { getTranslations } from "next-intl/server";
import { Card, PageTitle } from "@/components/ui";
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
  const [properties, board] = await guard(() => Promise.all([listProperties(), loadHealthBoard()]));
  return (
    <div className="space-y-6">
      <PageTitle>{t("connect")}</PageTitle>
      <Card>
        <ConnectionWizard
          properties={properties.map((p) => ({ id: p.id, title: p.title }))}
          accounts={board.accounts.map((a) => ({
            id: a.id,
            label: a.label,
            adapterCode: a.adapterCode,
          }))}
          initialPropertyId={propertyId}
        />
      </Card>
    </div>
  );
}
