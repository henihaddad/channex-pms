<!-- https://docs.channex.io/channel-api-examples/reconline.md -->
> For the complete documentation index, see [llms.txt](https://docs.channex.io/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://docs.channex.io/channel-api-examples/reconline.md).

# Reconline

This guide walks through creating a channel connection between Channex and Reconline over the API: discovering the adapter, validating the hotel credentials, reading the rooms and rates on both sides, building the mapping, and creating and activating the connection.

A **channel connection** (a *channel*) links rate plans of a Channex property to rooms and rates on the OTA side. Once the connection is active, Channex pushes availability, rates and restrictions to Reconline and receives bookings back.

Every OTA has its own API and data model, so the connection settings and the mapping settings differ per channel. The flow below is shared by most channels (Booking.com, Expedia, Reconline, Open Channel–based OTAs and others); the payloads shown are the Reconline ones. Airbnb is the exception — it requires an OAuth authorization step and is covered by a separate guide.

All endpoints require authentication with an API key, sent in the `user-api-key` header.

### The flow at a glance

1. Get the adapter descriptor — what settings and mapping fields Reconline needs.
2. Collect the settings from the user and run a test connection.
3. Get the mapping details — the rooms and rates on the Reconline side.
4. Collect the Channex side — the property, its room types and rate plans.
5. Build the mapping structure.
6. Create the connection.
7. Activate it.

### 1. Get the adapter descriptor

Each channel is described by an **adapter descriptor**: the settings it needs (`params`) and the per-mapping fields it needs (`rate_params`).

```
GET /api/v1/channels/adapter?code=Reconline
```

The full catalog of adapters is available at `GET /api/v1/channels/list`.

Response (abridged):

```json
{
  "data": {
    "code": "Reconline",
    "title": "Reconline",
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
      "get_bookings": {
        "default": true,
        "position": 2,
        "type": "boolean",
        "title": "Get Bookings"
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
      "min_stay_type": {
        "default": "Arrival",
        "position": 4,
        "type": "switch",
        "options": ["Arrival", "Through"],
        "title": "Min Stay Type"
      }
    },
    "rate_params": {
      "rate_plan_code": { "position": 0, "title": "Rate", "type": "string" },
      "room_type_code": { "position": 1, "title": "Room", "type": "string" },
      "occupancy": { "position": 2, "title": "Occupancy", "type": "integer" },
      "pricing_type": { "position": 3, "title": "Pricing Type", "type": "string" },
      "primary_occ": { "position": 4, "title": "Primary Occupancy", "type": "boolean" },
      "extra_adult_price": { "position": 5, "title": "Extra Adult Price", "type": "integer" },
      "extra_child_price": { "position": 6, "title": "Extra Child Price", "type": "integer" }
    }
  }
}
```

What to read from it:

* **`params`** — the connection settings to collect from the user. Each entry describes one field: `title` (English label), `type` (`string`, `integer`, `boolean`, `select`, `hidden`), `position` (ordering for a UI), `default`, `options` (for `select` fields) and conditional display `rules`.
* **`rate_params`** — the fields each rate plan mapping must carry (step 5), described the same way.

For Reconline, the only setting to collect from the user is **`hotel_id`** — the Reconline Hotel ID. The remaining settings have sensible defaults; see the settings reference.

### 2. Test the connection

Before creating anything, validate the collected settings with a test connection:

```
POST /api/v1/channels/test_connection
```

```json
{
  "channel": "Reconline",
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

`success: true` means the credentials are correct and the hotel is ready for connection on the Reconline side. On failure the response is still `200 OK` with `success: false` — check the `success` field, not the status code.

### 3. Get the mapping details

Next, fetch the rooms and rates the hotel exposes on the Reconline side:

```
POST /api/v1/channels/mapping_details
```

The payload is the same as for the test connection:

```json
{
  "channel": "Reconline",
  "settings": {
    "hotel_id": "12345"
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
        "id": "52936",
        "title": "Single Room",
        "rates": [
          {
            "id": "1",
            "title": "1 Night Rate",
            "occupancies": [1, 2],
            "max_persons": 2
          }
        ]
      },
      {
        "id": "52939",
        "title": "Deluxe Family Room",
        "rates": [
          {
            "id": "1",
            "title": "1 Night Rate",
            "occupancies": [1, 2, 3, 4, 5],
            "max_persons": 5
          }
        ]
      }
    ]
  }
}
```

Every channel returns its own mapping-details shape; this one is Reconline's.

**`pricing_type`** — the hotel's pricing model. Reconline uses occupancy-based pricing only, so it is always `OBP`: each rate carries a price per occupancy option.

**`rooms`** — the rooms available for mapping. Each room carries:

| Field   | Description                    |
| ------- | ------------------------------ |
| `id`    | Room ID on the Reconline side. |
| `title` | Room title.                    |
| `rates` | Rates of the room.             |

Each rate carries:

| Field         | Description                                 |
| ------------- | ------------------------------------------- |
| `id`          | Rate ID on the Reconline side.              |
| `title`       | Rate title.                                 |
| `occupancies` | Occupancy options of the rate on this room. |
| `max_persons` | Maximum number of persons.                  |

The same rate can be offered on several rooms: it appears under each room it is sold on, with the occupancy options it has there, and a mapping always targets one room + rate pair.

### 4. Collect the Channex side

Reconline connections are one-to-one: **one connection maps exactly one Channex property to one Reconline hotel**. Pick the property to connect, then fetch its room types and rate plans through the `options` endpoints:

```
GET /api/v1/room_types/options?filter[property_id]={property_id}
GET /api/v1/rate_plans/options?filter[property_id]={property_id}&multi_occupancy=true
```

Enable `multi_occupancy` on the rate plans request: for occupancy-based rate plans it expands each occupancy option into its own entry, which is exactly the granularity Reconline mappings need.

### 5. Build the mapping structure

The mapping is a list of `rate_plans` entries, one per (Channex rate plan occupancy → Reconline room/rate/occupancy) pair:

```json
{
  "rate_plan_id": "a35f1fd4-63c6-4fbc-8fbe-359869bd9958",
  "settings": {
    "rate_plan_code": "1",
    "room_type_code": "52936",
    "occupancy": 2,
    "pricing_type": "OBP",
    "primary_occ": true,
    "extra_adult_price": 0,
    "extra_child_price": 0
  }
}
```

**`rate_plan_id`** — the Channex rate plan UUID (from step 4).

**`settings`** — the fields declared by `rate_params` in the adapter descriptor:

| Field               | Description                                                                                                                                                                         |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rate_plan_code`    | Rate ID on the Reconline side.                                                                                                                                                      |
| `room_type_code`    | Room ID on the Reconline side.                                                                                                                                                      |
| `occupancy`         | The occupancy option of the Reconline rate this mapping serves.                                                                                                                     |
| `pricing_type`      | The hotel's pricing model — always `OBP` for Reconline.                                                                                                                             |
| `primary_occ`       | Whether this mapping is the primary one for its room + rate pair. The primary mapping sends availability and restrictions along with prices; non-primary mappings send prices only. |
| `extra_adult_price` | Extra adult surcharge amount. Optional.                                                                                                                                             |
| `extra_child_price` | Extra child surcharge amount. Optional.                                                                                                                                             |

