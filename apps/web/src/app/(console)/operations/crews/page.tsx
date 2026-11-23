import { getTranslations } from "next-intl/server";
import {
  Card,
  EmptyState,
  Field,
  PageHeader,
  Select,
  SubmitButton,
  TextareaField,
} from "@/components/ui";
import { guard } from "@/server/guard";
import {
  addCrewMemberAction,
  createChecklistAction,
  createCrewAction,
  loadCrewsAndChecklists,
} from "../operations.actions";

export async function generateMetadata() {
  const t = await getTranslations("operations");
  return { title: t("crewsTitle") };
}

/** The task types a checklist can be written for (spec 08 §8.7). */
const CHECKLIST_TYPES = ["changeover", "departure", "mid_stay", "deep"] as const;

/** Crews & checklists (spec 08 §8.6–8.7). Persona: the operations coordinator. */
export default async function CrewsPage() {
  const t = await getTranslations("operations");
  const tb = await getTranslations("operations.board");
  const { crews, checklists } = await guard(() => loadCrewsAndChecklists());
  const type = (k: string) => (tb.has(`type.${k}`) ? tb(`type.${k}`) : k);
  const crewRole = (k: string) => (t.has(`crewRole.${k}`) ? t(`crewRole.${k}`) : k);
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={t("crewsTitle")} description={t("crewsLead")} />
      <Card title={t("addCrew")}>
        <form
          action={createCrewAction}
          className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-5"
        >
          <Field label={t("crewName")} name="name" />
          <Field label={t("serviceArea")} name="serviceArea" required={false} />
          <Field
            label={t("baseLat")}
            name="lat"
            required={false}
            defaultValue="38.72"
            inputMode="decimal"
          />
          <Field
            label={t("baseLng")}
            name="lng"
            required={false}
            defaultValue="-9.14"
            inputMode="decimal"
          />
          <SubmitButton pendingLabel={t("adding")}>{t("addCrew")}</SubmitButton>
          <p className="text-xs text-muted sm:col-span-2 lg:col-span-5">{t("baseHint")}</p>
        </form>
      </Card>
      {crews.length === 0 ? (
        <Card>
          <EmptyState title={t("noCrews")} description={t("noCrewsHint")} />
        </Card>
      ) : null}
      {crews.map((c) => (
        <Card key={c.id} title={c.name} description={c.serviceArea ?? undefined}>
          {c.members.length === 0 ? (
            <p className="text-sm text-muted">{t("noMembers")}</p>
          ) : (
            <ul className="mb-3 text-sm">
              {c.members.map((m) => (
                <li key={m.userId}>
                  {m.name} · {crewRole(m.role)}
                </li>
              ))}
            </ul>
          )}
          <form action={addCrewMemberAction} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="crewId" value={c.id} />
            <Field
              id={`email-${c.id}`}
              label={t("memberEmail")}
              name="email"
              type="email"
              autoComplete="off"
              spellCheck={false}
              description={t("memberEmailHint")}
              className="min-w-64 flex-1"
            />
            <Select id={`role-${c.id}`} name="role" label={t("crewRoleLabel")} className="w-40">
              <option value="cleaner">{crewRole("cleaner")}</option>
              <option value="lead">{crewRole("lead")}</option>
            </Select>
            <SubmitButton variant="secondary" pendingLabel={t("adding")}>
              {t("addMember")}
            </SubmitButton>
          </form>
        </Card>
      ))}
      <Card title={t("checklists")}>
        {checklists.length === 0 ? (
          <p className="mb-3 text-sm text-muted">{t("noChecklists")}</p>
        ) : (
          <ul className="mb-3 text-sm">
            {checklists.map((c) => (
              <li key={c.id}>
                {c.name} · {type(c.taskType)} ·{" "}
                {t("checklistItems", {
                  n: c.items.length,
                  photos: c.items.filter((i) => i.requiresPhoto).length,
                })}
              </li>
            ))}
          </ul>
        )}
        <form
          action={createChecklistAction}
          className="grid grid-cols-1 items-end gap-3 sm:grid-cols-3"
          data-testid="checklist-form"
        >
          <Field label={t("checklistName")} name="checklistName" />
          <Select name="taskType" label={t("taskType")}>
            {CHECKLIST_TYPES.map((k) => (
              <option key={k} value={k}>
                {type(k)}
              </option>
            ))}
          </Select>
          <TextareaField
            label={t("checklistItemsLabel")}
            description={t("checklistItemsHint")}
            name="items"
            rows={4}
            className="sm:col-span-3"
            defaultValue={t("checklistDefault")}
          />
          <SubmitButton variant="secondary" pendingLabel={t("adding")}>
            {t("addChecklist")}
          </SubmitButton>
        </form>
      </Card>
    </div>
  );
}
