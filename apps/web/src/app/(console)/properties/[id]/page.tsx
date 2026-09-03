import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PROVISION_STEPS } from "@pms/core";
import {
  Button,
  Card,
  Field,
  Input,
  PageTitle,
  Select,
  TBody,
  Table,
  Td,
  Tr,
} from "@/components/ui";
import { guard } from "@/server/guard";
import {
  addDerivedPlanAction,
  addPolicyAction,
  forceResyncAction,
  loadProperty,
  updateRoomTypeCountAction,
} from "./property.actions";

export default async function PropertyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getTranslations("properties");
  const d = await guard(() => loadProperty(id));
  const stepIndex = d.provisioning ? PROVISION_STEPS.indexOf(d.provisioning.step) : -1;
  const visibleRoomTypes = d.roomTypes.filter(
    (r) => !r.isSystemManaged || d.property.kind !== "single_unit",
  );
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <PageTitle>{d.property.title}</PageTitle>
        <div className="flex items-center gap-3 text-sm">
          <span className="rounded bg-background px-2 py-0.5 text-xs" data-testid="property-state">
            {d.property.state}
          </span>
          <Link href={`/calendar?propertyId=${d.property.id}`} className="underline">
            {t("openCalendar")}
          </Link>
          <Link href={`/channels/new?propertyId=${d.property.id}`} className="underline">
            {t("connectChannel")}
          </Link>
          <Link
            href={`/properties/${d.property.id}/booking-engine`}
            className="underline"
            data-testid="open-booking-engine"
          >
            {t("bookingEngine")}
          </Link>
        </div>
      </div>
      <Card title={t("provisioning")}>
        <ol className="flex flex-wrap gap-2 text-xs" data-testid="provisioning-steps">
          {PROVISION_STEPS.map((s, i) => (
            <li
              key={s}
              className={`rounded px-2 py-1 ${i < stepIndex || d.provisioning?.step === "live" ? "bg-success-soft text-success-soft-foreground" : i === stepIndex ? "bg-accent-soft text-accent" : "bg-background text-muted"}`}
            >
              {s}
            </li>
          ))}
        </ol>
        {d.provisioning?.lastError ? (
          <p className="mt-2 text-xs text-danger">
            {d.provisioning.lastError} (attempt {d.provisioning.attempts})
          </p>
        ) : null}
        <p className="mt-2 text-xs text-muted">
          Channex id: {d.property.channexPropertyId ?? "—"} · webhook:{" "}
          {d.property.webhookToken ? "registered" : "—"} · cells:{" "}
          {Object.entries(d.health)
            .map(([k, v]) => `${k} ${v}`)
            .join(", ") || "none"}
        </p>
        <form action={forceResyncAction} className="mt-3">
          <input type="hidden" name="propertyId" value={d.property.id} />
          <Button type="submit" variant="secondary">
            {t("forceResync")}
          </Button>
        </form>
      </Card>
      <Card title={t("roomTypes")}>
        <Table>
          <TBody>
            {visibleRoomTypes.map((rt) => (
              <Tr key={rt.id}>
                <Td>{rt.title}</Td>
                <Td>
                  {rt.occAdults} adults · {rt.occChildren} children ·{" "}
                  {d.units.filter((u) => u.roomTypeId === rt.id).length} units
                </Td>
                <Td className="text-end">
                  <form
                    action={updateRoomTypeCountAction}
                    className="flex items-center justify-end gap-2"
                  >
                    <input type="hidden" name="propertyId" value={d.property.id} />
                    <input type="hidden" name="roomTypeId" value={rt.id} />
                    <Input
                      name="countOfRooms"
                      type="number"
                      min={1}
                      defaultValue={rt.countOfRooms}
                      className="w-20"
                    />
                    <Button type="submit" variant="secondary">
                      Set count
                    </Button>
                  </form>
                </Td>
              </Tr>
            ))}
            {visibleRoomTypes.length === 0 ? (
              <Tr>
                <Td>{t("systemManaged")}</Td>
              </Tr>
            ) : null}
          </TBody>
        </Table>
      </Card>
      <Card title={t("ratePlans")}>
        <ul className="mb-4 text-sm" data-testid="rate-plans">
          {d.ratePlans.map((rp) => (
            <li key={rp.id} className="border-t border-border py-1">
              {rp.title}{" "}
              <span className="text-xs text-muted">
                · {d.roomTypes.find((r) => r.id === rp.roomTypeId)?.title} · {rp.currency}
                {rp.parentRatePlanId
                  ? ` · derived ${rp.derivedOption?.direction} ${rp.derivedOption?.kind === "percent" ? `${(rp.derivedOption.value / 100).toFixed(1)}%` : `${rp.derivedOption?.value ?? 0} minor`} from ${d.ratePlans.find((p) => p.id === rp.parentRatePlanId)?.title ?? "?"}`
                  : ""}
                {rp.channexRatePlanId ? " · synced id" : ""}
              </span>
            </li>
          ))}
        </ul>
        <form
          action={addDerivedPlanAction}
          className="grid grid-cols-5 items-end gap-2"
          data-testid="derived-form"
        >
          <input type="hidden" name="propertyId" value={d.property.id} />
          <Field label="Derived plan title" name="title" placeholder="Non-refundable" />
          <div>
            <Select label={"Parent"} name="parentRatePlanId">
              {d.ratePlans.map((rp) => (
                <option key={rp.id} value={rp.id}>
                  {rp.title}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Select label={"Direction"} name="direction">
              <option value="decrease">decrease</option>
              <option value="increase">increase</option>
            </Select>
          </div>
          <div>
            <Select label={"By"} name="kind">
              <option value="percent">percent (bp)</option>
              <option value="amount">amount (minor)</option>
            </Select>
          </div>
          <div className="flex gap-2">
            <Input name="value" type="number" min={0} defaultValue={1000} />
            <Button type="submit">Add</Button>
          </div>
        </form>
      </Card>
      <Card title={t("channels")}>
        {d.connections.length === 0 ? (
          <p className="text-sm text-muted">{t("noChannels")}</p>
        ) : (
          <ul className="text-sm">
            {d.connections.map((c) => (
              <li key={c.id} className="border-t border-border py-1">
                <Link href={`/channels/${c.id}`} className="hover:underline">
                  {c.adapterCode}
                </Link>{" "}
                <span className="text-xs text-muted">
                  · {c.state}
                  {c.readiness.ready
                    ? " · ready"
                    : c.readiness.issues.length
                      ? ` · ${c.readiness.issues.join("; ")}`
                      : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title={t("policies")}>
        <ul className="mb-3 text-sm">
          {d.policies.map((p) => (
            <li key={p.id}>
              {p.title} · in {p.checkInTime} · out {p.checkOutTime}
            </li>
          ))}
        </ul>
        <form action={addPolicyAction} className="grid grid-cols-4 items-end gap-2">
          <input type="hidden" name="propertyId" value={d.property.id} />
          <Field label="Policy title" name="title" placeholder="Flexible" />
          <Field label="Check-in" name="checkInTime" defaultValue="15:00" />
          <Field label="Check-out" name="checkOutTime" defaultValue="11:00" />
          <Button type="submit" variant="secondary">
            Add policy
          </Button>
        </form>
      </Card>
      {d.bulkOps.length > 0 ? (
        <Card title={t("recentOps")}>
          <ul className="text-xs text-muted">
            {d.bulkOps.map((o) => (
              <li key={o.id}>
                {o.createdAt} · {o.cellCount} cells · {o.state}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
