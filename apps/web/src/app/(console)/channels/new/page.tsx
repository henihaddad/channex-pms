import { getTranslations } from "next-intl/server";
import { Card, PageHeader } from "@/components/ui";
import { guard } from "@/server/guard";
import { listProperties } from "../../properties/properties.actions";
import { loadHealthBoard } from "../channels.actions";
import { mappingLabels } from "../mapping-labels";
import { ConnectionWizard, type VisibleStep, type WizardLabels } from "./wizard";

export async function generateMetadata() {
  const t = await getTranslations("channels");
  return { title: t("connect") };
}

const STEPS: VisibleStep[] = ["channel", "settings", "test", "match", "golive", "done"];
/** Messages the wizard fills on the client (`{channel}` and the like), read without formatting. */
const RAW = [
  "testFailed",
  "testFailedNoMessage",
  "likelyCause",
  "created",
  "live",
  "notReady",
  "notReadyNoReason",
] as const;
const PLAIN = [
  "stepsLabel",
  "channel",
  "property",
  "account",
  "none",
  "next",
  "nextPending",
  "back",
  "airbnbBody",
  "airbnbButton",
  "unknownType",
  "test",
  "testing",
  "testOk",
  "load",
  "loading",
  "create",
  "creating",
  "saveRooms",
  "saving",
  "activate",
  "activating",
  "goChannels",
  "fixRooms",
  "failed",
] as const;

export default async function NewChannelPage({
  searchParams,
}: {
  searchParams: Promise<{ propertyId?: string }>;
}) {
  const { propertyId } = await searchParams;
  const t = await getTranslations("channels");
  const tw = await getTranslations("channels.wizard");
  const [properties, board] = await guard(() => Promise.all([listProperties(), loadHealthBoard()]));
  const labels = {
    ...Object.fromEntries(PLAIN.map((k) => [k, tw(k)])),
    ...Object.fromEntries(RAW.map((k) => [k, tw.raw(k) as string])),
    steps: Object.fromEntries(STEPS.map((k) => [k, tw(`steps.${k}`)])),
    mapping: await mappingLabels(),
  } as WizardLabels;
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
          labels={labels}
        />
      </Card>
    </div>
  );
}
