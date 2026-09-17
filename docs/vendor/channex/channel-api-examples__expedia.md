<!-- https://docs.channex.io/channel-api-examples/expedia.md -->
> For the complete documentation index, see [llms.txt](https://docs.channex.io/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://docs.channex.io/channel-api-examples/expedia.md).

# Expedia

This guide walks through creating a channel connection between Channex and Expedia over the API: discovering the adapter, validating the hotel credentials, reading the rooms and rates on both sides, building the mapping, and creating and activating the connection.

A **channel connection** (a *channel*) links rate plans of a Channex property to rooms and rates on the OTA side. Once the connection is active, Channex pushes availability, rates and restrictions to Expedia and receives bookings back.

Every OTA has its own API and data model, so the connection settings and the mapping settings differ per channel. The flow below is shared by most channels (Booking.com, Expedia, Google Hotel ARI, Open Channel–based OTAs and others); the payloads shown are the Expedia ones. Airbnb is the exception — it requires an OAuth authorization step and is covered by a separate guide.

All endpoints require authentication with an API key, sent in the `user-api-key` header.

### The flow at a glance

1. Get the adapter descriptor — what settings and mapping fields Expedia needs.
2. Collect the settings from the user and run a test connection.
3. Get the mapping details — the rooms and rates on the Expedia side.
4. Get the connection details — the currency the hotel trades in.
5. Collect the Channex side — the property, its room types and rate plans.
6. Build the mapping structure.
7. Create the connection.
8. Activate it.

### 1. Get the adapter descriptor

Each channel is described by an **adapter descriptor**: the settings it needs (`params`), the per-mapping fields it needs (`rate_params`) and the actions it supports.

```
GET /api/v1/channels/adapter?code=Expedia
```

The full catalog of adapters is available at `GET /api/v1/channels/list`.

Response (abridged):

```json
{
  "data": {
    "code": "Expedia",
    "title": "Expedia",
    "kind": "meta",
    "actions": [
      "load_future_reservations"
    ],
    "params": {
      "hotel_id": {
        "position": 0,
        "type": "string",
        "title": "Hotel ID"
      },
      "min_stay_type": {
        "default": "Arrival",
        "position": 1,
        "type": "select",
        "options": ["Arrival", "Through"],
        "title": "Min Stay Type"
      },
      "send_email_notifications": {
        "default": false,
        "position": 2,
        "type": "boolean",
        "title": "Send Property Notification"
      },
      "email": {
        "position": 3,
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
      "booking_amount_settings": {
        "default": "Collect Amount",
        "position": 4,
        "type": "select",
        "options": [
          "Collect Amount",
          "Total Amount",
          "Total Amount Excluding Tax"
        ],
        "title": "Booking Amount"
      }
    },
    "rate_params": {
      "rate_plan_code": { "position": 0, "title": "Rate", "type": "string" },
      "room_type_code": { "position": 1, "title": "Room", "type": "string" },
      "occupancy": { "position": 2, "title": "Occupancy", "type": "integer" },
      "pricing_type": { "position": 3, "title": "PricingType", "type": "string" },
      "primary_occ": { "position": 4, "title": "Primary Occupancy", "type": "boolean" }
    }
  }
}
```

What to read from it:

* **`params`** — the connection settings to collect from the user. Each entry describes one field: `title` (English label), `type` (`string`, `integer`, `boolean`, `select`, `hidden`), `position` (ordering for a UI), `default`, `options` (for `select` fields) and conditional display `rules`.
* **`rate_params`** — the fields each rate plan mapping must carry (step 6), described the same way.
* **`actions`** — actions callable on an existing connection (see Actions).

For Expedia, the only setting to collect from the user is **`hotel_id`** — the Expedia Hotel ID. The remaining settings have sensible defaults; see the settings reference.

### 2. Test the connection

Before creating anything, validate the collected settings with a test connection:

```
POST /api/v1/channels/test_connection
```

```json
{
  "channel": "Expedia",
  "settings": {
    "hotel_id": "8724231"
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

`success: true` means the credentials are correct and the hotel is ready for connection on the Expedia side. On failure the response is still `200 OK` with `success: false` — check the `success` field, not the status code.

### 3. Get the mapping details

Next, fetch the rooms and rates the hotel exposes on the Expedia side:

```
POST /api/v1/channels/mapping_details
```

The payload is the same as for the test connection:

```json
{
  "channel": "Expedia",
  "settings": {
    "hotel_id": "8724231"
  }
}
```

Response (abridged):

```json
{
  "data": {
    "pricing_type": "Standard",
    "rooms": [
      {
        "id": 218728301,
        "title": "Double Room, Ocean View",
        "max_children": 0,
        "rates": [
          {
            "id": "304182647A",
            "title": "Breakfast included",
            "derived_rate_plan_ids": ["308215490", "308215491"],
            "max_persons": 2
          },
          { "id": "304182912A", "title": "Half board", "max_persons": 2 },
          { "id": "308215466", "title": "Room Only", "max_persons": 2 },
          { "id": "308215468", "title": "Room Only non-refundable", "max_persons": 2 }
        ]
      },
      {
        "id": 218728415,
        "title": "Quadruple Room",
        "max_children": 1,
        "rates": [
          { "id": "304182648A", "title": "Breakfast included", "max_persons": 4 },
          {
            "id": "308215472A",
            "title": "Room Only",
            "derived_rate_plan_ids": ["308215474"],
            "max_persons": 4
          }
        ]
      }
    ]
  }
}
```

Every channel returns its own mapping-details shape; this one is Expedia's.

**`pricing_type`** — the hotel's pricing model:

* **`OBP`** — occupancy-based pricing: each rate carries a price per occupancy option.
* **`Standard`** — per-room pricing: one price per rate.

**`rooms`** — the rooms available for mapping. Each room carries:

| Field          | Description                  |
| -------------- | ---------------------------- |
| `id`           | Room ID on the Expedia side. |
| `title`        | Room title.                  |
| `max_children` | Maximum number of children.  |
| `rates`        | Rates of the room.           |

Each rate carries:

| Field                   | Description                                                                             |
| ----------------------- | --------------------------------------------------------------------------------------- |
| `id`                    | Rate ID on the Expedia side.                                                            |
| `title`                 | Rate title.                                                                             |
| `max_persons`           | Maximum number of persons.                                                              |
| `occupancies`           | Occupancy options of the rate. Present for hotels on the `OBP` pricing model.           |
| `derived_rate_plan_ids` | IDs of the rates derived from this rate. Present only on rates that have derived rates. |

The example above is a hotel on the `Standard` pricing model. For an **OBP** hotel each rate additionally carries its occupancy options:

```json
{
  "id": "412083655A",
  "title": "Breakfast included",
  "occupancies": [1, 2],
  "max_persons": 2
}
```

Only parent rates are listed. Rates that Expedia derives from another rate do not appear as rates of a room themselves — their IDs are collected in the parent's `derived_rate_plan_ids`, and when the connection is created or its mappings updated, Channex records known mappings for them automatically, so bookings arriving on a derived rate are allocated to the parent's mapped rate plan.

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
      "currency": "EUR"
    }
  }
}
```

For Expedia this returns the currency the hotel trades in. Rate plans in any currency can be mapped: Channex converts prices to the channel's currency when pushing.

### 5. Collect the Channex side

Expedia connections are one-to-one: **one connection maps exactly one Channex property to one Expedia hotel**. Pick the property to connect, then fetch its room types and rate plans through the `options` endpoints:

```
GET /api/v1/room_types/options?filter[property_id]={property_id}
GET /api/v1/rate_plans/options?filter[property_id]={property_id}&multi_occupancy=true
```

Enable `multi_occupancy` on the rate plans request: for occupancy-based rate plans it expands each occupancy option into its own entry, which is exactly the granularity Expedia mappings need.

### 6. Build the mapping structure

The mapping is a list of `rate_plans` entries, one per (Channex rate plan occupancy → Expedia room/rate/occupancy) pair:

```json
{
  "rate_plan_id": "5f8ae3a1-7c25-4b02-9d6e-3f1c08a4b7d2",
  "settings": {
    "room_type_code": 218728301,
    "rate_plan_code": "308215466",
    "occupancy": 2,
    "pricing_type": "Standard",
    "primary_occ": true
  }
}
```

**`rate_plan_id`** — the Channex rate plan UUID (from step 5).

**`settings`** — the fields declared by `rate_params` in the adapter descriptor:

| Field            | Description                                                                                                                                                                         |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `room_type_code` | Room ID on the Expedia side.                                                                                                                                                        |
| `rate_plan_code` | Rate ID on the Expedia side.                                                                                                                                                        |
| `occupancy`      | The occupancy option of the Expedia rate this mapping serves.                                                                                                                       |
| `pricing_type`   | The hotel's pricing model — copy it from the mapping details.                                                                                                                       |
| `primary_occ`    | Whether this mapping is the primary one for its room + rate pair. The primary mapping sends availability and restrictions along with prices; non-primary mappings send prices only. |

Mark **exactly one mapping of each room + rate pair** as primary. For an **OBP** hotel, create one mapping per occupancy option you want to sell; for a **Standard** hotel, one mapping per rate is enough.

A full mapping for the two Room Only rates of the double room:

```json
[
  {
    "rate_plan_id": "5f8ae3a1-7c25-4b02-9d6e-3f1c08a4b7d2",
    "settings": {
      "room_type_code": 218728301,
      "rate_plan_code": "308215466",
      "occupancy": 2,
      "pricing_type": "Standard",
      "primary_occ": true
    }
  },
  {
    "rate_plan_id": "7d19c2f4-90b3-4a8c-8e5d-6a2f41c9e0b8",
    "settings": {
      "room_type_code": 218728301,
      "rate_plan_code": "308215468",
      "occupancy": 2,
      "pricing_type": "Standard",
      "primary_occ": true
    }
  }
]
```

### 7. Create the connection

```
POST /api/v1/channels
```

The payload is wrapped in a `channel` key:

```json
{
  "channel": {
    "channel": "Expedia",
    "group_id": "60674dd6-1aeb-4c41-9e0c-8ffb378a4570",
    "title": "Opera",
    "properties": ["acb388d9-546b-42fc-9ae2-baf00e7f0d8c"],
    "settings": {
      "hotel_id": "8724231"
    },
    "rate_plans": [
      {
        "rate_plan_id": "5f8ae3a1-7c25-4b02-9d6e-3f1c08a4b7d2",
        "settings": {
          "room_type_code": 218728301,
          "rate_plan_code": "308215466",
          "occupancy": 2,
          "pricing_type": "Standard",
          "primary_occ": true
        }
      },
      {
        "rate_plan_id": "7d19c2f4-90b3-4a8c-8e5d-6a2f41c9e0b8",
        "settings": {
          "room_type_code": 218728301,
          "rate_plan_code": "308215468",
          "occupancy": 2,
          "pricing_type": "Standard",
          "primary_occ": true
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
| `properties` | UUIDs of the connected properties. One property for Expedia.                                               |
| `settings`   | The connection settings built from `params` — the same object the test connection validated.               |
| `rate_plans` | The mapping structure from step 6. Optional — mappings can also be added later by updating the connection. |

The response is `201 Created` with the channel connection resource (abridged):

```json
{
  "data": {
    "type": "channel",
    "id": "1b7de88a-2c4f-4d6e-a350-98f2ab1c5e73",
    "attributes": {
      "id": "1b7de88a-2c4f-4d6e-a350-98f2ab1c5e73",
      "title": "Opera",
      "channel": "Expedia",
      "is_active": false,
      "actions": ["load_future_reservations"],
      "properties": ["acb388d9-546b-42fc-9ae2-baf00e7f0d8c"],
      "settings": {
        "hotel_id": "8724231"
      },
      "rate_plans": [
        {
          "id": "e3c1a9f7-5b28-4d40-9c6e-2f81d0a4b356",
          "rate_plan_id": "5f8ae3a1-7c25-4b02-9d6e-3f1c08a4b7d2",
          "settings": {
            "room_type_code": 218728301,
            "rate_plan_code": "308215466",
            "occupancy": 2,
            "pricing_type": "Standard",
            "primary_occ": true
          }
        }
      ]
    }
  }
}
```

Note that the connection **starts disabled**: `is_active` in the create payload has no effect — a new connection is always created with `is_active: false`. Activation is a separate, explicit step.

Only one connection per Expedia `hotel_id` is allowed on Channex.

### 8. Activate the connection

```
POST /api/v1/channels/{channel_id}/activate
```

No payload. Activation requires the connection to have at least one property and at least one rate plan mapping; activating starts the synchronization — Channex pushes the full current availability, rates and restrictions to Expedia and begins collecting bookings, reviews and scores.

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

The `actions` list of the descriptor (and of every connection resource) names the actions callable on an existing connection:

```
POST /api/v1/channels/{channel_id}/execute/{action}
```

POST (or PUT) runs the action synchronously and returns its result. A GET variant of the same path also exists, but it only schedules the action asynchronously and always responds with `200 {"meta": {"message": "Success"}}`.

For Expedia, `load_future_reservations` pulls the upcoming bookings from the OTA — useful right after activating a connection for a hotel that already has reservations.

### Expedia settings reference

The full set of connection `settings` for Expedia:

| Setting                    | Description                                                                                                                                                                                                   |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hotel_id`                 | The Expedia Hotel ID. Required.                                                                                                                                                                               |
| `min_stay_type`            | Which of the two Channex minimum-stay restrictions is sent to Expedia, which supports a single minimum-stay value: `Arrival` sends `min_stay_arrival`, `Through` sends `min_stay_through`. Default `Arrival`. |
| `send_email_notifications` | When `true`, Channex sends a notification about each booking.                                                                                                                                                 |
| `email`                    | The email address the notifications go to.                                                                                                                                                                    |
| `booking_amount_settings`  | Which amount is recorded as the booking total: `Collect Amount`, `Total Amount` or `Total Amount Excluding Tax`. Default `Collect Amount`.                                                                    |
