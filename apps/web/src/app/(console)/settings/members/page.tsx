import { getTranslations } from "next-intl/server";
import {
  Card,
  ConfirmSubmit,
  EmptyState,
  SectionTitle,
  TBody,
  THead,
  Table,
  Td,
  Th,
  Tr,
} from "@/components/ui";
import { guard } from "@/server/guard";
import { listMembers, listPendingInvitations, revokeMember } from "./members.actions";
import { InviteForm } from "./invite-form";
import { SYSTEM_ROLES } from "@pms/authz";

export async function generateMetadata() {
  const t = await getTranslations("members");
  return { title: t("title") };
}

/** Team & roles (spec 02 §2.3): who can sign in, with which role. Persona: the org owner. */
export default async function MembersPage() {
  const t = await getTranslations("members");
  const [members, pending] = await guard(() =>
    Promise.all([listMembers(), listPendingInvitations()]),
  );
  const role = (key: string | null) =>
    key && t.has(`roles.${key}`) ? t(`roles.${key}`) : (key ?? "—");
  return (
    <div className="space-y-6">
      <SectionTitle>{t("title")}</SectionTitle>
      <Card title={t("invite")}>
        <InviteForm
          roles={SYSTEM_ROLES.map((r) => ({ value: r, label: role(r) }))}
          labels={{
            email: t("email"),
            role: t("role"),
            submit: t("invite"),
            pending: t("inviting"),
          }}
        />
      </Card>
      <Card>
        {members.length <= 1 ? (
          <EmptyState title={t("empty")} description={t("emptyHint")} />
        ) : null}
        {members.length > 0 ? (
          <Table data-testid="members">
            <THead>
              <Tr>
                <Th>{t("colName")}</Th>
                <Th>{t("colEmail")}</Th>
                <Th>{t("role")}</Th>
                <Th className="text-end">
                  <span className="sr-only">{t("colActions")}</span>
                </Th>
              </Tr>
            </THead>
            <TBody>
              {members.map((m) => (
                <Tr key={m.grantId}>
                  <Td>{m.name}</Td>
                  <Td>{m.email}</Td>
                  <Td>{role(m.roleKey)}</Td>
                  <Td className="text-end">
                    <form action={revokeMember}>
                      <input type="hidden" name="grantId" value={m.grantId} />
                      <ConfirmSubmit
                        title={t("removeTitle", { name: m.name })}
                        body={t("removeBody", { name: m.name })}
                        confirmLabel={t("removeConfirm")}
                        cancelLabel={t("removeCancel")}
                        pendingLabel={t("removing")}
                        aria-label={t("removeLabel", { name: m.name })}
                        testId="revoke-member"
                      >
                        {t("revoke")}
                      </ConfirmSubmit>
                    </form>
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        ) : null}
      </Card>
      {pending.length > 0 ? (
        <Card title={t("pending")}>
          <ul className="text-sm text-foreground">
            {pending.map((p) => (
              <li key={p.id}>
                {p.email} · {role(p.roleKey)}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
