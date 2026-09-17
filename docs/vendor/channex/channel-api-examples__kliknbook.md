<!-- https://docs.channex.io/channel-api-examples/kliknbook.md -->
> For the complete documentation index, see [llms.txt](https://docs.channex.io/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://docs.channex.io/channel-api-examples/kliknbook.md).

# Kliknbook

This guide walks through creating a channel connection between Channex and Kliknbook over the API: discovering the adapter, validating the hotel credentials, reading the rooms and rates on both sides, building the mapping, and creating and activating the connection.

A **channel connection** (a *channel*) links rate plans of a Channex property to rooms and rates on the OTA side. Once the connection is active, Channex pushes availability, rates and restrictions to Kliknbook and receives bookings back.

Every OTA has its own API and data model, so the connection settings and the mapping settings differ per channel. The flow below is shared by most channels (Booking.com, Expedia, Agoda, Open Channel–based OTAs and others); the payloads shown are the Kliknbook ones. Airbnb is the exception — it requires an OAuth authorization step and is covered by a separate guide.

All endpoints require authentication with an API key, sent in the `user-api-key` header.

#### The flow at a glance

1. Get the adapter descriptor — what settings and mapping fields Kliknbook needs.
2. Collect the settings from the user and run a test connection.
3. Get the mapping details — the rooms and rates on the Kliknbook side.
4. Collect the Channex side — the property, its room types and rate plans.
5. Build the mapping structure.
6. Create the connection.
7. Activate it.

#### 1. Get the adapter descriptor

Each channel is described by an **adapter descriptor**: the settings it needs (`params`) and the per-mapping fields it needs (`rate_params`).

```
GET /api/v1/channels/adapter?code=Kliknbook
```

The full catalog of adapters is available at `GET /api/v1/channels/list`.

Response (abridged):

```json
{
  "data": {
    "code": "Kliknbook",
    "title": "Kliknbook",
    "kind": "meta",
    "actions": [],
    "params": {
      "hotel_code": {
        "position": 0,
        "type": "string",
        "title": "Hotel Code"
      },
      "max_stay_type": {
        "default": "Arrival",
        "position": 1,
        "type": "switch",
        "options": ["Arrival", "Through"],
        "title": "Max Stay Type"
      },
      "email": {
        "position": 2,
        "type": "string",
        "title": "Property Email",
        "rules": [
          {
            "apply": "hidden",
            "when": false,
            "influence_field": "send_email_notifications",
            "with_value": ""
          }
        ]
      },
      "send_email_notifications": {
        "default": false,
        "position": 3,
        "type": "boolean",
        "title": "Send Property Notification"
      }
    },
    "rate_params": {
      "rate_plan_code": { "position": 0, "title": "Rate", "type": "string" },
      "room_type_code": { "position": 1, "title": "Room", "type": "string" },
      "occupancy": { "position": 2, "title": "Occupancy", "type": "integer" },
      "pricing_type": { "position": 3, "title": "Pricing Type", "type": "string" },
      "primary_occ": { "position": 4, "title": "Primary Occupancy", "type": "boolean" }
    }
  }
}
```

What to read from it:

* **`params`** — the connection settings to collect from the user. Each entry describes one field: `title` (English label), `type` (`string`, `integer`, `boolean`, `select`, `switch`, `hidden`), `position` (ordering for a UI), `default`, `options` (for `select` and `switch` fields) and conditional display `rules`.
* **`rate_params`** — the fields each rate plan mapping must carry (step 5), described the same way.

For Kliknbook, the only setting to collect from the user is **`hotel_code`** — the Kliknbook Hotel Code. The remaining settings have sensible defaults; see the settings reference.

#### 2. Test the connection

Before creating anything, validate the collected settings with a test connection:

```
POST /api/v1/channels/test_connection
```

```json
{
  "channel": "Kliknbook",
  "settings": {
    "hotel_code": "KNB-20418"
  }
}
```

`channel` is the adapter code from the descriptor; `settings` is the object built from `params`.

Response:

```json
{
  "data": {
    "success": true,
    "errors": null
  }
}
```

`success: true` means the credentials are correct and the hotel is ready for connection on the Kliknbook side. On failure the response is still `200 OK` with `success: false` — check the `success` field, not the status code.

Kliknbook has no dedicated test endpoint, so the check reads the hotel's products; `hotel_code` is required, and a `settings` object without it is rejected before the request leaves Channex.

#### 3. Get the mapping details

Next, fetch the rooms and rates the hotel exposes on the Kliknbook side:

```
POST /api/v1/channels/mapping_details
```

The payload is the same as for the test connection:

```json
{
  "channel": "Kliknbook",
  "settings": {
    "hotel_code": "KNB-20418"
  }
}
```

Response:

```json
{
  "data": {
    "pricing_type": "OBP",
    "rooms": [
      {
        "id": "RT-4471",
        "title": "Superior Queen Room",
        "rates": [
          {
            "id": "RP-88120",
            "title": "Room Only"
          },
          {
            "id": "RP-88121",
            "title": "Breakfast Included"
          }
        ]
      }
    ]
  }
}
```

Every channel returns its own mapping-details shape; this one is Kliknbook's.

**`pricing_type`** — the hotel's pricing model. Kliknbook uses occupancy-based pricing only, so it is always `OBP`: each rate carries a price per occupancy option.

**`rooms`** — the rooms available for mapping. Each room carries:

| Field   | Description                    |
| ------- | ------------------------------ |
| `id`    | Room ID on the Kliknbook side. |
| `title` | Room title.                    |
| `rates` | Rates of the room.             |

Each rate carries:

| Field   | Description                    |
| ------- | ------------------------------ |
| `id`    | Rate ID on the Kliknbook side. |
| `title` | Rate title.                    |

Kliknbook does not publish occupancy options per rate: the occupancies a mapping serves come from the Channex rate plan, not from this response.

#### 4. Collect the Channex side

Kliknbook connections are one-to-one: **one connection maps exactly one Channex property to one Kliknbook hotel**. Pick the property to connect, then fetch its room types and rate plans through the `options` endpoints:

```
GET /api/v1/room_types/options?filter[property_id]={property_id}
GET /api/v1/rate_plans/options?filter[property_id]={property_id}&multi_occupancy=true
```

Enable `multi_occupancy` on the rate plans request: for occupancy-based rate plans it expands each occupancy option into its own entry, which is exactly the granularity Kliknbook mappings need.

#### 5. Build the mapping structure

The mapping is a list of `rate_plans` entries, one per (Channex rate plan occupancy → Kliknbook room/rate/occupancy) pair:

```json
{
  "rate_plan_id": "a35f1fd4-63c6-4fbc-8fbe-359869bd9958",
  "settings": {
    "room_type_code": "RT-4471",
    "rate_plan_code": "RP-88120",
    "occupancy": 2,
    "pricing_type": "OBP",
    "primary_occ": true
  }
}
```

**`rate_plan_id`** — the Channex rate plan UUID (from step 4).

**`settings`** — the fields declared by `rate_params` in the adapter descriptor:

| Field            | Description                                                                                                                                                                         |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `room_type_code` | Room ID on the Kliknbook side.                                                                                                                                                      |
| `rate_plan_code` | Rate ID on the Kliknbook side.                                                                                                                                                      |
| `occupancy`      | The occupancy option of the Kliknbook rate this mapping serves.                                                                                                                     |
| `pricing_type`   | The hotel's pricing model — always `OBP` for Kliknbook.                                                                                                                             |
| `primary_occ`    | Whether this mapping is the primary one for its room + rate pair. The primary mapping sends availability and restrictions along with prices; non-primary mappings send prices only. |

Mark **exactly one mapping of each room + rate pair** as primary, and create one mapping per occupancy option you want to sell.

A full mapping for one Kliknbook rate sold at occupancies 1 and 2:

```json
[
  {
    "rate_plan_id": "a35f1fd4-63c6-4fbc-8fbe-359869bd9958",
    "settings": {
      "room_type_code": "RT-4471",
      "rate_plan_code": "RP-88120",
      "occupancy": 2,
      "pricing_type": "OBP",
      "primary_occ": true
    }
  },
  {
    "rate_plan_id": "2a0c416b-d8e6-4950-b52e-e7821030fd9d",
    "settings": {
      "room_type_code": "RT-4471",
      "rate_plan_code": "RP-88120",
      "occupancy": 1,
      "pricing_type": "OBP",
      "primary_occ": false
    }
  }
]
```

#### 6. Create the connection

```
POST /api/v1/channels
```

The payload is wrapped in a `channel` key:

```json
{
  "channel": {
    "channel": "Kliknbook",
    "group_id": "60674dd6-1aeb-4c41-9e0c-8ffb378a4570",
    "title": "Kliknbook Channel",
    "properties": ["acb388d9-546b-42fc-9ae2-baf00e7f0d8c"],
    "settings": {
      "hotel_code": "KNB-20418",
      "max_stay_type": "Arrival"
    },
    "rate_plans": [
      {
        "rate_plan_id": "a35f1fd4-63c6-4fbc-8fbe-359869bd9958",
        "settings": {
          "room_type_code": "RT-4471",
          "rate_plan_code": "RP-88120",
          "occupancy": 2,
          "pricing_type": "OBP",
          "primary_occ": true
        }
      },
      {
        "rate_plan_id": "2a0c416b-d8e6-4950-b52e-e7821030fd9d",
        "settings": {
          "room_type_code": "RT-4471",
          "rate_plan_code": "RP-88120",
          "occupancy": 1,
          "pricing_type": "OBP",
          "primary_occ": false
        }
      }
    ]
  }
}
```

| Field        | Description                                                                                                |
| ------------ | ---------------------------------------------------------------------------------------------------------- |
| `channel`    | The adapter code from the descriptor.                                                                      |
| `group_id`   | UUID of the group the connection belongs to. Required.                                                     |
| `title`      | Connection title. Optional — generated from the channel and property names when omitted.                   |
| `properties` | UUIDs of the connected properties. One property for Kliknbook.                                             |
| `settings`   | The connection settings built from `params` — the same object the test connection validated.               |
| `rate_plans` | The mapping structure from step 5. Optional — mappings can also be added later by updating the connection. |

The response is `201 Created` with the channel connection resource (abridged):

```json
{
  "data": {
    "type": "channel",
    "id": "ca4ac55f-3be1-4039-9542-21e8285ffbf9",
    "attributes": {
      "id": "ca4ac55f-3be1-4039-9542-21e8285ffbf9",
      "title": "Kliknbook Channel",
      "channel": "Kliknbook",
      "is_active": false,
      "actions": [],
      "properties": ["acb388d9-546b-42fc-9ae2-baf00e7f0d8c"],
      "settings": {
        "hotel_code": "KNB-20418",
        "max_stay_type": "Arrival"
      },
      "rate_plans": [
        {
          "id": "9d7e45b3-367b-4286-a081-17a6c8d3c62e",
          "rate_plan_id": "a35f1fd4-63c6-4fbc-8fbe-359869bd9958",
          "settings": {
            "room_type_code": "RT-4471",
            "rate_plan_code": "RP-88120",
            "occupancy": 2,
            "pricing_type": "OBP",
            "primary_occ": true
          }
        },
        {
          "id": "0f6fe97e-ab8b-4f0b-a1cd-dc3500f18295",
          "rate_plan_id": "2a0c416b-d8e6-4950-b52e-e7821030fd9d",
          "settings": {
            "room_type_code": "RT-4471",
            "rate_plan_code": "RP-88120",
            "occupancy": 1,
            "pricing_type": "OBP",
            "primary_occ": false
          }
        }
      ]
    },
    "relationships": {
      "group": {
        "data": { "id": "60674dd6-1aeb-4c41-9e0c-8ffb378a4570", "type": "group" }
      },
      "properties": {
        "data": [
          { "id": "acb388d9-546b-42fc-9ae2-baf00e7f0d8c", "type": "property" }
        ]
      }
    }
  }
}
```

Note that the connection **starts disabled**: `is_active` in the create payload has no effect — a new connection is always created with `is_active: false`. Activation is a separate, explicit step.

Only one connection per Kliknbook `hotel_code` is allowed on Channex.

#### 7. Activate the connection

```
POST /api/v1/channels/{channel_id}/activate
```

No payload. Activation requires the connection to have at least one property and at least one rate plan mapping; activating starts the synchronization — Channex pushes the full current availability, rates and restrictions to Kliknbook and begins receiving bookings.

The counterpart is `POST /api/v1/channels/{channel_id}/deactivate`, which stops the synchronization but keeps the connection and its mappings.

#### Updating a connection

```
PUT /api/v1/channels/{channel_id}
```

The payload has the same shape as for create (wrapped in `channel`). Two rules matter:

* **`channel` cannot be changed** — a different adapter code is rejected.
* **`rate_plans`, when present, replaces the whole mapping set.** A stored mapping missing from the list is removed, and a mapping sent with `settings: null` is removed as well. Omit `rate_plans` entirely to keep the stored mappings.

#### Deleting a connection

```
DELETE /api/v1/channels/{channel_id}
```

An active connection must be deactivated first. Deleting removes the connection and all its mappings; bookings received through it are kept.

#### Actions

The Kliknbook adapter declares no connection actions — `actions` is empty on the descriptor and on every Kliknbook connection.

#### What gets synchronized

Kliknbook takes availability, rates and restrictions through a single ARI update call, so each batch of changes travels as one request per room + rate pair rather than as separate availability and rate messages.

**Availability** is sent per room and rate. An availability of zero or below is sent as `0`.

**Rates** are sent per room and rate, with the occupancies and their prices merged into the same message, so every mapping sends the price of its own occupancy. A price of `0` is sent as `0`.

**Restrictions** map as follows:

| Channex restriction   | Kliknbook field                        |
| --------------------- | -------------------------------------- |
| `stop_sell`           | closed                                 |
| `closed_to_arrival`   | closed to arrival                      |
| `closed_to_departure` | closed to departure                    |
| `min_stay_arrival`    | min stay arrival                       |
| `min_stay_through`    | min stay through                       |
| `max_stay`            | max stay arrival *or* max stay through |

Both minimum stays are sent, each in its own field. Minimum stays are clamped to 1–28 and maximum stays to 1–31 (a `max_stay` of `0`, meaning no limit in Channex, is sent as `31`).

**`max_stay_type`** decides which field the Channex maximum stay lands in: `Arrival` sends it as max stay arrival, `Through` as max stay through.

**Merging** — for one date, room and rate, the rate, availability and restriction changes of all mapped occupancies are merged into a single message. Where two mappings disagree on a value that is not per-occupancy, the primary mapping wins. Consecutive dates carrying identical values are then collapsed into date ranges, and each request covers at most 180 days.

**Horizon** — changes are pushed for the next 720 days, counted from today in the property's timezone. Changes for dates in the past or beyond that window are dropped.

#### Kliknbook settings reference

The full set of connection `settings` for Kliknbook:

| Setting                    | Description                                                                                                                                                    |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hotel_code`               | The Kliknbook Hotel Code. Required.                                                                                                                            |
| `max_stay_type`            | How the maximum stay restriction is applied: `Arrival` (counted from the arrival date) or `Through` (applied to every stayed-through date). Default `Arrival`. |
| `email`                    | The email address the notifications go to.                                                                                                                     |
| `send_email_notifications` | When `true`, Channex sends a notification about each booking.                                                                                                  |
