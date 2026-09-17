<!-- https://docs.channex.io/channel-api-examples/pitchup.md -->
> For the complete documentation index, see [llms.txt](https://docs.channex.io/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://docs.channex.io/channel-api-examples/pitchup.md).

# Pitchup

This guide walks through creating a channel connection between Channex and Pitchup over the API: discovering the adapter, choosing the campsite, validating the credentials, reading the rooms and rates on both sides, building the mapping, and creating and activating the connection.

A **channel connection** (a *channel*) links rate plans of a Channex property to rooms and rates on the OTA side. Once the connection is active, Channex pushes availability, rates and restrictions to Pitchup and receives bookings back.

Every OTA has its own API and data model, so the connection settings and the mapping settings differ per channel. The flow below is shared by most channels (Booking.com, Expedia, Pitchup, Open Channel–based OTAs and others); the payloads shown are the Pitchup ones. Airbnb is the exception — it requires an OAuth authorization step and is covered by a separate guide.

All endpoints require authentication with an API key, sent in the `user-api-key` header.

### The flow at a glance

1. Get the adapter descriptor — what settings and mapping fields Pitchup needs.
2. Get the connection details — the campsites available under the API key.
3. Collect the settings and run a test connection.
4. Get the mapping details — the rooms and rates on the Pitchup side.
5. Collect the Channex side — the property, its room types and rate plans.
6. Build the mapping structure.
7. Create the connection.
8. Activate it.

### 1. Get the adapter descriptor

Each channel is described by an **adapter descriptor**: the settings it needs (`params`) and the per-mapping fields it needs (`rate_params`).

```
GET /api/v1/channels/adapter?code=Pitchup
```

The full catalog of adapters is available at `GET /api/v1/channels/list`.

Response (abridged):

```json
{
  "data": {
    "code": "Pitchup",
    "title": "Pitchup",
    "kind": "meta",
    "actions": [],
    "params": {
      "api_key": {
        "position": 0,
        "type": "password",
        "title": "API Key"
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
      "pricing_type": { "position": 3, "title": "Pricing Type", "type": "string" },
      "primary_occ": { "position": 4, "title": "Primary Occupancy", "type": "boolean" },
      "extra_adult_price": { "position": 5, "title": "Extra Adult Price", "type": "integer" },
      "extra_child_price": { "position": 6, "title": "Extra Child Price", "type": "integer" },
      "extra_infant_price": { "position": 7, "title": "Extra Infant Price", "type": "integer" }
    }
  }
}
```

What to read from it:

* **`params`** — the connection settings to collect from the user. Each entry describes one field: `title` (English label), `type` (`string`, `password`, `integer`, `boolean`, `select`, `hidden`), `position` (ordering for a UI), `default`, `options` (for `select` fields) and conditional display `rules`.
* **`rate_params`** — the fields each rate plan mapping must carry (step 6), described the same way.

For Pitchup, the only setting to collect from the user is **`api_key`** — the Pitchup API key. The remaining settings have sensible defaults; see the settings reference. The campsite settings (`campsite_id`, `campsite_slug`, `campsite_title`) are filled from the connection details in the next step.

### 2. Get the connection details

For Pitchup the connection details come first: they list the campsites available under the API key, and the selected campsite becomes part of the connection settings used by every following request.

```
POST /api/v1/channels/connection_details
```

```json
{
  "channel": "Pitchup",
  "settings": {
    "api_key": "6b32e0f4a9d54c1b8f27d3a1c5e94b70"
  }
}
```

`channel` is the adapter code from the descriptor; `settings` is the object built from `params`.

Response:

```json
{
  "data": {
    "type": "connection_details",
    "attributes": {
      "hotels": [
        {
          "id": 12345,
          "title": "Skern Adventure",
          "slug": "adventure-camping"
        }
      ]
    }
  }
}
```

Pick the campsite to connect and copy its fields into the connection settings:

| Setting          | Taken from                                     |
| ---------------- | ---------------------------------------------- |
| `campsite_id`    | The campsite's `id` — `12345`.                 |
| `campsite_slug`  | The campsite's `slug` — `"adventure-camping"`. |
| `campsite_title` | The campsite's `title` — `"Skern Adventure"`.  |

The settings object built here — `api_key` plus the three `campsite_*` values — is the one used in the test connection, the mapping details request and the connection itself.

### 3. Test the connection

Before creating anything, validate the collected settings with a test connection:

```
POST /api/v1/channels/test_connection
```

```json
{
  "channel": "Pitchup",
  "settings": {
    "api_key": "6b32e0f4a9d54c1b8f27d3a1c5e94b70",
    "campsite_id": 12345,
    "campsite_slug": "adventure-camping",
    "campsite_title": "Skern Adventure"
  }
}
```

Response:

```json
{
  "data": {
    "success": true,
    "errors": null
  }
}
```

`success: true` means the credentials are correct and the campsite is ready for connection on the Pitchup side. On failure the response is still `200 OK` with `success: false` — check the `success` field, not the status code.

### 4. Get the mapping details

Next, fetch the rooms and rates the campsite exposes on the Pitchup side:

```
POST /api/v1/channels/mapping_details
```

The payload is the same as for the test connection:

```json
{
  "channel": "Pitchup",
  "settings": {
    "api_key": "6b32e0f4a9d54c1b8f27d3a1c5e94b70",
    "campsite_id": 12345,
    "campsite_slug": "adventure-camping",
    "campsite_title": "Skern Adventure"
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
        "id": 63878,
        "title": "Non-electric grass tent pitch - Skern Adventure - Abbotsham",
        "disabled": false,
        "readonly": true,
        "rates": [
          {
            "id": 194635,
            "title": "Standard",
            "max_persons": 5,
            "occupancies": [5]
          }
        ]
      },
      {
        "id": 60932,
        "title": "Bunkhouse (family) - Skern Adventure - Abbotsham",
        "disabled": false,
        "readonly": true,
        "rates": [
          {
            "id": 185191,
            "title": "Standard Bunk Room",
            "max_persons": 3,
            "occupancies": [3]
          }
        ]
      }
    ]
  }
}
```

Every channel returns its own mapping-details shape; this one is Pitchup's.

**`pricing_type`** — the pricing model of the campsite. `OBP` is occupancy-based pricing: each rate carries a price per occupancy option. Copy this value into every mapping in step 6.

**`rooms`** — the pitches and accommodations available for mapping. Each room carries:

| Field      | Description                                        |
| ---------- | -------------------------------------------------- |
| `id`       | Room ID on the Pitchup side.                       |
| `title`    | Room title.                                        |
| `disabled` | Whether the room is disabled on the Pitchup side.  |
| `readonly` | Whether the room is read-only on the Pitchup side. |
| `rates`    | Rates of the room.                                 |

Each rate carries:

| Field         | Description                                 |
| ------------- | ------------------------------------------- |
| `id`          | Rate ID on the Pitchup side.                |
| `title`       | Rate title.                                 |
| `max_persons` | Maximum number of persons.                  |
| `occupancies` | Occupancy options of the rate on this room. |

### 5. Collect the Channex side

Pitchup connections are one-to-one: **one connection maps exactly one Channex property to one Pitchup campsite**. Pick the property to connect, then fetch its room types and rate plans through the `options` endpoints:

```
GET /api/v1/room_types/options?filter[property_id]={property_id}
GET /api/v1/rate_plans/options?filter[property_id]={property_id}&multi_occupancy=true
```

Enable `multi_occupancy` on the rate plans request: for occupancy-based rate plans it expands each occupancy option into its own entry, which is exactly the granularity Pitchup mappings need.

### 6. Build the mapping structure

The mapping is a list of `rate_plans` entries, one per (Channex rate plan occupancy → Pitchup room/rate/occupancy) pair:

```json
{
  "rate_plan_id": "a35f1fd4-63c6-4fbc-8fbe-359869bd9958",
  "settings": {
    "room_type_code": "63878",
    "rate_plan_code": "194635",
    "occupancy": 5,
    "pricing_type": "OBP",
    "primary_occ": true,
    "extra_adult_price": 30,
    "extra_child_price": 20,
    "extra_infant_price": 10
  }
}
```

**`rate_plan_id`** — the Channex rate plan UUID (from step 5).

**`settings`** — the fields declared by `rate_params` in the adapter descriptor:

| Field                | Description                                                                                                                                                                         |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `room_type_code`     | Room ID on the Pitchup side.                                                                                                                                                        |
| `rate_plan_code`     | Rate ID on the Pitchup side.                                                                                                                                                        |
| `occupancy`          | The occupancy option of the Pitchup rate this mapping serves.                                                                                                                       |
| `pricing_type`       | The pricing model — copy it from the mapping details.                                                                                                                               |
| `primary_occ`        | Whether this mapping is the primary one for its room + rate pair. The primary mapping sends availability and restrictions along with prices; non-primary mappings send prices only. |
| `extra_adult_price`  | Extra adult surcharge amount. Optional.                                                                                                                                             |
| `extra_child_price`  | Extra child surcharge amount. Optional.                                                                                                                                             |
| `extra_infant_price` | Extra infant surcharge amount. Optional.                                                                                                                                            |

Mark **exactly one mapping of each room + rate pair** as primary, and create one mapping per occupancy option you want to sell.

A full mapping for the two rooms above:

```json
[
  {
    "rate_plan_id": "a35f1fd4-63c6-4fbc-8fbe-359869bd9958",
    "settings": {
      "room_type_code": "63878",
      "rate_plan_code": "194635",
      "occupancy": 5,
      "pricing_type": "OBP",
      "primary_occ": true,
      "extra_adult_price": 30,
      "extra_child_price": 20,
      "extra_infant_price": 10
    }
  },
  {
    "rate_plan_id": "2a0c416b-d8e6-4950-b52e-e7821030fd9d",
    "settings": {
      "room_type_code": "60932",
      "rate_plan_code": "185191",
      "occupancy": 3,
      "pricing_type": "OBP",
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
    "channel": "Pitchup",
    "group_id": "60674dd6-1aeb-4c41-9e0c-8ffb378a4570",
    "title": "Pitchup Channel",
    "properties": ["acb388d9-546b-42fc-9ae2-baf00e7f0d8c"],
    "settings": {
      "api_key": "6b32e0f4a9d54c1b8f27d3a1c5e94b70",
      "campsite_id": 12345,
      "campsite_slug": "adventure-camping",
      "campsite_title": "Skern Adventure",
      "min_stay_type": "Through"
    },
    "rate_plans": [
      {
        "rate_plan_id": "a35f1fd4-63c6-4fbc-8fbe-359869bd9958",
        "settings": {
          "room_type_code": "63878",
          "rate_plan_code": "194635",
          "occupancy": 5,
          "pricing_type": "OBP",
          "primary_occ": true,
          "extra_adult_price": 30,
          "extra_child_price": 20,
          "extra_infant_price": 10
        }
      },
      {
        "rate_plan_id": "2a0c416b-d8e6-4950-b52e-e7821030fd9d",
        "settings": {
          "room_type_code": "60932",
          "rate_plan_code": "185191",
          "occupancy": 3,
          "pricing_type": "OBP",
          "primary_occ": true
        }
      }
    ]
  }
}
```

| Field        | Description                                                                                                                       |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| `channel`    | The adapter code from the descriptor.                                                                                             |
| `group_id`   | UUID of the group the connection belongs to. Required.                                                                            |
| `title`      | Connection title. Optional — generated from the channel and property names when omitted.                                          |
| `properties` | UUIDs of the connected properties. One property for Pitchup.                                                                      |
| `settings`   | The connection settings built from `params` plus the campsite values from step 2 — the same object the test connection validated. |
| `rate_plans` | The mapping structure from step 6. Optional — mappings can also be added later by updating the connection.                        |

The response is `201 Created` with the channel connection resource (abridged):

```json
{
  "data": {
    "type": "channel",
    "id": "4e2b91c7-63a5-4f80-b2d9-15c7e8a4f036",
    "attributes": {
      "id": "4e2b91c7-63a5-4f80-b2d9-15c7e8a4f036",
      "title": "Pitchup Channel",
      "channel": "Pitchup",
      "is_active": false,
      "actions": [],
      "properties": ["acb388d9-546b-42fc-9ae2-baf00e7f0d8c"],
      "settings": {
        "api_key": "6b32e0f4a9d54c1b8f27d3a1c5e94b70",
        "campsite_id": 12345,
        "campsite_slug": "adventure-camping",
        "campsite_title": "Skern Adventure",
        "min_stay_type": "Through"
      },
      "rate_plans": [
        {
          "id": "b8d63f1a-42e9-4c57-a90b-6e2c85d1f374",
          "rate_plan_id": "a35f1fd4-63c6-4fbc-8fbe-359869bd9958",
          "settings": {
            "room_type_code": "63878",
            "rate_plan_code": "194635",
            "occupancy": 5,
            "pricing_type": "OBP",
            "primary_occ": true,
            "extra_adult_price": 30,
            "extra_child_price": 20,
            "extra_infant_price": 10
          }
        }
      ]
    }
  }
}
```

Note that the connection **starts disabled**: `is_active` in the create payload has no effect — a new connection is always created with `is_active: false`. Activation is a separate, explicit step.

### 8. Activate the connection

```
POST /api/v1/channels/{channel_id}/activate
```

No payload. Activation requires the connection to have at least one property and at least one rate plan mapping; activating starts the synchronization — Channex pushes the full current availability, rates and restrictions to Pitchup and begins receiving bookings.

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

The Pitchup adapter declares no connection actions — `actions` is empty on the descriptor and on every Pitchup connection.

### Pitchup settings reference

The full set of connection `settings` for Pitchup:

| Setting                    | Description                                                                                                                                                    |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `api_key`                  | The Pitchup API key. Required.                                                                                                                                 |
| `send_email_notifications` | When `true`, Channex sends a notification about each booking.                                                                                                  |
| `email`                    | The email address the notifications go to.                                                                                                                     |
| `min_stay_type`            | How the minimum stay restriction is applied: `Arrival` (counted from the arrival date) or `Through` (applied to every stayed-through date). Default `Arrival`. |
| `campsite_id`              | ID of the connected campsite — the `id` of the campsite selected from the connection details.                                                                  |
| `campsite_slug`            | Slug of the connected campsite — the `slug` from the connection details.                                                                                       |
| `campsite_title`           | Title of the connected campsite — the `title` from the connection details.                                                                                     |
