import { getTranslations } from "next-intl/server";
import { Card } from "@/components/ui";
import { InviteForm } from "./invite-form";

export default async function InvitePage({
  params,
}: {
  params: Promise<{ orgId: string; token: string }>;
}) {
  const { orgId, token } = await params;
  const t = await getTranslations("auth");
  return (
    <Card>
      <h1 className="mb-4 text-xl font-bold">{t("acceptInvite")}</h1>
      <InviteForm
        orgId={orgId}
        token={token}
        labels={{ name: t("name"), password: t("setPassword"), submit: t("acceptInvite") }}
      />
    </Card>
  );
}
