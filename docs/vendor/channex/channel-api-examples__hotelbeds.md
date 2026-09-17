<!-- https://docs.channex.io/channel-api-examples/hotelbeds.md -->
> For the complete documentation index, see [llms.txt](https://docs.channex.io/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://docs.channex.io/channel-api-examples/hotelbeds.md).

# Hotelbeds

This guide walks through creating a channel connection between Channex and Hotelbeds over the API: discovering the adapter, selecting the hotel contract, validating the credentials, reading the rooms and rates on both sides, building the mapping, and creating and activating the connection.

A **channel connection** (a *channel*) links rate plans of a Channex property to rooms and rates on the OTA side. Once the connection is active, Channex pushes availability, rates and restrictions to Hotelbeds and receives bookings back.

Every OTA has its own API and data model, so the connection settings and the mapping settings differ per channel. The flow below is shared by most channels (Booking.com, Expedia, Agoda, Open Channel–based OTAs and others); the payloads shown are the Hotelbeds ones. Hotelbeds is contract-based: a connection targets one contract of one hotel, and the contract is selected from the connection details before anything else — so for Hotelbeds the connection details come first. Airbnb is the exception — it requires an OAuth authorization step and is covered by a separate guide.

All endpoints require authentication with an API key, sent in the `user-api-key` header.

### The flow at a glance

1. Get the adapter descriptor — what settings and mapping fields Hotelbeds needs.
2. Collect the credentials and get the connection details — the hotels and contracts they give access to.
3. Complete the settings with the selected contract and run a test connection.
4. Get the mapping details — the rooms and rates on the Hotelbeds side.
5. Collect the Channex side — the property, its room types and rate plans.
6. Build the mapping structure.
7. Create the connection.
8. Activate it.

### 1. Get the adapter descriptor

Each channel is described by an **adapter descriptor**: the settings it needs (`params`) and the per-mapping fields it needs (`rate_params`).

```
GET /api/v1/channels/adapter?code=Hotelbeds
```

The full catalog of adapters is available at `GET /api/v1/channels/list`.

Response (abridged):

```json
{
  "data": {
    "code": "Hotelbeds",
    "title": "Hotelbeds",
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
      "send_email_notifications": {
        "default": false,
        "position": 3,
        "type": "boolean",
        "title": "Send Property Notification"
      },
      "email": {
        "position": 4,
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
      "update_availability": {
        "default": true,
        "position": 5,
        "type": "boolean",
        "title": "Grant Update Availability"
      },
      "update_rates": {
        "default": true,
        "position": 6,
        "type": "boolean",
        "title": "Grant Update Rates"
      },
      "update_restrictions": {
        "default": true,
        "position": 7,
        "type": "boolean",
        "title": "Grant Update Restrictions"
      }
    },
    "rate_params": {
      "room_id": { "position": 0, "title": "RoomId", "type": "string" }
    }
  }
}
```

What to read from it:

* **`params`** — the connection settings to collect from the user. Each entry describes one field: `title` (English label), `type` (`string`, `password`, `boolean`, `select`), `position` (ordering for a UI), `default`, `options` (for `select` fields) and conditional display `rules`.
* **`rate_params`** — the fields each rate plan mapping must carry (step 6), described the same way.

For Hotelbeds, the settings to collect from the user are the **`user`** and **`password`** credentials. The contract settings are selected from the connection details (step 2), and the remaining settings have sensible defaults; see the settings reference.

### 2. Get the connection details

With the credentials collected, fetch the connection details — the hotels available to them, each with its contracts:

```
POST /api/v1/channels/connection_details
```

```json
{
  "channel": "Hotelbeds",
  "settings": {
    "user": "username",
    "password": "password"
  }
}
```

`channel` is the adapter code from the descriptor; at this point `settings` carries only the credentials.

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
              "contract_name": "Flexible | Standard-BAR",
              "contract_sequence": 67890,
              "hotel_code": "12345",
              "incoming_office_code": 5
            }
          ]
        }
      ]
    }
  }
}
```

A Hotelbeds connection targets one contract of one hotel. `contract_name` is the contract's display name — use it to present the choice to the user. Pick the hotel and the contract to connect, and add the contract's identifying fields to the connection settings:

| Setting                | From the selected contract |
| ---------------------- | -------------------------- |
| `hotel_code`           | `"12345"`                  |
| `contract_sequence`    | `67890`                    |
| `incoming_office_code` | `5`                        |

These values are part of the connection `settings` from here on: they are sent in every subsequent request (`test_connection`, `mapping_details`) and saved on the connection. The contract dates (`contract_start_date`, `contract_end_date`) are filled into the stored settings by Channex from the contract itself.

### 3. Test the connection

Validate the completed settings with a test connection:

```
POST /api/v1/channels/test_connection
```

```json
{
  "channel": "Hotelbeds",
  "settings": {
    "user": "username",
    "password": "password",
    "hotel_code": "12345",
    "contract_sequence": 67890,
    "incoming_office_code": 5
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

`success: true` means the credentials are correct and the contract is ready for connection on the Hotelbeds side. On failure the response is still `200 OK` with `success: false` — check the `success` field, not the status code.

### 4. Get the mapping details

Next, fetch the rooms and rates the selected contract exposes on the Hotelbeds side:

```
POST /api/v1/channels/mapping_details
```

The payload is the same as for the test connection:

```json
{
  "channel": "Hotelbeds",
  "settings": {
    "user": "username",
    "password": "password",
    "hotel_code": "12345",
    "contract_sequence": 67890,
    "incoming_office_code": 5
  }
}
```

Response (abridged):

```json
{
  "data": {
    "room_id_dictionary": {
      "values": [
        {
          "id": "DBT-E10:::C3-E10",
          "title": "Double or Twin STANDARD 3 ADULTS",
          "max_children": 1,
          "rates": [
            {
              "id": "7",
              "title": "Offer",
              "max_persons": 3
            }
          ]
        }
      ]
    }
  }
}
```

Every channel returns its own mapping-details shape; this one is the Hotelbeds one.

**`room_id_dictionary.values`** — the rooms available for mapping. Each room carries:

| Field          | Description                                       |
| -------------- | ------------------------------------------------- |
| `id`           | Composite room identifier (see Room ID encoding). |
| `title`        | Room title.                                       |
| `max_children` | Maximum number of children.                       |
| `rates`        | Rates of the room.                                |

Each rate carries:

| Field         | Description                      |
| ------------- | -------------------------------- |
| `id`          | Rate code on the Hotelbeds side. |
| `title`       | Rate description.                |
| `max_persons` | Maximum number of persons.       |

#### Room ID encoding

The room `id` is a composite of the Hotelbeds room type code and the room characteristic code, joined by `:::`:

```
<room_type_code>:::<characteristic_code>
```

For example, `DBT-E10:::C3-E10` is room type `DBT-E10` with characteristic `C3-E10`. Use the whole composite string as the `room_id` mapping value — do not split it.

### 5. Collect the Channex side

Hotelbeds connections are one-to-one: **one connection maps exactly one Channex property to one Hotelbeds contract**. Pick the property to connect, then fetch its room types and rate plans through the `options` endpoints:

```
GET /api/v1/room_types/options?filter[property_id]={property_id}
GET /api/v1/rate_plans/options?filter[property_id]={property_id}
```

### 6. Build the mapping structure

The mapping is a list of `rate_plans` entries, one per (Channex rate plan → Hotelbeds room) pair:

```json
{
  "rate_plan_id": "a35f1fd4-63c6-4fbc-8fbe-359869bd9958",
  "settings": {
    "room_id": "DBT-E10:::C3-E10"
  }
}
```

**`rate_plan_id`** — the Channex rate plan UUID (from step 5).

**`settings`** — the fields declared by `rate_params` in the adapter descriptor:

| Field     | Description                                                                                          |
| --------- | ---------------------------------------------------------------------------------------------------- |
| `room_id` | The composite room identifier from the mapping details (`<room_type_code>:::<characteristic_code>`). |

A full mapping for two rooms of the contract:

```json
[
  {
    "rate_plan_id": "a35f1fd4-63c6-4fbc-8fbe-359869bd9958",
    "settings": {
      "room_id": "DBT-E10:::C3-E10"
    }
  },
  {
    "rate_plan_id": "2a0c416b-d8e6-4950-b52e-e7821030fd9d",
    "settings": {
      "room_id": "DBT-E10:::C4-E10"
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
    "channel": "Hotelbeds",
    "group_id": "60674dd6-1aeb-4c41-9e0c-8ffb378a4570",
    "title": "Hotelbeds Channel",
    "properties": ["acb388d9-546b-42fc-9ae2-baf00e7f0d8c"],
    "settings": {
      "user": "username",
      "password": "password",
      "min_stay_type": "Arrival",
      "send_email_notifications": false,
      "email": "",
      "update_availability": true,
      "update_rates": true,
      "update_restrictions": true,
      "hotel_code": "12345",
      "contract_sequence": 67890,
      "incoming_office_code": 5
    },
    "rate_plans": [
      {
        "rate_plan_id": "a35f1fd4-63c6-4fbc-8fbe-359869bd9958",
        "settings": {
          "room_id": "DBT-E10:::C3-E10"
        }
      },
      {
        "rate_plan_id": "2a0c416b-d8e6-4950-b52e-e7821030fd9d",
        "settings": {
          "room_id": "DBT-E10:::C4-E10"
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
| `properties` | UUIDs of the connected properties. One property for Hotelbeds.                                                                    |
| `settings`   | The connection settings built from `params` plus the contract fields from step 2 — the same object the test connection validated. |
| `rate_plans` | The mapping structure from step 6. Optional — mappings can also be added later by updating the connection.                        |

The response is `201 Created` with the channel connection resource (abridged):

```json
{
  "data": {
    "type": "channel",
    "id": "7fa53e91-2c48-4b6d-9e03-5a8c41d2b769",
    "attributes": {
      "id": "7fa53e91-2c48-4b6d-9e03-5a8c41d2b769",
      "title": "Hotelbeds Channel",
      "channel": "Hotelbeds",
      "is_active": false,
      "actions": [],
      "properties": ["acb388d9-546b-42fc-9ae2-baf00e7f0d8c"],
      "settings": {
        "user": "username",
        "password": "password",
        "min_stay_type": "Arrival",
        "send_email_notifications": false,
        "email": "",
        "update_availability": true,
        "update_rates": true,
        "update_restrictions": true,
        "hotel_code": "12345",
        "contract_sequence": 67890,
        "incoming_office_code": 5,
        "contract_start_date": "2026-02-17",
        "contract_end_date": "2028-07-31"
      },
      "rate_plans": [
        {
          "id": "b8d63f1a-42e9-4c57-a90b-6e2c85d1f374",
          "rate_plan_id": "a35f1fd4-63c6-4fbc-8fbe-359869bd9958",
          "settings": {
            "room_id": "DBT-E10:::C3-E10"
          }
        },
        {
          "id": "0f6fe97e-ab8b-4f0b-a1cd-dc3500f18295",
          "rate_plan_id": "2a0c416b-d8e6-4950-b52e-e7821030fd9d",
          "settings": {
            "room_id": "DBT-E10:::C4-E10"
          }
        }
      ]
    }
  }
}
```

Note two things about the created connection:

* **It starts disabled.** `is_active` in the create payload has no effect — a new connection is always created with `is_active: false`. Activation is a separate, explicit step.
* The contract dates (`contract_start_date`, `contract_end_date`) are filled into the stored settings by Channex from the selected contract.

### 8. Activate the connection

```
POST /api/v1/channels/{channel_id}/activate
```

No payload. Activation requires the connection to have at least one property and at least one rate plan mapping; activating starts the synchronization — Channex pushes the full current availability, rates and restrictions to Hotelbeds and begins receiving bookings.

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

The Hotelbeds adapter declares no connection actions — `actions` is empty on the descriptor and on every Hotelbeds connection.

### Hotelbeds settings reference

The full set of connection `settings` for Hotelbeds. The first group comes from the descriptor's `params`:

| Setting                    | Description                                                                                                                                                    |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `user`                     | The Hotelbeds username. Required.                                                                                                                              |
| `password`                 | The Hotelbeds password. Required.                                                                                                                              |
| `min_stay_type`            | How the minimum stay restriction is applied: `Arrival` (counted from the arrival date) or `Through` (applied to every stayed-through date). Default `Arrival`. |
| `send_email_notifications` | When `true`, Channex sends a notification about each booking.                                                                                                  |
| `email`                    | The email address the notifications go to.                                                                                                                     |
| `update_availability`      | When `true`, Channex pushes availability updates to Hotelbeds. Default `true`.                                                                                 |
| `update_rates`             | When `true`, Channex pushes rate updates to Hotelbeds. Default `true`.                                                                                         |
| `update_restrictions`      | When `true`, Channex pushes restriction updates to Hotelbeds. Default `true`.                                                                                  |

The second group identifies the connected contract. These settings are not collected from the user — they are copied from the contract selected in the connection details (step 2), except the dates, which Channex fills in itself:

| Setting                | Description                                                    |
| ---------------------- | -------------------------------------------------------------- |
| `hotel_code`           | Hotel code on the Hotelbeds side.                              |
| `contract_sequence`    | Sequence number of the contract.                               |
| `incoming_office_code` | Code of the Hotelbeds incoming office the contract belongs to. |
| `contract_start_date`  | First date the contract covers. Read-only — filled by Channex. |
| `contract_end_date`    | Last date the contract covers. Read-only — filled by Channex.  |
