<!-- https://docs.channex.io/channel-api-examples/check24.md -->
> For the complete documentation index, see [llms.txt](https://docs.channex.io/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://docs.channex.io/channel-api-examples/check24.md).

# Check24

This guide walks through creating a channel connection between Channex and Check24 over the API: discovering the adapter, validating the hotel settings, reading the rooms and rates on both sides, building the mapping, and creating and activating the connection.

A **channel connection** (a *channel*) links rate plans of a Channex property to rooms and rates on the OTA side. Once the connection is active, Channex pushes availability, rates and restrictions to Check24 and receives bookings back.

Every OTA has its own API and data model, so the connection settings and the mapping settings differ per channel. The flow below is shared by most channels (Booking.com, Expedia, Check24, Open Channel–based OTAs and others); the payloads shown are the Check24 ones. Airbnb is the exception — it requires an OAuth authorization step and is covered by a separate guide.

All endpoints require authentication with an API key, sent in the `user-api-key` header.

### The flow at a glance

1. Get the adapter descriptor — what settings and mapping fields Check24 needs.
2. Collect the settings from the user and run a test connection.
3. Get the mapping details — the rooms and rates on the Check24 side.
4. Collect the Channex side — the property, its room types and rate plans.
5. Build the mapping structure.
6. Create the connection.
7. Activate it.

### 1. Get the adapter descriptor

Each channel is described by an **adapter descriptor**: the settings it needs (`params`) and the per-mapping fields it needs (`rate_params`).

```
GET /api/v1/channels/adapter?code=Check24
```

The full catalog of adapters is available at `GET /api/v1/channels/list`.

Response (abridged):

```json
{
  "data": {
    "code": "Check24",
    "title": "Check24",
    "kind": "meta",
    "actions": [],
    "params": {
      "hotel_code": {
        "position": 0,
        "type": "string",
        "title": "Hotel Code"
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
      "max_stay_type": {
        "default": "Arrival",
        "position": 3,
        "type": "switch",
        "options": ["Arrival", "Through"],
        "title": "Max Stay Type"
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

* **`params`** — the connection settings to collect from the user. Each entry describes one field: `title` (English label), `type` (`string`, `integer`, `boolean`, `select`, `switch`, `hidden`), `position` (ordering for a UI), `default`, `options` (for `select` and `switch` fields) and conditional display `rules`.
* **`rate_params`** — the fields each rate plan mapping must carry (step 5), described the same way.

For Check24, the only setting to collect from the user is **`hotel_code`** — the Check24 Hotel Code. The remaining settings have sensible defaults; see the settings reference.

### 2. Test the connection

Before creating anything, validate the collected settings with a test connection:

```
POST /api/v1/channels/test_connection
```

```json
{
  "channel": "Check24",
  "settings": {
    "hotel_code": "104434"
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

`success: true` means the settings are correct and the hotel is ready for connection on the Check24 side. On failure the response is still `200 OK` with `success: false` — check the `success` field, not the status code.

### 3. Get the mapping details

Next, fetch the rooms and rates the hotel exposes on the Check24 side:

```
POST /api/v1/channels/mapping_details
```

The payload is the same as for the test connection:

```json
{
  "channel": "Check24",
  "settings": {
    "hotel_code": "104434"
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
        "id": "DELDOP",
        "title": "Deluxe Double Room",
        "rates": [
          {
            "id": "RWRO",
            "title": "Standard Rate"
          }
        ]
      },
      {
        "id": "GRODOP",
        "title": "Superior Double Room",
        "rates": [
          {
            "id": "RWRO",
            "title": "Standard Rate"
          }
        ]
      },
      {
        "id": "JUNSUI",
        "title": "Deluxe Junior Suite",
        "rates": [
          {
            "id": "RWRO",
            "title": "Standard Rate"
          }
        ]
      }
    ]
  }
}
```

Every channel returns its own mapping-details shape; this one is Check24's.

**`pricing_type`** — the hotel's pricing model:

* **`OBP`** — occupancy-based pricing: each rate carries a price per occupancy option.
* **`Standard`** — per-room pricing: one price per rate, with a single-occupancy base.

**`rooms`** — the rooms available for mapping. Each room carries:

| Field   | Description                  |
| ------- | ---------------------------- |
| `id`    | Room ID on the Check24 side. |
| `title` | Room title.                  |
| `rates` | Rates of the room.           |

Each rate carries:

| Field   | Description                  |
| ------- | ---------------------------- |
| `id`    | Rate ID on the Check24 side. |
| `title` | Rate title.                  |

The same rate can be offered on several rooms: it appears under each room it is sold on, and a mapping always targets one room + rate pair.

### 4. Collect the Channex side

Check24 connections are one-to-one: **one connection maps exactly one Channex property to one Check24 hotel**. Pick the property to connect, then fetch its room types and rate plans through the `options` endpoints:

```
GET /api/v1/room_types/options?filter[property_id]={property_id}
GET /api/v1/rate_plans/options?filter[property_id]={property_id}&multi_occupancy=true
```

Enable `multi_occupancy` on the rate plans request: for occupancy-based rate plans it expands each occupancy option into its own entry, which is exactly the granularity Check24 mappings need.

### 5. Build the mapping structure

The mapping is a list of `rate_plans` entries, one per (Channex rate plan occupancy → Check24 room/rate/occupancy) pair:

```json
{
  "rate_plan_id": "a35f1fd4-63c6-4fbc-8fbe-359869bd9958",
  "settings": {
    "room_type_code": "DELDOP",
    "rate_plan_code": "RWRO",
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
| `room_type_code`    | Room ID on the Check24 side.                                                                                                                                                        |
| `rate_plan_code`    | Rate ID on the Check24 side.                                                                                                                                                        |
| `occupancy`         | The occupancy option of the Check24 rate this mapping serves.                                                                                                                       |
| `pricing_type`      | The hotel's pricing model — copy it from the mapping details.                                                                                                                       |
| `primary_occ`       | Whether this mapping is the primary one for its room + rate pair. The primary mapping sends availability and restrictions along with prices; non-primary mappings send prices only. |
| `extra_adult_price` | Extra adult surcharge amount.                                                                                                                                                       |
| `extra_child_price` | Extra child surcharge amount.                                                                                                                                                       |

Mark **exactly one mapping of each room + rate pair** as primary, and create one mapping per occupancy option you want to sell.

A full mapping for one Check24 rate sold at occupancies 1 and 2:

```json
[
  {
    "rate_plan_id": "a35f1fd4-63c6-4fbc-8fbe-359869bd9958",
    "settings": {
      "room_type_code": "DELDOP",
      "rate_plan_code": "RWRO",
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
      "room_type_code": "DELDOP",
      "rate_plan_code": "RWRO",
      "occupancy": 1,
      "pricing_type": "OBP",
      "primary_occ": false,
      "extra_adult_price": 0,
      "extra_child_price": 0
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
    "channel": "Check24",
    "group_id": "60674dd6-1aeb-4c41-9e0c-8ffb378a4570",
    "title": "Check24 Channel",
    "properties": ["acb388d9-546b-42fc-9ae2-baf00e7f0d8c"],
    "settings": {
      "hotel_code": "104434"
    },
    "rate_plans": [
      {
        "rate_plan_id": "a35f1fd4-63c6-4fbc-8fbe-359869bd9958",
        "settings": {
          "room_type_code": "DELDOP",
          "rate_plan_code": "RWRO",
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
          "room_type_code": "DELDOP",
          "rate_plan_code": "RWRO",
          "occupancy": 1,
          "pricing_type": "OBP",
          "primary_occ": false,
          "extra_adult_price": 0,
          "extra_child_price": 0
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
| `properties` | UUIDs of the connected properties. One property for Check24.                                               |
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
      "title": "Check24 Channel",
      "channel": "Check24",
      "is_active": false,
      "actions": [],
      "properties": ["acb388d9-546b-42fc-9ae2-baf00e7f0d8c"],
      "settings": {
        "hotel_code": "104434"
      },
      "rate_plans": [
        {
          "id": "9d7e45b3-367b-4286-a081-17a6c8d3c62e",
          "rate_plan_id": "a35f1fd4-63c6-4fbc-8fbe-359869bd9958",
          "settings": {
            "room_type_code": "DELDOP",
            "rate_plan_code": "RWRO",
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
            "room_type_code": "DELDOP",
            "rate_plan_code": "RWRO",
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

Only one connection per Check24 `hotel_code` is allowed on Channex.

### 7. Activate the connection

```
POST /api/v1/channels/{channel_id}/activate
```

No payload. Activation requires the connection to have at least one property and at least one rate plan mapping; activating starts the synchronization — Channex pushes the full current availability, rates and restrictions to Check24 and begins receiving bookings.

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

The Check24 adapter declares no connection actions — `actions` is empty on the descriptor and on every Check24 connection.

### Check24 settings reference

The full set of connection `settings` for Check24:

| Setting                    | Description                                                                                                                                                    |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hotel_code`               | The Check24 Hotel Code. Required.                                                                                                                              |
| `send_email_notifications` | When `true`, Channex sends a notification about each booking.                                                                                                  |
| `email`                    | The email address the notifications go to.                                                                                                                     |
| `max_stay_type`            | How the maximum stay restriction is applied: `Arrival` (counted from the arrival date) or `Through` (applied to every stayed-through date). Default `Arrival`. |
