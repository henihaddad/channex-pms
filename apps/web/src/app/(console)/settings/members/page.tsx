import { getTranslations } from "next-intl/server";
import { Card, PageTitle } from "@/components/ui";
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
      <PageTitle>{t("title")}</PageTitle>
      <Card>
        <h2 className="mb-3 font-semibold">{t("invite")}</h2>
        <InviteForm roles={[...SYSTEM_ROLES]} labels={{ role: t("role"), submit: t("invite") }} />
      </Card>
      <Card>
        {members.length === 0 ? <p className="text-sm text-slate-500">{t("empty")}</p> : null}
        <table className="w-full text-sm">
          <tbody>
            {members.map((m) => (
              <tr key={m.grantId} className="border-t border-slate-100">
                <td className="py-2 font-medium">{m.name}</td>
                <td className="py-2 text-slate-500">{m.email}</td>
                <td className="py-2">
                  <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">{m.roleKey}</code>
                </td>
                <td className="py-2 text-end">
                  <form action={revokeMember}>
                    <input type="hidden" name="grantId" value={m.grantId} />
                    <button type="submit" className="text-xs text-rose-700 underline">
                      {t("revoke")}
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      {pending.length > 0 ? (
        <Card>
          <h2 className="mb-2 font-semibold">{t("pending")}</h2>
          <ul className="text-sm text-slate-700">
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