Mark **exactly one mapping of each room + rate pair** as primary, and create one mapping per occupancy option you want to sell.

A full mapping for one Reconline rate sold at occupancies 1 and 2:

```json
[
  {
    "rate_plan_id": "a35f1fd4-63c6-4fbc-8fbe-359869bd9958",
    "settings": {
      "rate_plan_code": "1",
      "room_type_code": "52936",
      "occupancy": 2,
      "pricing_type": "OBP",
      "primary_occ": true,
      "extra_adult_price": 0,
      "extra_child_price": 0
    }
  },
  {
    "rate_plan_id": "2a0c416b-d8e6-4950-b52e-e7821030fd9d",
    "settings": {
      "rate_plan_code": "1",
      "room_type_code": "52936",
      "occupancy": 1,
      "pricing_type": "OBP",
      "primary_occ": false
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
    "channel": "Reconline",
    "group_id": "60674dd6-1aeb-4c41-9e0c-8ffb378a4570",
    "title": "Reconline Channel",
    "properties": ["acb388d9-546b-42fc-9ae2-baf00e7f0d8c"],
    "settings": {
      "hotel_id": "12345",
      "min_stay_type": "Arrival",
      "get_bookings": true
    },
    "rate_plans": [
      {
        "rate_plan_id": "a35f1fd4-63c6-4fbc-8fbe-359869bd9958",
        "settings": {
          "rate_plan_code": "1",
          "room_type_code": "52936",
          "occupancy": 2,
          "pricing_type": "OBP",
          "primary_occ": true,
          "extra_adult_price": 0,
          "extra_child_price": 0
        }
      },
      {
        "rate_plan_id": "2a0c416b-d8e6-4950-b52e-e7821030fd9d",
        "settings": {
          "rate_plan_code": "1",
          "room_type_code": "52936",
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
| `properties` | UUIDs of the connected properties. One property for Reconline.                                             |
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
      "title": "Reconline Channel",
      "channel": "Reconline",
      "is_active": false,
      "actions": [],
      "properties": ["acb388d9-546b-42fc-9ae2-baf00e7f0d8c"],
      "settings": {
        "hotel_id": "12345",
        "min_stay_type": "Arrival",
        "get_bookings": true
      },
      "rate_plans": [
        {
          "id": "9d7e45b3-367b-4286-a081-17a6c8d3c62e",
          "rate_plan_id": "a35f1fd4-63c6-4fbc-8fbe-359869bd9958",
          "settings": {
            "rate_plan_code": "1",
            "room_type_code": "52936",
            "occupancy": 2,
            "pricing_type": "OBP",
            "primary_occ": true,
            "extra_adult_price": 0,
            "extra_child_price": 0
          }
        },
        {
          "id": "0f6fe97e-ab8b-4f0b-a1cd-dc3500f18295",
          "rate_plan_id": "2a0c416b-d8e6-4950-b52e-e7821030fd9d",
          "settings": {
            "rate_plan_code": "1",
            "room_type_code": "52936",
            "occupancy": 1,
            "pricing_type": "OBP",
            "primary_occ": false,
            "extra_adult_price": 0,
            "extra_child_price": 0
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

Only one connection per Reconline `hotel_id` is allowed on Channex.

### 7. Activate the connection

```
POST /api/v1/channels/{channel_id}/activate
```

No payload. Activation requires the connection to have at least one property and at least one rate plan mapping; activating starts the synchronization — Channex pushes the full current availability, rates and restrictions to Reconline and begins receiving bookings.

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

The Reconline adapter declares no connection actions — `actions` is empty on the descriptor and on every Reconline connection.

### Reconline settings reference

The full set of connection `settings` for Reconline:

| Setting                    | Description                                                                                                                                                    |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hotel_id`                 | The Reconline Hotel ID. Required.                                                                                                                              |
| `send_email_notifications` | When `true`, Channex sends a notification about each booking.                                                                                                  |
| `get_bookings`             | Whether to get bookings from Reconline: `true` or `false`. Optional; default `true`.                                                                           |
| `email`                    | The email address the notifications go to.                                                                                                                     |
| `min_stay_type`            | How the minimum stay restriction is applied: `Arrival` (counted from the arrival date) or `Through` (applied to every stayed-through date). Default `Arrival`. |
