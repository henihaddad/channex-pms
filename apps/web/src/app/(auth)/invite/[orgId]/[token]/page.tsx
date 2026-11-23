import { getTranslations } from "next-intl/server";
import { AuthCard } from "../../../auth-card";
import { InviteForm } from "./invite-form";

export async function generateMetadata() {
  const t = await getTranslations("auth");
  return { title: t("acceptInvite") };
}

export default async function InvitePage({
  params,
}: {
  params: Promise<{ orgId: string; token: string }>;
}) {
  const { orgId, token } = await params;
  const t = await getTranslations("auth");
  return (
    <AuthCard title={t("acceptInvite")}>
      <InviteForm
        orgId={orgId}
        token={token}
        labels={{
          name: t("name"),
          password: t("setPassword"),
          passwordHint: t("passwordHint"),
          submit: t("acceptInvite"),
        }}
      />
    </AuthCard>
  );
}
