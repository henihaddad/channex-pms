import { getTranslations } from "next-intl/server";
import { Card } from "@/components/ui";
import { TotpForm } from "./totp-form";

export default async function TotpPage() {
  const t = await getTranslations("auth");
  return (
    <Card>
      <h1 className="mb-1 text-xl font-bold">{t("totpTitle")}</h1>
      <p className="mb-4 text-sm text-muted">{t("totpHint")}</p>
      <TotpForm labels={{ code: t("code"), submit: t("continue") }} />
    </Card>
  );
}
