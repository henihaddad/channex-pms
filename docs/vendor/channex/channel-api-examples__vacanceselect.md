<!-- https://docs.channex.io/channel-api-examples/vacanceselect.md -->
> For the complete documentation index, see [llms.txt](https://docs.channex.io/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://docs.channex.io/channel-api-examples/vacanceselect.md).

# VacanceSelect

This guide walks through creating a channel connection between Channex and VacanceSelect over the API: discovering the adapter, validating the credentials, reading the rooms and rates on both sides, building the mapping, and creating and activating the connection.

A **channel connection** (a *channel*) links rate plans of a Channex property to rooms and rates on the OTA side. Once the connection is active, Channex pushes availability, rates and restrictions to VacanceSelect and receives bookings back.

Every OTA has its own API and data model, so the connection settings and the mapping settings differ per channel. The flow below is shared by most channels (Booking.com, Expedia, VacanceSelect, Open Channel–based OTAs and others); the payloads shown are the VacanceSelect ones. Airbnb is the exception — it requires an OAuth authorization step and is covered by a separate guide.

All endpoints require authentication with an API key, sent in the `user-api-key` header.

### The flow at a glance

1. Get the adapter descriptor — what settings and mapping fields VacanceSelect needs.
2. Collect the settings from the user and run a test connection.
3. Get the mapping details — the rooms and rates on the VacanceSelect side.
4. Collect the Channex side — the property, its room types and rate plans.
5. Build the mapping structure.
6. Create the connection.
7. Activate it.

### 1. Get the adapter descriptor

Each channel is described by an **adapter descriptor**: the settings it needs (`params`) and the per-mapping fields it needs (`rate_params`).

```
GET /api/v1/channels/adapter?code=VacanceSelect
```

The full catalog of adapters is available at `GET /api/v1/channels/list`.

Response (abridged):

```json
{
  "data": {
    "code": "VacanceSelect",
    "title": "VacanceSelect",
    "kind": "meta",
    "actions": [],
    "params": {
      "token": {
        "position": 0,
        "type": "password",
        "title": "Token"
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
        "type": "select",
        "options": ["Arrival", "Through"],
        "title": "Min Stay Type"
      }
    },
    "rate_params": {
      "rate_plan_code": { "position": 0, "title": "Rate", "type": "string" },
      "room_type_code": { "position": 1, "title": "Room", "type": "string" },
      "occupancy": { "position": 2, "title": "Occupancy", "type": "integer" },
      "pricing_type": {
        "position": 3,
        "title": "Pricing Type",
        "type": "select",
        "options": ["Standard", "OBP"]
      },
      "primary_occ": { "position": 4, "title": "Primary Occupancy", "type": "boolean" },
      "readonly": { "position": 5, "title": "Read Only", "type": "boolean" }
    }
  }
}
```

What to read from it:

* **`params`** — the connection settings to collect from the user. Each entry describes one field: `title` (English label), `type` (`string`, `integer`, `boolean`, `select`, `password`, `hidden`), `position` (ordering for a UI), `default`, `options` (for `select` fields) and conditional display `rules`.
* **`rate_params`** — the fields each rate plan mapping must carry (step 5), described the same way.

For VacanceSelect, the only setting to collect from the user is **`token`** — the VacanceSelect API token. The remaining settings have sensible defaults; see the settings reference.

### 2. Test the connection

Before creating anything, validate the collected settings with a test connection:

```
POST /api/v1/channels/test_connection
```

```json
{
  "channel": "VacanceSelect",
  "settings": {
    "token": "token"
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

`success: true` means the credentials are correct and the property is ready for connection on the VacanceSelect side. On failure the response is still `200 OK` with `success: false` — check the `success` field, not the status code.

### 3. Get the mapping details

Next, fetch the rooms and rates the property exposes on the VacanceSelect side:

```
POST /api/v1/channels/mapping_details
```

The payload is the same as for the test connection:

```json
{
  "channel": "VacanceSelect",
  "settings": {
    "token": "token"
  }
}
```

Response (abridged):

```json
{
  "data": {
    "pricing_type": "OBP",
    "rooms": [
      {
        "id": "gelsominiorchidee:c6",
        "title": "Gelsomini Orchidee - C2 6",
        "rates": [
          {
            "id": "0",
            "title": "Default Rate"
          }
        ]
      },
      {
        "id": "gelsominiorchidee:c16",
        "title": "Gelsomini Orchidee - C1 6",
        "rates": [
          {
            "id": "0",
            "title": "Default Rate"
          }
        ]
      }
    ]
  }
}
```

Every channel returns its own mapping-details shape; this one is VacanceSelect's.

**`pricing_type`** — the property's pricing model:

* **`OBP`** — occupancy-based pricing: each rate carries a price per occupancy option.
* **`Standard`** — per-room pricing: one price per rate.

**`rooms`** — the rooms available for mapping. Each room carries:

| Field   | Description                        |
| ------- | ---------------------------------- |
| `id`    | Room ID on the VacanceSelect side. |
| `title` | Room title.                        |
| `rates` | Rates of the room.                 |

Each rate carries:

| Field   | Description                        |
| ------- | ---------------------------------- |
| `id`    | Rate ID on the VacanceSelect side. |
| `title` | Rate title.                        |

### 4. Collect the Channex side

VacanceSelect connections are one-to-one: **one connection maps exactly one Channex property to one VacanceSelect property**. Pick the property to connect, then fetch its room types and rate plans through the `options` endpoints:

```
GET /api/v1/room_types/options?filter[property_id]={property_id}
GET /api/v1/rate_plans/options?filter[property_id]={property_id}&multi_occupancy=true
```

Enable `multi_occupancy` on the rate plans request: for occupancy-based rate plans it expands each occupancy option into its own entry, which is exactly the granularity VacanceSelect mappings need.

### 5. Build the mapping structure

The mapping is a list of `rate_plans` entries, one per (Channex rate plan occupancy → VacanceSelect room/rate/occupancy) pair:

```json
{
  "rate_plan_id": "a35f1fd4-63c6-4fbc-8fbe-359869bd9958",
  "settings": {
    "room_type_code": "gelsominiorchidee:c6",
    "rate_plan_code": "0",
    "occupancy": 2,
    "pricing_type": "OBP",
    "primary_occ": true,
    "readonly": false
  }
}
```

**`rate_plan_id`** — the Channex rate plan UUID (from step 4).

**`settings`** — the fields declared by `rate_params` in the adapter descriptor:

| Field            | Description                                                                                                                                                                         |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `room_type_code` | Room ID on the VacanceSelect side.                                                                                                                                                  |
| `rate_plan_code` | Rate ID on the VacanceSelect side.                                                                                                                                                  |
| `occupancy`      | The occupancy option this mapping serves.                                                                                                                                           |
| `pricing_type`   | The property's pricing model — copy it from the mapping details.                                                                                                                    |
| `primary_occ`    | Whether this mapping is the primary one for its room + rate pair. The primary mapping sends availability and restrictions along with prices; non-primary mappings send prices only. |
| `readonly`       | Whether the rate is read-only on the VacanceSelect side.                                                                                                                            |

Mark **exactly one mapping of each room + rate pair** as primary, and create one mapping per occupancy option you want to sell.

A full mapping for one VacanceSelect rate sold at occupancies 1 and 2:

```json
[
  {
    "rate_plan_id": "a35f1fd4-63c6-4fbc-8fbe-359869bd9958",
    "settings": {
      "room_type_code": "gelsominiorchidee:c6",
      "rate_plan_code": "0",
      "occupancy": 2,
      "pricing_type": "OBP",
      "primary_occ": true,
      "readonly": false
    }
  },
  {
    "rate_plan_id": "2a0c416b-d8e6-4950-b52e-e7821030fd9d",
    "settings": {
      "room_type_code": "gelsominiorchidee:c6",
      "rate_plan_code": "0",
      "occupancy": 1,
      "pricing_type": "OBP",
      "primary_occ": false,
      "readonly": false
    }
  }
]
```

### 6. Create the connection

```
POST /api/v1/channels
```

The payload is wrapped in a `channel` key:

```json
{
  "channel": {
    "channel": "VacanceSelect",
    "group_id": "60674dd6-1aeb-4c41-9e0c-8ffb378a4570",
    "title": "VacanceSelect Channel",
    "properties": ["acb388d9-546b-42fc-9ae2-baf00e7f0d8c"],
    "settings": {
      "token": "token",
      "min_stay_type": "Through"
    },
    "rate_plans": [
      {
        "rate_plan_id": "a35f1fd4-63c6-4fbc-8fbe-359869bd9958",
        "settings": {
          "room_type_code": "gelsominiorchidee:c6",
          "rate_plan_code": "0",
          "occupancy": 2,
          "pricing_type": "OBP",
          "primary_occ": true,
          "readonly": false
        }
      },
      {
        "rate_plan_id": "2a0c416b-d8e6-4950-b52e-e7821030fd9d",
        "settings": {
          "room_type_code": "gelsominiorchidee:c6",
          "rate_plan_code": "0",
          "occupancy": 1,
          "pricing_type": "OBP",
          "primary_occ": false,
          "readonly": false
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
| `properties` | UUIDs of the connected properties. One property for VacanceSelect.                                         |
| `settings`   | The connection settings built from `params` — the same object the test connection validated.               |
| `rate_plans` | The mapping structure from step 5. Optional — mappings can also be added later by updating the connection. |

The response is `201 Created` with the channel connection resource (abridged):

```json
{
  "data": {
    "type": "channel",
    "id": "7c25e1b4-90ad-4f6e-8c31-d2b5a4f7e219",
    "attributes": {
      "id": "7c25e1b4-90ad-4f6e-8c31-d2b5a4f7e219",
      "title": "VacanceSelect Channel",
      "channel": "VacanceSelect",
      "is_active": false,
      "actions": [],
      "properties": ["acb388d9-546b-42fc-9ae2-baf00e7f0d8c"],
      "settings": {
        "token": "token",
        "min_stay_type": "Through"
      },
      "rate_plans": [
        {
          "id": "b8d63f1a-42e9-4c57-a90b-6e2c85d1f374",
          "rate_plan_id": "a35f1fd4-63c6-4fbc-8fbe-359869bd9958",
          "settings": {
            "room_type_code": "gelsominiorchidee:c6",
            "rate_plan_code": "0",
            "occupancy": 2,
            "pricing_type": "OBP",
            "primary_occ": true,
            "readonly": false
          }
        }
      ]
    }
  }
}
```

Note that the connection **starts disabled**: `is_active` in the create payload has no effect — a new connection is always created with `is_active: false`. Activation is a separate, explicit step.

### 7. Activate the connection

```
POST /api/v1/channels/{channel_id}/activate
```

No payload. Activation requires the connection to have at least one property and at least one rate plan mapping; activating starts the synchronization — Channex pushes the full current availability, rates and restrictions to VacanceSelect and begins receiving bookings.

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

The VacanceSelect adapter declares no connection actions — `actions` is empty on the descriptor and on every VacanceSelect connection.

### VacanceSelect settings reference

The full set of connection `settings` for VacanceSelect:

| Setting                    | Description                                                                                                                                                    |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `token`                    | The VacanceSelect API token. Required.                                                                                                                         |
| `send_email_notifications` | When `true`, Channex sends a notification about each booking.                                                                                                  |
| `email`                    | The email address the notifications go to.                                                                                                                     |
| `min_stay_type`            | How the minimum stay restriction is applied: `Arrival` (counted from the arrival date) or `Through` (applied to every stayed-through date). Default `Arrival`. |
