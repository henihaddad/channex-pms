import { getTranslations } from "next-intl/server";
import { Button, Card, Field, Input, PageTitle, Select } from "@/components/ui";
import { guard } from "@/server/guard";
import {
  cancelBlockAction,
  createBlockAction,
  loadBlocks,
  setUnitStatusAction,
} from "../operations.actions";

/** Blocks incl. owner stays, and unit status (OOO reduces availability, OOS does not). */
export default async function BlocksPage() {
  const t = await getTranslations("operations");
  const { blocks, units } = await guard(() => loadBlocks());
  return (
    <div className="space-y-4">
      <PageTitle>{t("blocks")}</PageTitle>
      <Card>
        <form
          action={createBlockAction}
          className="grid grid-cols-6 items-end gap-2 text-sm"
          data-testid="block-form"
        >
          <div className="col-span-2">
            <label className="mb-1 block text-xs font-medium">Unit</label>
            <Select name="unitId" required>
              {units.map((u) => (
                <option key={u.id} value={u.id} data-property={u.propertyId} data-rt={u.roomTypeId}>
                  {u.propertyTitle} · {u.name}
                </option>
              ))}
            </Select>
          </div>
          <Field label="From" name="dateFrom" type="date" />
          <Field label="To (exclusive)" name="dateTo" type="date" />
          <div>
            <label className="mb-1 block text-xs font-medium">Reason</label>
            <Select name="reason">
              <option value="owner_stay">owner stay</option>
              <option value="maintenance">maintenance</option>
              <option value="staff">staff</option>
              <option value="renovation">renovation</option>
            </Select>
          </div>
          <Button type="submit">{t("addBlock")}</Button>
          <input type="hidden" name="propertyId" value={units[0]?.propertyId ?? ""} />
          <input type="hidden" name="roomTypeId" value={units[0]?.roomTypeId ?? ""} />
          <p className="col-span-6 text-xs text-muted">{t("blockHint")}</p>
        </form>
      </Card>
      <Card>
        <table className="w-full text-sm">
          <tbody>
            {blocks.map((b) => (
              <tr key={b.id} className="border-t border-line">
                <td className="py-1">
                  {b.propertyTitle} · {b.unitName ?? "room type"}
                </td>
                <td>
                  {b.dateFrom} → {b.dateTo}
                </td>
                <td>
                  {b.reason}
                  {b.reducesAvailability ? "" : " (no availability impact)"}
                </td>
                <td className="text-end">
                  <form action={cancelBlockAction}>
                    <input type="hidden" name="blockId" value={b.id} />
                    <button className="text-xs text-rose underline">{t("remove")}</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Card>
        <h2 className="mb-2 font-semibold">{t("unitStatus")}</h2>
        <ul className="text-sm">
          {units.map((u) => (
            <li key={u.id} className="flex items-center justify-between border-t border-line py-1">
              <span>
                {u.propertyTitle} · {u.name}
              </span>
              <form action={setUnitStatusAction} className="flex items-center gap-1">
                <input type="hidden" name="unitId" value={u.id} />
                <Select name="status" defaultValue={u.status} className="h-7 w-44 text-xs">
                  {[
                    "clean",
                    "dirty",
                    "in_progress",
                    "inspected",
                    "out_of_order",
                    "out_of_service",
                  ].map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </Select>
                <Button type="submit" variant="secondary" className="h-7 px-2 text-xs">
                  Set
                </Button>
              </form>
            </li>
          ))}
        </ul>
        <Input type="hidden" />
      </Card>
    </div>
  );
}
