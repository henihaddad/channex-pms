<!-- https://docs.channex.io/channel-api-examples/ctoutvert.md -->
> For the complete documentation index, see [llms.txt](https://docs.channex.io/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://docs.channex.io/channel-api-examples/ctoutvert.md).

# Ctoutvert

This guide walks through creating a channel connection between Channex and Ctoutvert over the API: discovering the adapter, validating the hotel credentials, reading the rooms and rates on both sides, building the mapping, and creating and activating the connection.

A **channel connection** (a *channel*) links rate plans of a Channex property to rooms and rates on the OTA side. Once the connection is active, Channex pushes availability, rates and restrictions to Ctoutvert and receives bookings back.

Every OTA has its own API and data model, so the connection settings and the mapping settings differ per channel. The flow below is shared by most channels (Booking.com, Expedia, Agoda, Open Channel–based OTAs and others); the payloads shown are the Ctoutvert ones. Airbnb is the exception — it requires an OAuth authorization step and is covered by a separate guide.

All endpoints require authentication with an API key, sent in the `user-api-key` header.

#### The flow at a glance

1. Get the adapter descriptor — what settings and mapping fields Ctoutvert needs.
2. Collect the settings from the user and run a test connection.
3. Get the mapping details — the accommodations on the Ctoutvert side.
4. Collect the Channex side — the property, its room types and rate plans.
5. Build the mapping structure.
6. Create the connection.
7. Activate it.

#### 1. Get the adapter descriptor

Each channel is described by an **adapter descriptor**: the settings it needs (`params`) and the per-mapping fields it needs (`rate_params`).

```
GET /api/v1/channels/adapter?code=Ctoutvert
```

Ctoutvert is a **private adapter**: it appears in `GET /api/v1/channels/list` only for billing accounts that have been granted access to it. If the catalog does not list Ctoutvert for your account, ask Channex support to enable it before going further.

Response (abridged):

```json
{
  "data": {
    "code": "Ctoutvert",
    "title": "Ctoutvert",
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
        "type": "select",
        "options": ["Arrival", "Through"],
        "title": "Min Stay Type"
      },
      "booking_amount_settings": {
        "default": "With Commission",
        "position": 4,
        "type": "select",
        "options": ["With Commission", "Without Commission"],
        "title": "Booking Amount"
      },
      "ari_amount_settings": {
        "default": "With Commission",
        "position": 5,
        "type": "select",
        "options": ["With Commission", "Without Commission"],
        "title": "ARI Amount"
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
      "primary_occ": { "position": 3, "title": "Primary Occupancy", "type": "boolean" }
    }
  }
}
```

What to read from it:

* **`params`** — the connection settings to collect from the user. Each entry describes one field: `title` (English label), `type` (`string`, `integer`, `boolean`, `select`, `hidden`), `position` (ordering for a UI), `default`, `options` (for `select` fields) and conditional display `rules`.
* **`rate_params`** — the fields each rate plan mapping must carry (step 5), described the same way.

For Ctoutvert, the only setting to collect from the user is **`hotel_id`** — the Ctoutvert Hotel ID. The remaining settings have sensible defaults; see the settings reference.

Two things to know about `rate_params` here. `pricing_type` is a `select` rather than a fixed string, offering `Standard` and `OBP`. And `pricing_type` and `primary_occ` both report `position: 3`, so a UI that orders fields by position has to break that tie itself.

#### 2. Test the connection

Before creating anything, validate the collected settings with a test connection:

```
POST /api/v1/channels/test_connection
```

```json
{
  "channel": "Ctoutvert",
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

`success: true` means the credentials are correct and the hotel is ready for connection on the Ctoutvert side. On failure the response is still `200 OK` with `success: false` — check the `success` field, not the status code.

#### 3. Get the mapping details

Next, fetch the accommodations the hotel exposes on the Ctoutvert side:

```
POST /api/v1/channels/mapping_details
```

The payload is the same as for the test connection:

```json
{
  "channel": "Ctoutvert",
  "settings": {
    "hotel_id": "12345"
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
        "id": "MH4",
        "title": "Mobile Home 4 persons"
      },
      {
        "id": "PITCH",
        "title": "Camping Pitch"
      }
    ]
  }
}
```

Every channel returns its own mapping-details shape; this one is Ctoutvert's.

**`pricing_type`** — the hotel's pricing model. Ctoutvert reports standard per-room pricing, so it is always `Standard`.

**`rooms`** — the accommodations available for mapping. Each one carries:

| Field   | Description                               |
| ------- | ----------------------------------------- |
| `id`    | Accommodation code on the Ctoutvert side. |
| `title` | Accommodation title.                      |

**Ctoutvert publishes no rates.** Unlike every other channel, `rooms` carries no `rates` array: the descriptive-info call returns the accommodation list only. A mapping therefore targets a Ctoutvert accommodation, and takes its rate identity from the Channex side — see step 5.

#### 4. Collect the Channex side

Ctoutvert connections are one-to-one: **one connection maps exactly one Channex property to one Ctoutvert hotel**. Pick the property to connect, then fetch its room types and rate plans through the `options` endpoints:

```
GET /api/v1/room_types/options?filter[property_id]={property_id}
GET /api/v1/rate_plans/options?filter[property_id]={property_id}&multi_occupancy=true
```

Enable `multi_occupancy` on the rate plans request: for occupancy-based rate plans it expands each occupancy option into its own entry, which is exactly the granularity Ctoutvert mappings need.

Map those expanded occupancy entries, not the parent rate plans. Ctoutvert resolves each mapping by finding the parent rate plan that the mapped rate plan derives from, and a mapping that points at a parent rate plan directly resolves to nothing and is skipped during synchronization.

#### 5. Build the mapping structure

The mapping is a list of `rate_plans` entries, one per (Channex rate plan occupancy → Ctoutvert accommodation) pair:

```json
{
  "rate_plan_id": "a35f1fd4-63c6-4fbc-8fbe-359869bd9958",
  "settings": {
    "room_type_code": "MH4",
    "rate_plan_code": "MH4",
    "occupancy": 4,
    "pricing_type": "Standard",
    "primary_occ": true
  }
}
```

**`rate_plan_id`** — the Channex rate plan UUID (from step 4).

**`settings`** — the fields declared by `rate_params` in the adapter descriptor:

| Field            | Description                                                                                                                                                                         |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `room_type_code` | Accommodation code on the Ctoutvert side. Required — a mapping without it is skipped during synchronization.                                                                        |
| `rate_plan_code` | Rate code for the mapping. Ctoutvert does not publish rates, and the code pushed to the channel is derived from the Channex rate plan instead — see "What gets synchronized".       |
| `occupancy`      | The occupancy option this mapping serves.                                                                                                                                           |
| `pricing_type`   | The pricing model for the mapping: `Standard` or `OBP`.                                                                                                                             |
| `primary_occ`    | Whether this mapping is the primary one for its room + rate pair. The primary mapping sends availability and restrictions along with prices; non-primary mappings send prices only. |

Mark **exactly one mapping of each room + rate pair** as primary, and create one mapping per occupancy option you want to sell.

A full mapping for one Ctoutvert accommodation sold at occupancies 2 and 4:

```json
[
  {
    "rate_plan_id": "a35f1fd4-63c6-4fbc-8fbe-359869bd9958",
    "settings": {
      "room_type_code": "MH4",
      "rate_plan_code": "MH4",
      "occupancy": 4,
      "pricing_type": "Standard",
      "primary_occ": true
    }
  },
  {
    "rate_plan_id": "2a0c416b-d8e6-4950-b52e-e7821030fd9d",
    "settings": {
      "room_type_code": "MH4",
      "rate_plan_code": "MH4",
      "occupancy": 2,
      "pricing_type": "Standard",
      "primary_occ": false
    }
  }
]
```

#### 6. Create the connection

```
POST /api/v1/channels
```

The payload is wrapped in a `channel` key:

```json
{
  "channel": {
    "channel": "Ctoutvert",
    "group_id": "60674dd6-1aeb-4c41-9e0c-8ffb378a4570",
    "title": "Ctoutvert Channel",
    "properties": ["acb388d9-546b-42fc-9ae2-baf00e7f0d8c"],
    "settings": {
      "hotel_id": "12345",
      "min_stay_type": "Arrival",
      "booking_amount_settings": "With Commission",
      "ari_amount_settings": "With Commission"
    },
    "rate_plans": [
      {
        "rate_plan_id": "a35f1fd4-63c6-4fbc-8fbe-359869bd9958",
        "settings": {
          "room_type_code": "MH4",
          "rate_plan_code": "MH4",
          "occupancy": 4,
          "pricing_type": "Standard",
          "primary_occ": true
        }
      },
      {
        "rate_plan_id": "2a0c416b-d8e6-4950-b52e-e7821030fd9d",
        "settings": {
          "room_type_code": "MH4",
          "rate_plan_code": "MH4",
          "occupancy": 2,
          "pricing_type": "Standard",
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
| `properties` | UUIDs of the connected properties. One property for Ctoutvert.                                             |
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
      "title": "Ctoutvert Channel",
      "channel": "Ctoutvert",
      "is_active": false,
      "actions": [],
      "properties": ["acb388d9-546b-42fc-9ae2-baf00e7f0d8c"],
      "settings": {
        "hotel_id": "12345",
        "min_stay_type": "Arrival",
        "booking_amount_settings": "With Commission",
        "ari_amount_settings": "With Commission"
      },
      "rate_plans": [
        {
          "id": "9d7e45b3-367b-4286-a081-17a6c8d3c62e",
          "rate_plan_id": "a35f1fd4-63c6-4fbc-8fbe-359869bd9958",
          "settings": {
            "room_type_code": "MH4",
            "rate_plan_code": "MH4",
            "occupancy": 4,
            "pricing_type": "Standard",
            "primary_occ": true
          }
        },
        {
          "id": "0f6fe97e-ab8b-4f0b-a1cd-dc3500f18295",
          "rate_plan_id": "2a0c416b-d8e6-4950-b52e-e7821030fd9d",
          "settings": {
            "room_type_code": "MH4",
            "rate_plan_code": "MH4",
            "occupancy": 2,
            "pricing_type": "Standard",
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

Only one connection per Ctoutvert `hotel_id` is allowed on Channex.

#### 7. Activate the connection

```
POST /api/v1/channels/{channel_id}/activate
```

No payload. Activation requires the connection to have at least one property and at least one rate plan mapping; activating starts the synchronization — Channex pushes the full current availability, rates and restrictions to Ctoutvert and begins receiving bookings.

The counterpart is `POST /api/v1/channels/{channel_id}/deactivate`, which stops the synchronization but keeps the connection and its mappings.

#### Updating a connection

```
PUT /api/v1/channels/{channel_id}
```

The payload has the same shape as for create (wrapped in `channel`). Two rules matter:

* **`channel` cannot be changed** — a different adapter code is rejected.
* **`rate_plans`, when present, replaces the whole mapping set.** A stored mapping missing from the list is removed, and a mapping sent with `settings: null` is removed as well. Omit `rate_plans` entirely to keep the stored mappings.

#### Deleting a connection

```
DELETE /api/v1/channels/{channel_id}
```

An active connection must be deactivated first. Deleting removes the connection and all its mappings; bookings received through it are kept.

#### Actions

The Ctoutvert adapter declares no connection actions — `actions` is empty on the descriptor and on every Ctoutvert connection.

#### What gets synchronized

An active connection pushes each batch of changes to Ctoutvert as two calls: a rate notification carrying prices, and an availability notification carrying availability and restrictions.

**The rate code is taken from Channex, not from the mapping.** Because Ctoutvert publishes no rates, the rate plan code sent to the channel is the UUID of the Channex **parent** rate plan that the mapped occupancy rate plan derives from. The `rate_plan_code` field on the mapping is not what travels. This also means a mapping resolves only when the mapped rate plan really is a derived occupancy rate plan and the mapping carries a `room_type_code`; mappings failing either test are skipped, and nothing for them reaches Ctoutvert.

**Availability** is sent per accommodation and rate. An availability of zero or below is sent as `0`.

**Rates** are sent per accommodation and rate, as base amounts by guest count, so every mapping sends the price of its own occupancy. A price of `0` is not sent as a price; it closes the date instead.

**`ari_amount_settings`** decides how the price is labelled: `With Commission` sends it as the amount after tax, `Without Commission` as the amount before tax.

**Restrictions** map as follows:

| Channex restriction | Ctoutvert field   |
| ------------------- | ----------------- |
| `stop_sell`         | closed            |
| `closed_to_arrival` | closed to arrival |
| `min_stay`          | minimum stay      |
| `max_stay`          | maximum stay      |

`min_stay` and `max_stay` are both clamped to 1–31 (a `max_stay` of `0`, meaning no limit in Channex, is sent as `31`). Ctoutvert accepts no closed-to-departure restriction, so that one is never sent.

**`min_stay_type`** decides which Channex minimum stay feeds the minimum stay: `Arrival` sends the min-stay-on-arrival value, `Through` sends the min-stay-through value. The other one is ignored.

**Merging** — for one date, accommodation and rate, the rate, availability and restriction changes of all mapped occupancies are merged into a single message. Where two mappings disagree on a value that is not per-occupancy, the primary mapping wins.

**Horizon** — changes are pushed for the next 550 days, counted from today in the property's timezone. Changes for dates in the past or beyond that window are dropped.

**Bookings** are pushed to Channex by Ctoutvert rather than polled, and are matched back to a Channex rate plan by the accommodation and rate codes they carry. A booking for an unmapped pair still arrives, but as unmapped.

#### Ctoutvert settings reference

The full set of connection `settings` for Ctoutvert:

| Setting                    | Description                                                                                                                                                         |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hotel_id`                 | The Ctoutvert Hotel ID. Required.                                                                                                                                   |
| `send_email_notifications` | When `true`, Channex sends a notification about each booking.                                                                                                       |
| `email`                    | The email address the notifications go to.                                                                                                                          |
| `min_stay_type`            | How the minimum stay restriction is applied: `Arrival` (counted from the arrival date) or `Through` (applied to every stayed-through date). Default `Arrival`.      |
| `booking_amount_settings`  | Which amount is recorded as the booking total: `With Commission` (the amount after tax) or `Without Commission` (the amount before tax). Default `With Commission`. |
| `ari_amount_settings`      | Which amount the pushed prices are sent as: `With Commission` (the amount after tax) or `Without Commission` (the amount before tax). Default `With Commission`.    |
