"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { createPropertyAction, saveTemplateAction } from "../properties.actions";
import { Alert, Button, Field, Input, Label, Select } from "@/components/ui";

type RoomType = { title: string; countOfRooms: number; occAdults: number; occChildren: number };
type RatePlan = { title: string; roomTypeTitle?: string; baseRateMinor: number; minStay: number };

/**
 * Property wizard (spec 03 §3.2): kind first. A single_unit listing asks for
 * nothing about rooms (MODEL-1); multi_unit and hotel add room types and plans.
 */
export function PropertyWizard({
  templates,
  groups,
}: {
  templates: Array<{ id: string; name: string }>;
  groups: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [kind, setKind] = useState<"single_unit" | "multi_unit" | "hotel">("single_unit");
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([
    { title: "Double Room", countOfRooms: 2, occAdults: 2, occChildren: 0 },
  ]);
  const [ratePlans, setRatePlans] = useState<RatePlan[]>([
    { title: "Standard", baseRateMinor: 10000, minStay: 1 },
  ]);
  const [state, action, pending] = useActionState(createPropertyAction, {});
  if (state.createdId) router.push(`/properties/${state.createdId}`);
  const rtJson = JSON.stringify(kind === "single_unit" ? [] : roomTypes);
  const rpJson = JSON.stringify(
    ratePlans.map((r) => ({
      ...r,
      roomTypeTitle: kind === "single_unit" ? undefined : (r.roomTypeTitle ?? roomTypes[0]?.title),
    })),
  );
  return (
    <form action={action} className="space-y-5" data-testid="property-wizard">
      {state.error ? <Alert>{state.error}</Alert> : null}
      <fieldset className="grid grid-cols-3 gap-3">
        {(["single_unit", "multi_unit", "hotel"] as const).map((k) => (
          <label
            key={k}
            className={`cursor-pointer rounded-lg border p-3 text-sm ${kind === k ? "border-emerald-500 bg-emerald-50" : "border-slate-200"}`}
          >
            <input
              type="radio"
              name="kind"
              value={k}
              checked={kind === k}
              onChange={() => setKind(k)}
              className="me-2"
            />
            <span className="font-medium">{k.replace("_", " ")}</span>
            <p className="mt-1 text-xs text-slate-500">
              {k === "single_unit"
                ? "One listing, one unit. Rooms are managed for you."
                : k === "multi_unit"
                  ? "Several units of one or more types."
                  : "Room types with counts; front-desk features."}
            </p>
          </label>
        ))}
      </fieldset>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Title" name="title" placeholder="Alfama Loft" />
        <div>
          <Label htmlFor="templateId">Template</Label>
          <Select id="templateId" name="templateId" defaultValue="">
            <option value="">None</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </div>
        <Field label="Currency" name="currency" defaultValue="EUR" />
        <Field label="Timezone" name="timezone" defaultValue="Europe/Lisbon" />
        <Field label="City" name="city" required={false} />
        <Field label="Country" name="country" required={false} defaultValue="PT" />
      </div>
      {groups.length > 0 ? (
        <div>
          <Label>Groups</Label>
          <div className="flex flex-wrap gap-3 text-sm">
            {groups.map((g) => (
              <label key={g.id}>
                <input type="checkbox" name="groupIds" value={g.id} className="me-1" />
                {g.name}
              </label>
            ))}
          </div>
        </div>
      ) : null}
      {kind !== "single_unit" ? (
        <div className="space-y-2">
          <Label>Room types</Label>
          {roomTypes.map((rt, i) => (
            <div key={i} className="grid grid-cols-4 gap-2">
              <Input
                value={rt.title}
                onChange={(e) =>
                  setRoomTypes(
                    roomTypes.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)),
                  )
                }
                placeholder="Title"
              />
              <Input
                type="number"
                min={1}
                value={rt.countOfRooms}
                onChange={(e) =>
                  setRoomTypes(
                    roomTypes.map((x, j) =>
                      j === i ? { ...x, countOfRooms: Number(e.target.value) } : x,
                    ),
                  )
                }
              />
              <Input
                type="number"
                min={1}
                value={rt.occAdults}
                onChange={(e) =>
                  setRoomTypes(
                    roomTypes.map((x, j) =>
                      j === i ? { ...x, occAdults: Number(e.target.value) } : x,
                    ),
                  )
                }
              />
              <Input
                type="number"
                min={0}
                value={rt.occChildren}
                onChange={(e) =>
                  setRoomTypes(
                    roomTypes.map((x, j) =>
                      j === i ? { ...x, occChildren: Number(e.target.value) } : x,
                    ),
                  )
                }
              />
            </div>
          ))}
          <Button
            type="button"
            variant="secondary"
            onClick={() =>
              setRoomTypes([
                ...roomTypes,
                {
                  title: `Room type ${String(roomTypes.length + 1)}`,
                  countOfRooms: 1,
                  occAdults: 2,
                  occChildren: 0,
                },
              ])
            }
          >
            Add room type
          </Button>
        </div>
      ) : null}
      <div className="space-y-2">
        <Label>Rate plans (base rate in minor units, e.g. 12000 = 120.00)</Label>
        {ratePlans.map((rp, i) => (
          <div key={i} className="grid grid-cols-4 gap-2">
            <Input
              value={rp.title}
              onChange={(e) =>
                setRatePlans(
                  ratePlans.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)),
                )
              }
            />
            {kind !== "single_unit" ? (
              <Select
                value={rp.roomTypeTitle ?? roomTypes[0]?.title}
                onChange={(e) =>
                  setRatePlans(
                    ratePlans.map((x, j) =>
                      j === i ? { ...x, roomTypeTitle: e.target.value } : x,
                    ),
                  )
                }
              >
                {roomTypes.map((rt) => (
                  <option key={rt.title} value={rt.title}>
                    {rt.title}
                  </option>
                ))}
              </Select>
            ) : (
              <span />
            )}
            <Input
              type="number"
              min={0}
              value={rp.baseRateMinor}
              onChange={(e) =>
                setRatePlans(
                  ratePlans.map((x, j) =>
                    j === i ? { ...x, baseRateMinor: Number(e.target.value) } : x,
                  ),
                )
              }
            />
            <Input
              type="number"
              min={1}
              value={rp.minStay}
              onChange={(e) =>
                setRatePlans(
                  ratePlans.map((x, j) =>
                    j === i ? { ...x, minStay: Number(e.target.value) } : x,
                  ),
                )
              }
            />
          </div>
        ))}
        <Button
          type="button"
          variant="secondary"
          onClick={() =>
            setRatePlans([
              ...ratePlans,
              { title: `Plan ${String(ratePlans.length + 1)}`, baseRateMinor: 10000, minStay: 1 },
            ])
          }
        >
          Add rate plan
        </Button>
      </div>
      <div className="max-w-xs">
        <Label htmlFor="templateName">Template name (for &quot;Save as template&quot;)</Label>
        <Input
          id="templateName"
          name="templateName"
          defaultValue={`Template ${new Date().toISOString().slice(0, 10)}`}
        />
      </div>
      <input type="hidden" name="roomTypes" value={rtJson} />
      <input type="hidden" name="ratePlans" value={rpJson} />
      <div className="flex gap-2">
        <Button type="submit" disabled={pending} data-testid="create-property">
          Create property
        </Button>
        <Button type="submit" variant="secondary" formAction={saveTemplateAction}>
          Save as template
        </Button>
      </div>
    </form>
  );
}
