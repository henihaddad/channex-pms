"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createStaffBookingAction } from "../reservations.actions";
import { loadProperty } from "../../properties/[id]/property.actions";
import { Alert, Button, Field, Select } from "@/components/ui";

/** Staff booking (spec 08 §8.11): availability-checked, priced from the rate plan, one code path with the booking engine. */
export function StaffBookingForm({
  properties,
}: {
  properties: Array<{ id: string; title: string }>;
}) {
  const router = useRouter();
  const [propertyId, setPropertyId] = useState(properties[0]?.id ?? "");
  const [inventory, setInventory] = useState<{
    roomTypes: Array<{ id: string; title: string }>;
    ratePlans: Array<{ id: string; title: string; roomTypeId: string }>;
  }>({ roomTypes: [], ratePlans: [] });
  const [roomTypeId, setRoomTypeId] = useState("");
  const [state, action, pending] = useActionState(createStaffBookingAction, {});
  useEffect(() => {
    if (!propertyId) return;
    void loadProperty(propertyId).then((d) => {
      setInventory({ roomTypes: d.roomTypes, ratePlans: d.ratePlans });
      setRoomTypeId(d.roomTypes[0]?.id ?? "");
    });
  }, [propertyId]);
  if (state.bookingId) router.push(`/reservations/${state.bookingId}`);
  return (
    <form action={action} className="grid grid-cols-2 gap-4" data-testid="staff-booking-form">
      {state.error ? (
        <div className="col-span-2">
          <Alert>
            {state.error}
            {state.reasons?.length ? ` — ${state.reasons.join("; ")}` : ""}
          </Alert>
        </div>
      ) : null}
      <div>
        <Select
          label={"Property"}
          name="propertyId"
          value={propertyId}
          onChange={(v) => setPropertyId(v)}
        >
          {properties.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Select label={"Source"} name="source" defaultValue="staff">
          <option value="staff">staff</option>
          <option value="phone">phone</option>
          <option value="walk_in">walk-in</option>
          <option value="direct">direct</option>
        </Select>
      </div>
      <div>
        <Select
          label={"Room type"}
          name="roomTypeId"
          value={roomTypeId}
          onChange={(v) => setRoomTypeId(v)}
        >
          {inventory.roomTypes.map((r) => (
            <option key={r.id} value={r.id}>
              {r.title}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Select label={"Rate plan"} name="ratePlanId">
          {inventory.ratePlans
            .filter((r) => r.roomTypeId === roomTypeId)
            .map((r) => (
              <option key={r.id} value={r.id}>
                {r.title}
              </option>
            ))}
        </Select>
      </div>
      <Field label="Arrival" name="arrivalDate" type="date" />
      <Field label="Departure" name="departureDate" type="date" />
      <Field label="Adults" name="adults" type="number" defaultValue="2" />
      <Field label="Children" name="children" type="number" defaultValue="0" required={false} />
      <Field label="Guest first name" name="name" />
      <Field label="Guest surname" name="surname" />
      <Field label="Email" name="email" type="email" required={false} />
      <Field label="Phone" name="phone" required={false} />
      <div className="col-span-2">
        <Button type="submit" disabled={pending} data-testid="create-booking">
          Create booking
        </Button>
        <p className="mt-1 text-xs text-muted">
          Side effects: availability decremented and pushed to every channel, turnover task planned,
          confirmation prepared.
        </p>
      </div>
    </form>
  );
}
