import { getTranslations } from "next-intl/server";
import {
  Button,
  Card,
  Field,
  Input,
  Label,
  PageTitle,
  Select,
  TBody,
  Table,
  Td,
  Tr,
} from "@/components/ui";
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
            <Label>Unit</Label>
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
            <Label>Reason</Label>
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
        <Table>
          <TBody>
            {blocks.map((b) => (
              <Tr key={b.id}>
                <Td>
                  {b.propertyTitle} · {b.unitName ?? "room type"}
                </Td>
                <Td>
                  {b.dateFrom} → {b.dateTo}
                </Td>
                <Td>
                  {b.reason}
                  {b.reducesAvailability ? "" : " (no availability impact)"}
                </Td>
                <Td className="text-end">
                  <form action={cancelBlockAction}>
                    <input type="hidden" name="blockId" value={b.id} />
                    <button className="text-xs text-danger underline">{t("remove")}</button>
                  </form>
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </Card>
      <Card title={t("unitStatus")}>
        <ul className="text-sm">
          {units.map((u) => (
            <li
              key={u.id}
              className="flex items-center justify-between border-t border-border py-1"
            >
              <span>
                {u.propertyTitle} · {u.name}
              </span>
              <form action={setUnitStatusAction} className="flex items-center gap-1">
                <input type="hidden" name="unitId" value={u.id} />
                <Select name="status" defaultValue={u.status} className="w-44" size="sm">
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
                <Button type="submit" variant="secondary" size="sm">
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
