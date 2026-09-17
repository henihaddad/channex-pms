<!-- https://docs.channex.io/channel-api-examples/roibos.md -->
> For the complete documentation index, see [llms.txt](https://docs.channex.io/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://docs.channex.io/channel-api-examples/roibos.md).

# Roibos

This guide walks through creating a channel connection between Channex and Roibos over the API: discovering the adapter, reading the hotels and contracts on the Roibos side, validating the credentials, reading the rooms and rates on both sides, building the mapping, and creating and activating the connection.

A **channel connection** (a *channel*) links rate plans of a Channex property to rooms and rates on the OTA side. Once the connection is active, Channex pushes availability, rates and restrictions to Roibos and receives bookings back.

Every OTA has its own API and data model, so the connection settings and the mapping settings differ per channel. The flow below is shared by most channels (Booking.com, Expedia, Roibos, Open Channel–based OTAs and others); the payloads shown are the Roibos ones. Airbnb is the exception — it requires an OAuth authorization step and is covered by a separate guide.

All endpoints require authentication with an API key, sent in the `user-api-key` header.

### The flow at a glance

1. Get the adapter descriptor — what settings and mapping fields Roibos needs.
2. Collect the credentials from the user and get the connection details — the hotels and contracts on the Roibos side.
3. Pick the hotel and contract, add them to the settings, and run a test connection.
4. Get the mapping details — the rooms and rates of the selected contract.
5. Collect the Channex side — the property, its room types and rate plans.
6. Build the mapping structure.
7. Create the connection.
8. Activate it.

### 1. Get the adapter descriptor

Each channel is described by an **adapter descriptor**: the settings it needs (`params`) and the per-mapping fields it needs (`rate_params`).

```
GET /api/v1/channels/adapter?code=Roibos
```

The full catalog of adapters is available at `GET /api/v1/channels/list`.

Response (abridged):

```json
{
  "data": {
    "code": "Roibos",
    "title": "Roibos",
    "kind": "ota",
    "actions": [],
    "params": {
      "user": {
        "position": 0,
        "type": "string",
        "title": "Username"
      },
      "password": {
        "position": 1,
        "type": "password",
        "title": "Password"
      },
      "min_stay_type": {
        "default": "Arrival",
        "position": 2,
        "type": "select",
        "options": ["Arrival", "Through"],
        "title": "Min Stay Type"
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
      "send_email_notifications": {
        "default": false,
        "position": 4,
        "type": "boolean",
        "title": "Send Property Notification"
      },
      "booking_amount_settings": {
        "default": "With Commission",
        "position": 5,
        "type": "select",
        "options": ["With Commission", "Without Commission"],
        "title": "Booking Amount"
      }
    },
    "rate_params": {
      "rate_plan_code": { "position": 0, "title": "Rate", "type": "string" },
      "room_type_code": { "position": 1, "title": "Room", "type": "string" },
      "readonly": { "position": 2, "title": "Read Only", "type": "boolean" },
      "is_primary": { "position": 4, "title": "Primary Rate", "type": "boolean" }
    }
  }
}
```

What to read from it:

* **`params`** — the connection settings to collect from the user. Each entry describes one field: `title` (English label), `type` (`string`, `password`, `boolean`, `select`), `position` (ordering for a UI), `default`, `options` (for `select` fields) and conditional display `rules`.
* **`rate_params`** — the fields each rate plan mapping must carry (step 6), described the same way.

For Roibos, the settings to collect from the user are **`user`** and **`password`** — the Roibos credentials. The remaining declared settings have sensible defaults (see the settings reference); the hotel and contract settings are filled from the connection details (step 2).

### 2. Get the connection details

For Roibos the connection details come first: the credentials alone are enough to request them, and the response lists the hotels and contracts the connection can be built on.

```
POST /api/v1/channels/connection_details
```

```json
{
  "channel": "Roibos",
  "settings": {
    "user": "username",
    "password": "password"
  }
}
```

`channel` is the adapter code from the descriptor; `settings` carries the credentials.

Response:

```json
{
  "data": {
    "type": "connection_details",
    "attributes": {
      "hotels": [
        {
          "id": "12345",
          "title": "Express Aeropuerto La Fe",
          "contracts": [
            {
              "active": true,
              "contract_sequence": "67890",
              "contract_name": "Flexible | Standard-BAR",
              "contract_start_date": "2026-02-17",
              "contract_end_date": "2028-07-31",
              "price_type": "Recommended",
              "rooms": [
                {
                  "id": "7599",
                  "title": "Habitacion Sencilla",
                  "read_only": false,
                  "price_by_room": true
                },
                {
                  "id": "7621",
                  "title": "Habitacion Doble",
                  "read_only": false,
                  "price_by_room": true
                }
              ],
              "boards": [
                {
                  "id": "3",
                  "title": "Room Only"
                }
              ]
            }
          ]
        }
      ]
    }
  }
}
```

**`hotels`** — the hotels available to the credentials. Each hotel carries:

| Field       | Description                  |
| ----------- | ---------------------------- |
| `id`        | Hotel ID on the Roibos side. |
| `title`     | Hotel title.                 |
| `contracts` | Contracts of the hotel.      |

Each contract carries:

| Field                                       | Description                                                         |
| ------------------------------------------- | ------------------------------------------------------------------- |
| `active`                                    | Whether the contract is active.                                     |
| `contract_sequence`                         | Sequence number identifying the contract.                           |
| `contract_name`                             | Contract name.                                                      |
| `contract_start_date` / `contract_end_date` | Validity dates of the contract.                                     |
| `price_type`                                | Price type of the contract.                                         |
| `rooms`                                     | Rooms of the contract: `id`, `title`, `read_only`, `price_by_room`. |
| `boards`                                    | Board options of the contract: `id`, `title`.                       |

A connection targets **one hotel and one contract**. Pick them and add their identifiers to the connection settings — every following request carries them:

* `hotel_id` — the hotel `id` (`"12345"`)
* `contract_sequence` — `"67890"`
* `price_type` — `"Recommended"`
* `contract_start_date` — `"2026-02-17"`
* `contract_end_date` — `"2028-07-31"`

### 3. Test the connection

Before creating anything, validate the assembled settings with a test connection:

```
POST /api/v1/channels/test_connection
```

```json
{
  "channel": "Roibos",
  "settings": {
    "user": "username",
    "password": "password",
    "hotel_id": "12345",
    "contract_sequence": "67890",
    "price_type": "Recommended",
    "contract_start_date": "2026-02-17",
    "contract_end_date": "2028-07-31"
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

`success: true` means the credentials are correct and the hotel is ready for connection on the Roibos side. On failure the response is still `200 OK` with `success: false` — check the `success` field, not the status code.

### 4. Get the mapping details

Next, fetch the rooms and rates the selected contract exposes on the Roibos side:

```
POST /api/v1/channels/mapping_details
```

The payload is the same as for the test connection:

```json
{
  "channel": "Roibos",
  "settings": {
    "user": "username",
    "password": "password",
    "hotel_id": "12345",
    "contract_sequence": "67890",
    "price_type": "Recommended",
    "contract_start_date": "2026-02-17",
    "contract_end_date": "2028-07-31"
  }
}
```

Response:

```json
{
  "data": {
    "pricing_type": "Standard",
    "rooms": [
      {
        "id": "7599",
        "title": "Habitacion Sencilla",
        "rates": [
          {
            "id": "3",
            "title": "Room Only",
            "readonly": false
          }
        ]
      },
      {
        "id": "7621",
        "title": "Habitacion Doble",
        "rates": [
          {
            "id": "3",
            "title": "Room Only",
            "readonly": false
          }
        ]
      }
    ]
  }
}
```

Every channel returns its own mapping-details shape; this one is Roibos's.

**`pricing_type`** — the hotel's pricing model. `Standard` is per-room pricing: each rate carries one price per room.

**`rooms`** — the rooms available for mapping. Each room carries:

| Field   | Description                 |
| ------- | --------------------------- |
| `id`    | Room ID on the Roibos side. |
| `title` | Room title.                 |
| `rates` | Rates of the room.          |

Each rate carries:

| Field      | Description                                       |
| ---------- | ------------------------------------------------- |
| `id`       | Rate ID on the Roibos side.                       |
| `title`    | Rate title.                                       |
| `readonly` | Whether the rate is read-only on the Roibos side. |

The same rate can be offered on several rooms: it appears under each room it is sold on, and a mapping always targets one room + rate pair.

### 5. Collect the Channex side

Roibos connections are one-to-one: **one connection maps exactly one Channex property to one Roibos hotel**. Pick the property to connect, then fetch its room types and rate plans through the `options` endpoints:

```
GET /api/v1/room_types/options?filter[property_id]={property_id}
GET /api/v1/rate_plans/options?filter[property_id]={property_id}
```

### 6. Build the mapping structure

The mapping is a list of `rate_plans` entries, one per (Channex rate plan → Roibos room/rate) pair:

```json
{
  "rate_plan_id": "a35f1fd4-63c6-4fbc-8fbe-359869bd9958",
  "settings": {
    "rate_plan_code": "3",
    "room_type_code": "7599",
    "readonly": false,
    "is_primary": true
  }
}
```

**`rate_plan_id`** — the Channex rate plan UUID (from step 5).

**`settings`** — the fields declared by `rate_params` in the adapter descriptor:

| Field            | Description                                                                                                                                                                         |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rate_plan_code` | Rate ID on the Roibos side.                                                                                                                                                         |
| `room_type_code` | Room ID on the Roibos side.                                                                                                                                                         |
| `readonly`       | The `readonly` flag of the rate, copied from the mapping details.                                                                                                                   |
| `is_primary`     | Whether this mapping is the primary one for its room + rate pair. The primary mapping sends availability and restrictions along with prices; non-primary mappings send prices only. |

Mark **exactly one mapping of each room + rate pair** as primary.

A full mapping for the two rooms of the example contract, each sold on the `Room Only` rate:

```json
[
  {
    "rate_plan_id": "a35f1fd4-63c6-4fbc-8fbe-359869bd9958",
    "settings": {
      "rate_plan_code": "3",
      "room_type_code": "7599",
      "readonly": false,
      "is_primary": true
    }
  },
  {
    "rate_plan_id": "2a0c416b-d8e6-4950-b52e-e7821030fd9d",
    "settings": {
      "rate_plan_code": "3",
      "room_type_code": "7621",
      "readonly": false,
      "is_primary": true
    }
  }
]
```

Each mapping here is the only one of its room + rate pair, so each is the primary one.

### 7. Create the connection

```
POST /api/v1/channels
```

The payload is wrapped in a `channel` key:

```json
{
  "channel": {
    "channel": "Roibos",
    "group_id": "60674dd6-1aeb-4c41-9e0c-8ffb378a4570",
    "title": "Roibos Channel",
    "properties": ["acb388d9-546b-42fc-9ae2-baf00e7f0d8c"],
    "settings": {
      "user": "username",
      "password": "password",
      "booking_amount_settings": "With Commission",
      "hotel_id": "12345",
      "contract_sequence": "67890",
      "price_type": "Recommended",
      "contract_start_date": "2026-02-17",
      "contract_end_date": "2028-07-31"
    },
    "rate_plans": [
      {
        "rate_plan_id": "a35f1fd4-63c6-4fbc-8fbe-359869bd9958",
        "settings": {
          "rate_plan_code": "3",
          "room_type_code": "7599",
          "readonly": false,
          "is_primary": true
        }
      },
      {
        "rate_plan_id": "2a0c416b-d8e6-4950-b52e-e7821030fd9d",
        "settings": {
          "rate_plan_code": "3",
          "room_type_code": "7621",
          "readonly": false,
          "is_primary": true
        }
      }
    ]
  }
}
```

| Field        | Description                                                                                                                                 |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `channel`    | The adapter code from the descriptor.                                                                                                       |
| `group_id`   | UUID of the group the connection belongs to. Required.                                                                                      |
| `title`      | Connection title. Optional — generated from the channel and property names when omitted.                                                    |
| `properties` | UUIDs of the connected properties. One property for Roibos.                                                                                 |
| `settings`   | The connection settings built from `params` plus the hotel and contract selected in step 2 — the same object the test connection validated. |
| `rate_plans` | The mapping structure from step 6. Optional — mappings can also be added later by updating the connection.                                  |

The response is `201 Created` with the channel connection resource (abridged):

```json
{
  "data": {
    "type": "channel",
    "id": "7d3a92e5-48b1-4c06-9f27-c58e1b64a903",
    "attributes": {
      "id": "7d3a92e5-48b1-4c06-9f27-c58e1b64a903",
      "title": "Roibos Channel",
      "channel": "Roibos",
      "is_active": false,
      "actions": [],
      "properties": ["acb388d9-546b-42fc-9ae2-baf00e7f0d8c"],
      "settings": {
        "user": "username",
        "password": "password",
        "booking_amount_settings": "With Commission",
        "hotel_id": "12345",
        "contract_sequence": "67890",
        "price_type": "Recommended",
        "contract_start_date": "2026-02-17",
        "contract_end_date": "2028-07-31"
      },
      "rate_plans": [
        {
          "id": "b8d63f1a-42e9-4c57-a90b-6e2c85d1f374",
          "rate_plan_id": "a35f1fd4-63c6-4fbc-8fbe-359869bd9958",
          "settings": {
            "rate_plan_code": "3",
            "room_type_code": "7599",
            "readonly": false,
            "is_primary": true
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

No payload. Activation requires the connection to have at least one property and at least one rate plan mapping; activating starts the synchronization — Channex pushes the full current availability, rates and restrictions to Roibos and begins receiving bookings.

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

The Roibos adapter declares no connection actions — `actions` is empty on the descriptor and on every Roibos connection.

### Roibos settings reference

The full set of connection `settings` declared by the descriptor:

| Setting                    | Description                                                                                                                                                    |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `user`                     | The Roibos username. Required.                                                                                                                                 |
| `password`                 | The Roibos password. Required.                                                                                                                                 |
| `min_stay_type`            | How the minimum stay restriction is applied: `Arrival` (counted from the arrival date) or `Through` (applied to every stayed-through date). Default `Arrival`. |
| `email`                    | The email address the notifications go to.                                                                                                                     |
| `send_email_notifications` | When `true`, Channex sends a notification about each booking.                                                                                                  |
| `booking_amount_settings`  | Which amount is recorded as the booking total: `With Commission` or `Without Commission`. Default `With Commission`.                                           |

In addition, a Roibos connection's settings carry the hotel and contract selected from the connection details (step 2):

| Setting               | Description                               |
| --------------------- | ----------------------------------------- |
| `hotel_id`            | ID of the selected Roibos hotel.          |
| `contract_sequence`   | Sequence number of the selected contract. |
| `price_type`          | Price type of the selected contract.      |
| `contract_start_date` | Start date of the selected contract.      |
| `contract_end_date`   | End date of the selected contract.        |
