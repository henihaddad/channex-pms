<!-- https://docs.channex.io/channel-api-examples/agoda.md -->
> For the complete documentation index, see [llms.txt](https://docs.channex.io/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://docs.channex.io/channel-api-examples/agoda.md).

# Agoda

This guide walks through creating a channel connection between Channex and Agoda over the API: discovering the adapter, validating the hotel credentials, reading the rooms and rates on both sides, building the mapping, and creating and activating the connection.

A **channel connection** (a *channel*) links rate plans of a Channex property to rooms and rates on the OTA side. Once the connection is active, Channex pushes availability, rates and restrictions to Agoda and receives bookings back.

Every OTA has its own API and data model, so the connection settings and the mapping settings differ per channel. The flow below is shared by most channels (Booking.com, Expedia, Agoda, Open Channel–based OTAs and others); the payloads shown are the Agoda ones. Airbnb is the exception — it requires an OAuth authorization step and is covered by a separate guide.

All endpoints require authentication with an API key, sent in the `user-api-key` header.

### The flow at a glance

1. Get the adapter descriptor — what settings and mapping fields Agoda needs.
2. Collect the settings from the user and run a test connection.
3. Get the mapping details — the rooms and rates on the Agoda side.
4. Get the connection details — the currency the hotel trades in.
5. Collect the Channex side — the property, its room types and rate plans.
6. Build the mapping structure.
7. Create the connection.
8. Activate it.

### 1. Get the adapter descriptor

Each channel is described by an **adapter descriptor**: the settings it needs (`params`) and the per-mapping fields it needs (`rate_params`).

```
GET /api/v1/channels/adapter?code=Agoda
```

The full catalog of adapters is available at `GET /api/v1/channels/list`.

Response (abridged):

```json
{
  "data": {
    "code": "Agoda",
    "title": "Agoda",
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
      "booking_tax_settings": {
        "default": "Inclusive",
        "position": 3,
        "type": "select",
        "options": [
          "Inclusive",
          "Inclusive With Commissions",
          "Exclusive"
        ],
        "title": "Tax Setting For Bookings"
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

For Agoda, the only setting to collect from the user is **`hotel_id`** — the Agoda Hotel ID. The remaining settings have sensible defaults; see the settings reference.

### 2. Test the connection

Before creating anything, validate the collected settings with a test connection:

```
POST /api/v1/channels/test_connection
```

```json
{
  "channel": "Agoda",
  "settings": {
    "hotel_id": "1878417"
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

`success: true` means the credentials are correct and the hotel is ready for connection on the Agoda side. On failure the response is still `200 OK` with `success: false` — check the `success` field, not the status code.

### 3. Get the mapping details

Next, fetch the rooms and rates the hotel exposes on the Agoda side:

```
POST /api/v1/channels/mapping_details
```

The payload is the same as for the test connection:

```json
{
  "channel": "Agoda",
  "settings": {
    "hotel_id": "1878417"
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
        "id": "1187245301",
        "title": "Deluxe Room",
        "max_children": 0,
        "rates": [
          {
            "id": "20481537",
            "title": "Room Only",
            "derived_rate_plan_ids": [],
            "occupancies": [1, 2],
            "max_persons": 2
          }
        ]
      },
      {
        "id": "1187245302",
        "title": "Family Room",
        "max_children": 1,
        "rates": [
          {
            "id": "20481537",
            "title": "Room Only",
            "derived_rate_plan_ids": [],
            "occupancies": [1, 2, 3, 4],
            "max_persons": 4
          }
        ]
      }
    ]
  }
}
```

Every channel returns its own mapping-details shape; this one is Agoda's.

**`pricing_type`** — the hotel's pricing model. Agoda uses occupancy-based pricing only, so it is always `OBP`: each rate carries a price per occupancy option.

**`rooms`** — the rooms available for mapping. Each room carries:

| Field          | Description                 |
| -------------- | --------------------------- |
| `id`           | Room ID on the Agoda side.  |
| `title`        | Room title.                 |
| `max_children` | Maximum number of children. |
| `rates`        | Rates of the room.          |

Each rate carries:

| Field                   | Description                                                              |
| ----------------------- | ------------------------------------------------------------------------ |
| `id`                    | Rate ID on the Agoda side.                                               |
| `title`                 | Rate title.                                                              |
| `occupancies`           | Occupancy options of the rate on this room.                              |
| `max_persons`           | Maximum number of persons.                                               |
| `derived_rate_plan_ids` | IDs of the rates derived from this rate; empty for rates that have none. |

The same rate can be offered on several rooms: it appears under each room it is sold on, with the occupancy options it has there, and a mapping always targets one room + rate pair.

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
      "currency": "INR"
    }
  }
}
```

For Agoda this returns the currency the hotel trades in. Rate plans in any currency can be mapped: Channex converts prices to the channel's currency when pushing.

### 5. Collect the Channex side

Agoda connections are one-to-one: **one connection maps exactly one Channex property to one Agoda hotel**. Pick the property to connect, then fetch its room types and rate plans through the `options` endpoints:

```
GET /api/v1/room_types/options?filter[property_id]={property_id}
GET /api/v1/rate_plans/options?filter[property_id]={property_id}&multi_occupancy=true
```

Enable `multi_occupancy` on the rate plans request: for occupancy-based rate plans it expands each occupancy option into its own entry, which is exactly the granularity Agoda mappings need.

### 6. Build the mapping structure

The mapping is a list of `rate_plans` entries, one per (Channex rate plan occupancy → Agoda room/rate/occupancy) pair:

```json
{
  "rate_plan_id": "c2e94b7a-51d8-4f3c-a06e-8b1d72f4c9a5",
  "settings": {
    "room_type_code": "1187245301",
    "rate_plan_code": "20481537",
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
| `room_type_code` | Room ID on the Agoda side.                                                                                                                                                          |
| `rate_plan_code` | Rate ID on the Agoda side.                                                                                                                                                          |
| `occupancy`      | The occupancy option of the Agoda rate this mapping serves.                                                                                                                         |
| `pricing_type`   | The hotel's pricing model — always `OBP` for Agoda.                                                                                                                                 |
| `primary_occ`    | Whether this mapping is the primary one for its room + rate pair. The primary mapping sends availability and restrictions along with prices; non-primary mappings send prices only. |

Mark **exactly one mapping of each room + rate pair** as primary, and create one mapping per occupancy option you want to sell.

### 7. Create the connection

```
POST /api/v1/channels
```

The payload is wrapped in a `channel` key:

```json
{
  "channel": {
    "channel": "Agoda",
    "group_id": "60674dd6-1aeb-4c41-9e0c-8ffb378a4570",
    "title": "Opera",
    "properties": ["acb388d9-546b-42fc-9ae2-baf00e7f0d8c"],
    "settings": {
      "hotel_id": "1878417"
    },
    "rate_plans": [
      {
        "rate_plan_id": "c2e94b7a-51d8-4f3c-a06e-8b1d72f4c9a5",
        "settings": {
          "room_type_code": "1187245301",
          "rate_plan_code": "20481537",
          "occupancy": 2,
          "pricing_type": "OBP",
          "primary_occ": true
        }
      },
      {
        "rate_plan_id": "9a4f61d3-28c7-4e0b-b5a2-7c3e90f1d846",
        "settings": {
          "room_type_code": "1187245301",
          "rate_plan_code": "20481537",
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
| `properties` | UUIDs of the connected properties. One property for Agoda.                                                 |
| `settings`   | The connection settings built from `params` — the same object the test connection validated.               |
| `rate_plans` | The mapping structure from step 6. Optional — mappings can also be added later by updating the connection. |

The response is `201 Created` with the channel connection resource (abridged):

```json
{
  "data": {
    "type": "channel",
    "id": "4e2b91c7-63a5-4f80-b2d9-15c7e8a4f036",
    "attributes": {
      "id": "4e2b91c7-63a5-4f80-b2d9-15c7e8a4f036",
      "title": "Opera",
      "channel": "Agoda",
      "is_active": false,
      "actions": [],
      "properties": ["acb388d9-546b-42fc-9ae2-baf00e7f0d8c"],
      "settings": {
        "hotel_id": "1878417"
      },
      "rate_plans": [
        {
          "id": "b8d63f1a-42e9-4c57-a90b-6e2c85d1f374",
          "rate_plan_id": "c2e94b7a-51d8-4f3c-a06e-8b1d72f4c9a5",
          "settings": {
            "room_type_code": "1187245301",
            "rate_plan_code": "20481537",
            "occupancy": 2,
            "pricing_type": "OBP",
            "primary_occ": true
          }
        }
      ]
    }
  }
}
```

Note that the connection **starts disabled**: `is_active` in the create payload has no effect — a new connection is always created with `is_active: false`. Activation is a separate, explicit step.

Only one connection per Agoda `hotel_id` is allowed on Channex.

### 8. Activate the connection

```
POST /api/v1/channels/{channel_id}/activate
```

No payload. Activation requires the connection to have at least one property and at least one rate plan mapping; activating starts the synchronization — Channex pushes the full current availability, rates and restrictions to Agoda and begins receiving bookings.

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

The Agoda adapter declares no connection actions — `actions` is empty on the descriptor and on every Agoda connection.

### Agoda settings reference

The full set of connection `settings` for Agoda:

| Setting                    | Description                                                                                                                   |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `hotel_id`                 | The Agoda Hotel ID. Required.                                                                                                 |
| `send_email_notifications` | When `true`, Channex sends a notification about each booking.                                                                 |
| `email`                    | The email address the notifications go to.                                                                                    |
| `booking_tax_settings`     | Which amount is recorded as the booking total: `Inclusive`, `Inclusive With Commissions` or `Exclusive`. Default `Inclusive`. |
