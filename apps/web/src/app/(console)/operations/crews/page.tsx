import { getTranslations } from "next-intl/server";
import { Button, Card, Field, PageTitle, Select } from "@/components/ui";
import { guard } from "@/server/guard";
import {
  addCrewMemberAction,
  createChecklistAction,
  createCrewAction,
  loadCrewsAndChecklists,
} from "../operations.actions";

export default async function CrewsPage() {
  const t = await getTranslations("operations");
  const { crews, checklists } = await guard(() => loadCrewsAndChecklists());
  return (
    <div className="space-y-4">
      <PageTitle>{t("crews")}</PageTitle>
      <Card>
        <form action={createCrewAction} className="grid grid-cols-5 items-end gap-2">
          <Field label="Crew name" name="name" />
          <Field label="Service area" name="serviceArea" required={false} />
          <Field label="Base lat" name="lat" required={false} defaultValue="38.72" />
          <Field label="Base lng" name="lng" required={false} defaultValue="-9.14" />
          <Button type="submit">{t("addCrew")}</Button>
        </form>
      </Card>
      {crews.map((c) => (
        <Card key={c.id}>
          <h2 className="font-semibold">
            {c.name} <span className="text-xs text-slate-500">{c.serviceArea ?? ""}</span>
          </h2>
          <ul className="my-2 text-sm">
            {c.members.map((m) => (
              <li key={m.userId}>
                {m.name} · {m.role}
              </li>
            ))}
          </ul>
          <form action={addCrewMemberAction} className="flex items-end gap-2">
            <input type="hidden" name="crewId" value={c.id} />
            <Field label="Member email (must already be invited)" name="email" type="email" />
            <Select name="role" className="w-32">
              <option value="cleaner">cleaner</option>
              <option value="lead">lead</option>
            </Select>
            <Button type="submit" variant="secondary">
              {t("addMember")}
            </Button>
          </form>
        </Card>
      ))}
      <Card>
        <h2 className="mb-2 font-semibold">{t("checklists")}</h2>
        <ul className="mb-3 text-sm">
          {checklists.map((c) => (
            <li key={c.id}>
              {c.name} · {c.taskType} · {c.items.length} items (
              {c.items.filter((i) => i.requiresPhoto).length} need a photo)
            </li>
          ))}
        </ul>
        <form
          action={createChecklistAction}
          className="grid grid-cols-3 items-end gap-2"
          data-testid="checklist-form"
        >
          <Field label="Checklist name" name="checklistName" />
          <div>
            <label className="mb-1 block text-xs font-medium">Task type</label>
            <Select name="taskType">
              <option value="changeover">changeover</option>
              <option value="departure">departure</option>
              <option value="mid_stay">mid_stay</option>
              <option value="deep">deep</option>
            </Select>
          </div>
          <div className="col-span-3">
            <label className="mb-1 block text-xs font-medium">
              Items, one per line; end with * when a photo is required
            </label>
            <textarea
              name="items"
              rows={4}
              className="w-full rounded-md border border-slate-300 p-2 text-sm"
              defaultValue={"Beds made*\nBathroom cleaned*\nBins emptied\nKeys in lockbox"}
            />
          </div>
          <Button type="submit" variant="secondary">
            {t("addChecklist")}
          </Button>
        </form>
      </Card>
    </div>
  );
}
