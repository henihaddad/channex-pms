import { getTranslations } from "next-intl/server";
import { Card, SectionTitle, TBody, Table, Td, Tr } from "@/components/ui";
import { guard } from "@/server/guard";
import { listMembers, listPendingInvitations, revokeMember } from "./members.actions";
import { InviteForm } from "./invite-form";
import { SYSTEM_ROLES } from "@pms/authz";

export default async function MembersPage() {
  const t = await getTranslations("members");
  const [members, pending] = await guard(() =>
    Promise.all([listMembers(), listPendingInvitations()]),
  );
  return (
    <div className="space-y-6">
      <SectionTitle>{t("title")}</SectionTitle>
      <Card title={t("invite")}>
        <InviteForm roles={[...SYSTEM_ROLES]} labels={{ role: t("role"), submit: t("invite") }} />
      </Card>
      <Card>
        {members.length === 0 ? <p className="text-sm text-muted">{t("empty")}</p> : null}
        <Table>
          <TBody>
            {members.map((m) => (
              <Tr key={m.grantId}>
                <Td>{m.name}</Td>
                <Td>{m.email}</Td>
                <Td>
                  <code className="rounded bg-background px-1.5 py-0.5 text-xs">{m.roleKey}</code>
                </Td>
                <Td className="text-end">
                  <form action={revokeMember}>
                    <input type="hidden" name="grantId" value={m.grantId} />
                    <button type="submit" className="text-xs text-danger underline">
                      {t("revoke")}
                    </button>
                  </form>
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </Card>
      {pending.length > 0 ? (
        <Card title={t("pending")}>
          <ul className="text-sm text-foreground">
            {pending.map((p) => (
              <li key={p.id}>
                {p.email} · <code className="text-xs">{p.roleKey}</code>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
