import { getLocale, getTranslations } from "next-intl/server";
import {
  Card,
  ConfirmSubmit,
  DataTable,
  Field,
  PageHeader,
  Select,
  SubmitButton,
} from "@/components/ui";
import { guard } from "@/server/guard";
import { day } from "@/lib/format";
import {
  cancelBlockAction,
  createBlockAction,
  loadBlocks,
  setUnitStatusAction,
} from "../operations.actions";

export async function generateMetadata() {
  const t = await getTranslations("operations");
  return { title: t("blocksTitle") };
}

const REASONS = ["owner_stay", "maintenance", "staff", "renovation"] as const;
const UNIT_STATUSES = [
  "clean",
  "dirty",
  "in_progress",
  "inspected",
  "out_of_order",
  "out_of_service",
] as const;

/** The night before an exclusive end date: a block is stored half-open, shown as its last night. */
const lastNightOf = (dateTo: string): string => {
  const d = new Date(`${dateTo}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
};

/**
 * Blocks incl. owner stays, and unit status (out of order reduces availability, out of service does
 * not). Persona: the operations coordinator.
 */
export default async function BlocksPage() {
  const t = await getTranslations("operations");
  const locale = await getLocale();
  const { blocks, units } = await guard(() => loadBlocks());
  const reason = (k: string) => (t.has(`blockReason.${k}`) ? t(`blockReason.${k}`) : k);
  const unitStatus = (k: string) => (t.has(`unitState.${k}`) ? t(`unitState.${k}`) : k);
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={t("blocksTitle")} description={t("blockHint")} />
      <Card title={t("addBlock")}>
        <form
          action={createBlockAction}
          className="grid grid-cols-1 items-end gap-3 text-sm sm:grid-cols-2 lg:grid-cols-6"
          data-testid="block-form"
        >
          <Select name="unit" label={t("unit")} required className="lg:col-span-2">
            {units.map((u) => (
              <option key={u.id} value={`${u.propertyId}:${u.roomTypeId}:${u.id}`}>
                {u.propertyTitle} · {u.name}
              </option>
            ))}
          </Select>
          <Field label={t("firstNight")} name="dateFrom" type="date" />
          <Field
            label={t("lastNight")}
            name="lastNight"
            type="date"
            description={t("lastNightHint")}
          />
          <Select name="reason" label={t("reason")} defaultValue="owner_stay">
            {REASONS.map((r) => (
              <option key={r} value={r}>
                {reason(r)}
              </option>
            ))}
          </Select>
          <SubmitButton pendingLabel={t("adding")}>{t("addBlock")}</SubmitButton>
        </form>
      </Card>
      <Card title={t("blocks")}>
        <DataTable
          testId="blocks"
          empty={t("noBlocks")}
          columns={[
            t("unit"),
            t("nights"),
            t("reason"),
            { label: <span className="sr-only">{t("colActions")}</span>, align: "end" },
          ]}
          rowKey={(_r, i) => blocks[i]!.id}
          rows={blocks.map((b) => {
            const where = `${b.propertyTitle} · ${b.unitName ?? t("wholeRoomType")}`;
            const nights = t("blockNights", {
              from: day(b.dateFrom, locale),
              to: day(lastNightOf(b.dateTo), locale),
            });
            return [
              where,
              nights,
              <span key="r">
                {reason(b.reason)}
                {b.reducesAvailability ? "" : ` · ${t("noAvailabilityImpact")}`}
              </span>,
              <form key="x" action={cancelBlockAction}>
                <input type="hidden" name="blockId" value={b.id} />
                <ConfirmSubmit
                  title={t("removeBlockTitle")}
                  body={t("removeBlockBody", { where, nights })}
                  confirmLabel={t("removeBlockConfirm")}
                  cancelLabel={t("removeBlockCancel")}
                  pendingLabel={t("removing")}
                  aria-label={t("removeBlockLabel", { where, nights })}
                  testId="remove-block"
                >
                  {t("remove")}
                </ConfirmSubmit>
              </form>,
            ];
          })}
        />
      </Card>
      <Card title={t("unitStatus")} description={t("unitStatusHint")}>
        <ul className="text-sm">
          {units.map((u) => {
            const name = `${u.propertyTitle} · ${u.name}`;
            return (
              <li
                key={u.id}
                className="flex flex-wrap items-center justify-between gap-2 border-t border-border py-2 first:border-t-0"
              >
                <span>{name}</span>
                <form action={setUnitStatusAction} className="flex items-center gap-2">
                  <input type="hidden" name="unitId" value={u.id} />
                  <Select
                    id={`status-${u.id}`}
                    name="status"
                    defaultValue={u.status}
                    className="w-48"
                    size="sm"
                    aria-label={t("statusOf", { unit: name })}
                  >
                    {UNIT_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {unitStatus(s)}
                      </option>
                    ))}
                  </Select>
                  <SubmitButton variant="secondary" size="sm" pendingLabel={t("saving")}>
                    {t("saveStatus")}
                  </SubmitButton>
                </form>
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
