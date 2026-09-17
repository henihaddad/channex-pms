<!-- https://docs.channex.io/channel-api-examples/szallas.md -->
> For the complete documentation index, see [llms.txt](https://docs.channex.io/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://docs.channex.io/channel-api-examples/szallas.md).

# Szallas.hu

This guide walks through creating a channel connection between Channex and Szallas.hu over the API: discovering the adapter, validating the hotel credentials, reading the rooms and rates on both sides, building the mapping, and creating and activating the connection.

A **channel connection** (a *channel*) links rate plans of a Channex property to rooms and rates on the OTA side. Once the connection is active, Channex pushes availability, rates and restrictions to Szallas.hu and receives bookings back.

Every OTA has its own API and data model, so the connection settings and the mapping settings differ per channel. The flow below is shared by most channels (Booking.com, Expedia, Agoda, Open Channel–based OTAs and others); the payloads shown are the Szallas.hu ones. Airbnb is the exception — it requires an OAuth authorization step and is covered by a separate guide.

All endpoints require authentication with an API key, sent in the `user-api-key` header. On the Szallas.hu side Channex is authenticated as a channel manager rather than as the individual property, so the Hotel ID is the only credential to collect from the user.

### The flow at a glance

1. Get the adapter descriptor — what settings and mapping fields Szallas.hu needs.
2. Collect the settings from the user and run a test connection.
3. Get the mapping details — the rooms and rates on the Szallas.hu side.
4. Get the connection details — the currency the hotel trades in and its allocation mode.
5. Collect the Channex side — the property, its room types and rate plans.
6. Build the mapping structure.
7. Create the connection.
8. Activate it.

### 1. Get the adapter descriptor

Each channel is described by an **adapter descriptor**: the settings it needs (`params`) and the per-mapping fields it needs (`rate_params`).

```
GET /api/v1/channels/adapter?code=Szallas
```

The full catalog of adapters is available at `GET /api/v1/channels/list`.

Response (abridged):

```json
{
  "data": {
    "code": "Szallas",
    "title": "Szallas",
    "kind": "meta",
    "actions": [],
    "params": {
      "hotel_id": {
        "position": 0,
        "type": "string",
        "title": "Hotel ID"
      },
      "send_email_notifications": {
        "default": false,
        "position": 1,
        "type": "boolean",
        "title": "Send Property Notification"
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
      "min_stay_type": {
        "default": "Arrival",
        "position": 3,
        "type": "switch",
        "options": ["Arrival", "Through"],
        "title": "Min Stay Type"
      },
      "sync_logic": {
        "default": "Rates and Availability",
        "position": 4,
        "type": "select",
        "options": [
          "Rates and Availability",
          "Full connection",
          "Full connection (no Stop Sell)"
        ],
        "title": "Sync Logic"
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
* **`rate_params`** — the fields each rate plan mapping must carry (step 6), described the same way.

For Szallas.hu, the only setting to collect from the user is **`hotel_id`** — the ID of the property on the Szallas.hu side. The remaining settings have sensible defaults; see the settings reference.

### 2. Test the connection

Before creating anything, validate the collected settings with a test connection:

```
POST /api/v1/channels/test_connection
```

```json
{
  "channel": "Szallas",
  "settings": {
    "hotel_id": "12345"
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

`success: true` means Szallas.hu knows the Hotel ID and its rooms can be read — the test connection is a mapping details call under the hood. On failure the response is still `200 OK` with `success: false` — check the `success` field, not the status code.

`hotel_id` is required here: a `settings` object without it is rejected with an argument error (`hotel_id is required`) before the request reaches Szallas.hu.

### 3. Get the mapping details

Next, fetch the rooms and rates the hotel exposes on the Szallas.hu side:

```
POST /api/v1/channels/mapping_details
```

The payload is the same as for the test connection:

```json
{
  "channel": "Szallas",
  "settings": {
    "hotel_id": "12345"
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
        "id": "88213",
        "title": "Kétágyas szoba",
        "rates": [
          {
            "id": "1",
            "title": "Standard",
            "occupancies": [1, 2],
            "max_persons": 2
          }
        ]
      }
    ]
  }
}
```

Every channel returns its own mapping-details shape; this one is Szallas.hu's.

**`pricing_type`** — the hotel's pricing model. Szallas.hu uses occupancy-based pricing only, so it is always `OBP`: each rate carries a price per occupancy option.

**`rooms`** — the rooms available for mapping. Each room carries:

| Field   | Description                     |
| ------- | ------------------------------- |
| `id`    | Room ID on the Szallas.hu side. |
| `title` | Room title.                     |
| `rates` | Rates of the room.              |

Each rate carries:

| Field         | Description                                 |
| ------------- | ------------------------------------------- |
| `id`          | Rate ID on the Szallas.hu side.             |
| `title`       | Rate title.                                 |
| `occupancies` | Occupancy options of the rate on this room. |
| `max_persons` | Maximum number of persons.                  |

`occupancies` is the room's guest range on the Szallas.hu side (minimum guests through maximum guests), so every rate of a room exposes the same range, and `max_persons` is the room's guest maximum. Rates without a title on the Szallas.hu side are not returned and cannot be mapped.

### 4. Get the connection details

```
POST /api/v1/channels/connection_details
```

Same payload as the previous two requests. Response:

```json
{
  "data": {
    "type": "connection_details",
    "attributes": {
      "currency": "HUF",
      "realtime": true
    }
  }
}
```

For Szallas.hu this returns the currency the hotel trades in and its allocation mode. Rate plans in any currency can be mapped: Channex converts prices to the channel's currency when pushing.

`realtime` is worth checking before connecting: **availability is pushed only for hotels in realtime allocation mode** on the Szallas.hu side. Rates and restrictions are pushed either way. See "What gets synchronized".

### 5. Collect the Channex side

Szallas.hu connections are one-to-one: **one connection maps exactly one Channex property to one Szallas.hu property**. Pick the property to connect, then fetch its room types and rate plans through the `options` endpoints:

```
GET /api/v1/room_types/options?filter[property_id]={property_id}
GET /api/v1/rate_plans/options?filter[property_id]={property_id}&multi_occupancy=true
```

Enable `multi_occupancy` on the rate plans request: for occupancy-based rate plans it expands each occupancy option into its own entry, which is exactly the granularity Szallas.hu mappings need.

### 6. Build the mapping structure

The mapping is a list of `rate_plans` entries, one per (Channex rate plan occupancy → Szallas.hu room/rate/occupancy) pair:

```json
{
  "rate_plan_id": "a35f1fd4-63c6-4fbc-8fbe-359869bd9958",
  "settings": {
    "room_type_code": "88213",
    "rate_plan_code": "1",
    "occupancy": 2,
    "pricing_type": "OBP",
    "primary_occ": true
  }
}
```

**`rate_plan_id`** — the Channex rate plan UUID (from step 5).

**`settings`** — the fields declared by `rate_params` in the adapter descriptor:

| Field            | Description                                                                                                                                                                         |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `room_type_code` | Room ID on the Szallas.hu side.                                                                                                                                                     |
| `rate_plan_code` | Rate ID on the Szallas.hu side.                                                                                                                                                     |
| `occupancy`      | The occupancy option of the Szallas.hu rate this mapping serves.                                                                                                                    |
| `pricing_type`   | The hotel's pricing model — always `OBP` for Szallas.hu.                                                                                                                            |
| `primary_occ`    | Whether this mapping is the primary one for its room + rate pair. The primary mapping sends availability and restrictions along with prices; non-primary mappings send prices only. |

Mark **exactly one mapping of each room + rate pair** as primary, and create one mapping per occupancy option you want to sell.

A full mapping for one Szallas.hu rate sold at occupancies 1 and 2:

```json
[
  {
    "rate_plan_id": "a35f1fd4-63c6-4fbc-8fbe-359869bd9958",
    "settings": {
      "room_type_code": "88213",
      "rate_plan_code": "1",
      "occupancy": 2,
      "pricing_type": "OBP",
      "primary_occ": true
    }
  },
  {
    "rate_plan_id": "2a0c416b-d8e6-4950-b52e-e7821030fd9d",
    "settings": {
      "room_type_code": "88213",
      "rate_plan_code": "1",
      "occupancy": 1,
      "pricing_type": "OBP",
      "primary_occ": false
    }
  }
]
```

The mapping is also what makes an incoming booking recognizable: bookings are matched back to a Channex rate plan by the room + rate pair they carry. A booking for an unmapped room + rate pair still arrives, but as unmapped.

### 7. Create the connection

```
POST /api/v1/channels
```

The payload is wrapped in a `channel` key:

```json
{
  "channel": {
    "channel": "Szallas",
    "group_id": "60674dd6-1aeb-4c41-9e0c-8ffb378a4570",
    "title": "Szallas.hu Channel",
    "properties": ["acb388d9-546b-42fc-9ae2-baf00e7f0d8c"],
    "settings": {
      "hotel_id": "12345",
      "min_stay_type": "Arrival",
      "sync_logic": "Rates and Availability",
      "send_email_notifications": false
    },
    "rate_plans": [
      {
        "rate_plan_id": "a35f1fd4-63c6-4fbc-8fbe-359869bd9958",
        "settings": {
          "room_type_code": "88213",
          "rate_plan_code": "1",
          "occupancy": 2,
          "pricing_type": "OBP",
          "primary_occ": true
        }
      },
      {
        "rate_plan_id": "2a0c416b-d8e6-4950-b52e-e7821030fd9d",
        "settings": {
          "room_type_code": "88213",
          "rate_plan_code": "1",
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
| `properties` | UUIDs of the connected properties. One property for Szallas.hu.                                            |
| `settings`   | The connection settings built from `params` — the same object the test connection validated.               |
| `rate_plans` | The mapping structure from step 6. Optional — mappings can also be added later by updating the connection. |

The response is `201 Created` with the channel connection resource (abridged):

```json
{
  "data": {
    "type": "channel",
    "id": "ca4ac55f-3be1-4039-9542-21e8285ffbf9",
    "attributes": {
      "id": "ca4ac55f-3be1-4039-9542-21e8285ffbf9",
      "title": "Szallas.hu Channel",
      "channel": "Szallas",
      "is_active": false,
      "actions": [],
      "properties": ["acb388d9-546b-42fc-9ae2-baf00e7f0d8c"],
      "settings": {
        "hotel_id": "12345",
        "min_stay_type": "Arrival",
        "sync_logic": "Rates and Availability",
        "send_email_notifications": false
      },
      "rate_plans": [
        {
          "id": "9d7e45b3-367b-4286-a081-17a6c8d3c62e",
          "rate_plan_id": "a35f1fd4-63c6-4fbc-8fbe-359869bd9958",
          "settings": {
            "room_type_code": "88213",
            "rate_plan_code": "1",
            "occupancy": 2,
            "pricing_type": "OBP",
            "primary_occ": true
          }
        },
        {
          "id": "0f6fe97e-ab8b-4f0b-a1cd-dc3500f18295",
          "rate_plan_id": "2a0c416b-d8e6-4950-b52e-e7821030fd9d",
          "settings": {
            "room_type_code": "88213",
            "rate_plan_code": "1",
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

Only one connection per Szallas.hu `hotel_id` is allowed on Channex.

### 8. Activate the connection

```
POST /api/v1/channels/{channel_id}/activate
```

No payload. Activation requires the connection to have at least one property and at least one rate plan mapping.

For Szallas.hu, activating also enables the channel manager for the Hotel ID on the Szallas.hu side. If the hotel is already enabled there, Szallas.hu answers that its current status is not available for activation; Channex treats that as success, so re-activating an already-enabled hotel is safe. Activation then starts the synchronization — Channex pushes the full current availability, rates and restrictions to Szallas.hu and begins receiving bookings.

The counterpart is `POST /api/v1/channels/{channel_id}/deactivate`, which stops the synchronization but keeps the connection and its mappings.

### Updating a connection

```
PUT /api/v1/channels/{channel_id}
```

The payload has the same shape as for create (wrapped in `channel`). Two rules matter:

* **`channel` cannot be changed** — a different adapter code is rejected.
* **`rate_plans`, when present, replaces the whole mapping set.** A stored mapping missing from the list is removed, and a mapping sent with `settings: null` is removed as well. Omit `rate_plans` entirely to keep the stored mappings.

### Deleting a connection

```
DELETE /api/v1/channels/{channel_id}
```

An active connection must be deactivated first. Deleting removes the connection and all its mappings; bookings received through it are kept.

### Actions

The Szallas.hu adapter declares no connection actions — `actions` is empty on the descriptor and on every Szallas.hu connection.

### What gets synchronized

An active connection pushes each batch of changes to Szallas.hu as up to three calls: room allocation, room rates and daily rules. What lands in each of them depends on the mapping and on two connection settings.

**Availability** is room-level on the Szallas.hu side, so it is sent per room and date, not per rate. When several mappings of the same room disagree for a date, the highest availability among that room's primary mappings wins. Negative values are sent as `0`. Availability is skipped entirely while the hotel is not in realtime allocation mode on the Szallas.hu side — see step 4.

**Rates** are sent per room + rate, with one entry per date and guest count, so each mapped occupancy carries its own price. A price of `0` is sent as an empty rate, which removes the price for that date and occupancy rather than selling at zero.

**Restrictions** are sent per rate and date, and only from mappings marked `primary_occ`. They map as follows:

| Channex restriction   | Szallas.hu field |
| --------------------- | ---------------- |
| `stop_sell`           | `CloseOut`       |
| `closed_to_arrival`   | `NoArrival`      |
| `closed_to_departure` | `NoDeparture`    |
| `min_stay`            | `MinStay`        |
| `max_stay`            | `MaxStay`        |

`min_stay` is clamped to 1–31 and `max_stay` to 1–31 (a `max_stay` of `0`, meaning no limit in Channex, is sent as `31`).

**`sync_logic`** decides which of these are pushed at all:

| `sync_logic`                       | What is sent                                                                           |
| ---------------------------------- | -------------------------------------------------------------------------------------- |
| `Rates and Availability` (default) | Rates and availability only. All restrictions are dropped before the request is built. |
| `Full connection`                  | Rates, availability and all restrictions.                                              |
| `Full connection (no Stop Sell)`   | Rates, availability and all restrictions except stop sell.                             |

**`min_stay_type`** decides which Channex minimum stay feeds `MinStay`: `Arrival` sends the min-stay-on-arrival value, `Through` sends the min-stay-through value. The other one is ignored.

**Horizon** — changes are pushed for the next 730 days, counted from today in the property's timezone. Changes for dates in the past or beyond that window are dropped.

**Bookings** arrive from Szallas.hu as push notifications and are additionally polled on a schedule, so a notification lost in transit is still picked up. Nothing has to be configured for this beyond activating the connection.

### Szallas.hu settings reference

The full set of connection `settings` for Szallas.hu:

| Setting                    | Description                                                                                                                                                          |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hotel_id`                 | The Szallas.hu Hotel ID. Required, and unique across Szallas.hu connections.                                                                                         |
| `send_email_notifications` | When `true`, Channex sends a notification about each booking. Default `false`.                                                                                       |
| `email`                    | The email address the notifications go to. Hidden unless `send_email_notifications` is enabled.                                                                      |
| `min_stay_type`            | Which minimum stay restriction is sent: `Arrival` (min stay on arrival) or `Through` (min stay through). Default `Arrival`.                                          |
| `sync_logic`               | Which data is synchronized: `Rates and Availability`, `Full connection`, or `Full connection (no Stop Sell)`. Default `Rates and Availability`. See the table above. |
