<!-- https://docs.channex.io/channel-api-examples/booking.com.md -->
> For the complete documentation index, see [llms.txt](https://docs.channex.io/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://docs.channex.io/channel-api-examples/booking.com.md).

# Booking.com

This guide walks through creating a channel connection between Channex and Booking.com over the API: discovering the adapter, validating the hotel credentials, reading the rooms and rates on both sides, building the mapping, and creating and activating the connection.

A **channel connection** (a *channel*) links rate plans of a Channex property to rooms and rates on the OTA side. Once the connection is active, Channex pushes availability, rates and restrictions to Booking.com and receives bookings back.

Every OTA has its own API and data model, so the connection settings and the mapping settings differ per channel. The flow below is shared by most channels (Booking.com, Expedia, Google Hotel ARI, Open Channel–based OTAs and others); the payloads shown are the Booking.com ones. Airbnb is the exception — it requires an OAuth authorization step and is covered by a separate guide.

All endpoints require authentication with an API key, sent in the `user-api-key` header.

### The flow at a glance

1. Get the adapter descriptor — what settings and mapping fields Booking.com needs.
2. Collect the settings from the user and run a test connection.
3. Get the mapping details — the rooms and rates on the Booking.com side.
4. Get the connection details — the currency the hotel trades in.
5. Collect the Channex side — the property, its room types and rate plans.
6. Build the mapping structure.
7. Create the connection.
8. Activate it.

### 1. Get the adapter descriptor

Each channel is described by an **adapter descriptor**: the settings it needs (`params`), the per-mapping fields it needs (`rate_params`), its restrictions and the actions it supports.

```
GET /api/v1/channels/adapter?code=BookingCom
```

The full catalog of adapters is available at `GET /api/v1/channels/list`.

Response (abridged):

```json
{
  "data": {
    "code": "BookingCom",
    "title": "Booking.com",
    "kind": "meta",
    "actions": [
      "load_future_reservations"
    ],
    "channel_restrictions": {
      "currency": "EUR",
      "min_price": 500
    },
    "params": {
      "hotel_id": {
        "position": 0,
        "type": "string",
        "title": "Hotel ID"
      },
      "machine_account": {
        "position": 1,
        "type": "hidden",
        "title": "Machine Account ID"
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

* **`params`** — the connection settings to collect from the user. Each entry describes one field: `title` (English label), `type` (`string`, `integer`, `boolean`, `select`, `hidden`), `position` (ordering for a UI), `default`, `options` (for `select` fields) and conditional display `rules`. Fields of type `hidden` are managed by Channex — do not collect or send a value for them.
* **`rate_params`** — the fields each rate plan mapping must carry (step 6), described the same way.
* **`channel_restrictions`** — the OTA's limitations. For Booking.com, `min_price: 500` with `currency: "EUR"` means prices below 5.00 EUR are not accepted.
* **`actions`** — actions callable on an existing connection (see Actions).

For Booking.com, the only setting to collect from the user is **`hotel_id`** — the Booking.com Hotel ID. `machine_account` is filled automatically by Channex.

### 2. Test the connection

Before creating anything, validate the collected settings with a test connection:

```
POST /api/v1/channels/test_connection
```

```json
{
  "channel": "BookingCom",
  "settings": {
    "hotel_id": "5868189"
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

`success: true` means the credentials are correct and the hotel is ready for connection on the Booking.com side. On failure the response is still `200 OK` with `success: false` — for Booking.com, `errors` is `null` in both cases, so `success` is the field to check.

### 3. Get the mapping details

Next, fetch the rooms and rates the hotel exposes on the Booking.com side:

```
POST /api/v1/channels/mapping_details
```

The payload is the same as for the test connection:

```json
{
  "channel": "BookingCom",
  "settings": {
    "hotel_id": "5868189"
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
        "id": 586818903,
        "title": "Double Room",
        "max_children": 0,
        "rates": [
          {
            "id": 16385046,
            "title": "standard rate",
            "max_persons": 2,
            "occupancies": [1, 2],
            "price_1": null,
            "pricing": "OBP",
            "parent_rate_id": "",
            "readonly": false,
            "derived_rate_plan_ids": [16385048]
          },
          {
            "id": 16385047,
            "title": "special rate",
            "max_persons": 2,
            "occupancies": [1, 2],
            "price_1": null,
            "pricing": "OBP",
            "parent_rate_id": "",
            "readonly": false
          }
        ]
      }
    ]
  }
}
```

Every channel returns its own mapping-details shape; this one is Booking.com's.

**`pricing_type`** — the hotel's pricing model:

* **`OBP`** — occupancy-based pricing: each rate carries a price per occupancy option.
* **`Standard`** — per-room pricing: one price per rate, with an optional single-occupancy price.

**`rooms`** — the rooms available for mapping. Each room carries:

| Field          | Description                                                             |
| -------------- | ----------------------------------------------------------------------- |
| `id`           | Room ID on the Booking.com side.                                        |
| `title`        | Room title.                                                             |
| `max_children` | Maximum number of children; `null` when Booking.com does not report it. |
| `rates`        | Rates of the room.                                                      |

Each rate carries:

| Field                   | Description                                                                                  |
| ----------------------- | -------------------------------------------------------------------------------------------- |
| `id`                    | Rate ID on the Booking.com side.                                                             |
| `title`                 | Rate title.                                                                                  |
| `max_persons`           | Maximum number of persons; `null` when Booking.com does not report it.                       |
| `occupancies`           | Occupancy options of the rate. Empty for hotels on the `Standard` pricing model.             |
| `price_1`               | Whether the rate has a single-occupancy price. `null` for hotels on the `OBP` pricing model. |
| `pricing`               | Pricing model of the rate: `OBP` or `Standard`.                                              |
| `parent_rate_id`        | ID of the rate this rate is derived from; empty for rates that are not derived.              |
| `readonly`              | Whether the rate is read-only on the Booking.com side.                                       |
| `derived_rate_plan_ids` | IDs of the rates derived from this rate.                                                     |

Only parent rates are listed. Rates that Booking.com derives from another rate do not appear as rates of a room themselves — their IDs are collected in the parent's `derived_rate_plan_ids`, and when the connection is created or its mappings updated, Channex records known mappings for them automatically, so bookings arriving on a derived rate are allocated to the parent's mapped rate plan.

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
      "currency": "GBP"
    }
  }
}
```

For Booking.com this returns the currency the hotel trades in. Rate plans in any currency can be mapped: Channex converts prices to the channel's currency when pushing.

### 5. Collect the Channex side

Booking.com connections are one-to-one: **one connection maps exactly one Channex property to one Booking.com hotel**. Pick the property to connect, then fetch its room types and rate plans through the `options` endpoints:

```
GET /api/v1/room_types/options?filter[property_id]={property_id}
GET /api/v1/rate_plans/options?filter[property_id]={property_id}&multi_occupancy=true
```

Enable `multi_occupancy` on the rate plans request: for occupancy-based rate plans it expands each occupancy option into its own entry, which is exactly the granularity Booking.com mappings need.

### 6. Build the mapping structure

The mapping is a list of `rate_plans` entries, one per (Channex rate plan occupancy → Booking.com room/rate/occupancy) pair:

```json
{
  "rate_plan_id": "a35f1fd4-63c6-4fbc-8fbe-359869bd9958",
  "settings": {
    "room_type_code": 586818903,
    "rate_plan_code": 16385046,
    "occupancy": 2,
    "pricing_type": "OBP",
    "primary_occ": true,
    "readonly": false
  }
}
```

**`rate_plan_id`** — the Channex rate plan UUID (from step 5).

**`settings`** — the fields declared by `rate_params` in the adapter descriptor:

| Field            | Description                                                                                                                                                                         |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `room_type_code` | Room ID on the Booking.com side.                                                                                                                                                    |
| `rate_plan_code` | Rate ID on the Booking.com side.                                                                                                                                                    |
| `occupancy`      | The occupancy option of the Booking.com rate this mapping serves. Required for both pricing models.                                                                                 |
| `pricing_type`   | The hotel's pricing model — copy it from the mapping details.                                                                                                                       |
| `primary_occ`    | Whether this mapping is the primary one for its room + rate pair. The primary mapping sends availability and restrictions along with prices; non-primary mappings send prices only. |
| `readonly`       | The `readonly` flag of the rate, copied from the mapping details.                                                                                                                   |

Mark **exactly one mapping of each room + rate pair** as primary. For an **OBP** hotel, create one mapping per occupancy option you want to sell; for a **Standard** hotel, one mapping per rate is enough.

A full mapping for one Booking.com rate sold at occupancies 1 and 2:

```json
[
  {
    "rate_plan_id": "a35f1fd4-63c6-4fbc-8fbe-359869bd9958",
    "settings": {
      "room_type_code": 586818903,
      "rate_plan_code": 16385046,
      "occupancy": 2,
      "pricing_type": "OBP",
      "primary_occ": true,
      "readonly": false
    }
  },
  {
    "rate_plan_id": "2a0c416b-d8e6-4950-b52e-e7821030fd9d",
    "settings": {
      "room_type_code": 586818903,
      "rate_plan_code": 16385046,
      "occupancy": 1,
      "pricing_type": "OBP",
      "primary_occ": false,
      "readonly": false
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
    "channel": "BookingCom",
    "group_id": "60674dd6-1aeb-4c41-9e0c-8ffb378a4570",
    "title": "Opera",
    "properties": ["acb388d9-546b-42fc-9ae2-baf00e7f0d8c"],
    "settings": {
      "hotel_id": "5868189"
    },
    "rate_plans": [
      {
        "rate_plan_id": "a35f1fd4-63c6-4fbc-8fbe-359869bd9958",
        "settings": {
          "room_type_code": 586818903,
          "rate_plan_code": 16385046,
          "occupancy": 2,
          "pricing_type": "OBP",
          "primary_occ": true,
          "readonly": false
        }
      },
      {
        "rate_plan_id": "2a0c416b-d8e6-4950-b52e-e7821030fd9d",
        "settings": {
          "room_type_code": 586818903,
          "rate_plan_code": 16385046,
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
| `properties` | UUIDs of the connected properties. One property for Booking.com.                                           |
| `settings`   | The connection settings built from `params` — the same object the test connection validated.               |
| `rate_plans` | The mapping structure from step 6. Optional — mappings can also be added later by updating the connection. |

The response is `201 Created` with the channel connection resource:

```json
{
  "data": {
    "type": "channel",
    "id": "ca4ac55f-3be1-4039-9542-21e8285ffbf9",
    "attributes": {
      "id": "ca4ac55f-3be1-4039-9542-21e8285ffbf9",
      "title": "Opera",
      "channel": "BookingCom",
      "currency": "GBP",
      "is_active": false,
      "actions": ["load_future_reservations"],
      "properties": ["acb388d9-546b-42fc-9ae2-baf00e7f0d8c"],
      "settings": {
        "hotel_id": "5868189",
        "machine_account": "Channex-staging"
      },
      "rate_plans": [
        {
          "id": "9d7e45b3-367b-4286-a081-17a6c8d3c62e",
          "rate_plan_id": "a35f1fd4-63c6-4fbc-8fbe-359869bd9958",
          "settings": {
            "room_type_code": 586818903,
            "rate_plan_code": 16385046,
            "occupancy": 2,
            "pricing_type": "OBP",
            "primary_occ": true,
            "readonly": false
          }
        },
        {
          "id": "0f6fe97e-ab8b-4f0b-a1cd-dc3500f18295",
          "rate_plan_id": "2a0c416b-d8e6-4950-b52e-e7821030fd9d",
          "settings": {
            "room_type_code": 586818903,
            "rate_plan_code": 16385046,
            "occupancy": 1,
            "pricing_type": "OBP",
            "primary_occ": false,
            "readonly": false
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

Note two things about the created connection:

* **It starts disabled.** `is_active` in the create payload has no effect — a new connection is always created with `is_active: false`. Activation is a separate, explicit step.
* The connection's `currency` and the `machine_account` setting are filled by Channex from the Booking.com side.

Only one connection per Booking.com `hotel_id` is allowed on Channex.

### 8. Activate the connection

```
POST /api/v1/channels/{channel_id}/activate
```

No payload. Activation requires the connection to have at least one property and at least one rate plan mapping; activating starts the synchronization — Channex pushes the full current availability, rates and restrictions to Booking.com and begins collecting bookings, reviews and scores.

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

For Booking.com, `load_future_reservations` pulls the upcoming bookings from the OTA — useful right after activating a connection for a hotel that already has reservations.

### Booking.com settings reference

The full set of connection `settings` for Booking.com:

| Setting                    | Description                                                                            |
| -------------------------- | -------------------------------------------------------------------------------------- |
| `hotel_id`                 | The Booking.com Hotel ID. Required.                                                    |
| `machine_account`          | The Booking.com machine account used for communication. Read-only — filled by Channex. |
| `send_email_notifications` | When `true`, Channex sends a notification about each booking.                          |
| `email`                    | The email address the notifications go to.                                             |

**Advanced settings.** Booking.com emits callback events for changes to payout methods and virtual credit cards. By default Channex ignores them; enable these boolean flags to receive a booking modification when the corresponding data changes:

| Setting                            | Fires on                                          |
| ---------------------------------- | ------------------------------------------------- |
| `allow_payout_method_update`       | An existing payout method is updated.             |
| `allow_payout_update`              | The payout amount or related details are updated. |
| `allow_vcc_balance`                | The virtual credit card balance changes.          |
| `allow_vcc_fees_payout`            | The virtual credit card fee changes.              |
| `allow_virtual_credit_card_update` | The virtual credit card is updated.               |

### Testing

Two Booking.com test hotels are available on staging:

* `5868189` — occupancy-based pricing (`OBP`)
* `6519420` — per-room pricing (`Standard`)

Since only one connection per `hotel_id` is allowed, delete your test connection when finished (or before repeating a test run).
