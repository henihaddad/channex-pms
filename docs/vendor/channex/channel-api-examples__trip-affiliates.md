<!-- https://docs.channex.io/channel-api-examples/trip-affiliates.md -->
> For the complete documentation index, see [llms.txt](https://docs.channex.io/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://docs.channex.io/channel-api-examples/trip-affiliates.md).

# Trip Affiliates

This guide walks through creating a channel connection between Channex and Trip Affiliates over the API: discovering the adapter, validating the hotel credentials, reading the rooms and rates on both sides, building the mapping, and creating and activating the connection.

A **channel connection** (a *channel*) links rate plans of a Channex property to rooms and rates on the OTA side. Once the connection is active, Channex pushes availability, rates and restrictions to Trip Affiliates and receives bookings back.

Every OTA has its own API and data model, so the connection settings and the mapping settings differ per channel. The flow below is shared by most channels (Booking.com, Expedia, Agoda, Open Channel–based OTAs and others); the payloads shown are the Trip Affiliates ones. Airbnb is the exception — it requires an OAuth authorization step and is covered by a separate guide.

All endpoints require authentication with an API key, sent in the `user-api-key` header.

#### The flow at a glance

1. Get the adapter descriptor — what settings and mapping fields Trip Affiliates needs.
2. Collect the settings from the user and run a test connection.
3. Get the mapping details — the rooms and rates on the Trip Affiliates side.
4. Collect the Channex side — the property, its room types and rate plans.
5. Build the mapping structure.
6. Create the connection.
7. Activate it.

#### 1. Get the adapter descriptor

Each channel is described by an **adapter descriptor**: the settings it needs (`params`) and the per-mapping fields it needs (`rate_params`).

```
GET /api/v1/channels/adapter?code=TripAffiliates
```

The full catalog of adapters is available at `GET /api/v1/channels/list`.

Response (abridged):

```json
{
  "data": {
    "code": "TripAffiliates",
    "title": "Trip Affiliates",
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
      "min_stay_type": {
        "default": "Arrival",
        "position": 3,
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

* **`params`** — the connection settings to collect from the user. Each entry describes one field: `title` (English label), `type` (`string`, `integer`, `boolean`, `select`, `switch`, `hidden`), `position` (ordering for a UI), `default`, `options` (for `select` and `switch` fields) and conditional display `rules`.
* **`rate_params`** — the fields each rate plan mapping must carry (step 5), described the same way.

For Trip Affiliates, the only setting to collect from the user is **`hotel_code`** — the Trip Affiliates Hotel Code. The remaining settings have sensible defaults; see the settings reference.

#### 2. Test the connection

Before creating anything, validate the collected settings with a test connection:

```
POST /api/v1/channels/test_connection
```

```json
{
  "channel": "TripAffiliates",
  "settings": {
    "hotel_code": "TA-88214"
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

`success: true` means the credentials are correct and the hotel is ready for connection on the Trip Affiliates side. On failure the response is still `200 OK` with `success: false` — check the `success` field, not the status code.

Trip Affiliates has no dedicated test endpoint, so the check reads the hotel's room and rate mappings; `hotel_code` is required, and a `settings` object without it is rejected before the request leaves Channex.

#### 3. Get the mapping details

Next, fetch the rooms and rates the hotel exposes on the Trip Affiliates side:

```
POST /api/v1/channels/mapping_details
```

The payload is the same as for the test connection:

```json
{
  "channel": "TripAffiliates",
  "settings": {
    "hotel_code": "TA-88214"
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
        "id": "Deluxe Double Room",
        "title": "Deluxe Double Room",
        "rates": [
          {
            "id": "RP1001",
            "title": "Room Only"
          },
          {
            "id": "RP1002",
            "title": "Breakfast Included"
          }
        ]
      }
    ]
  }
}
```

Every channel returns its own mapping-details shape; this one is Trip Affiliates'.

**`pricing_type`** — the hotel's pricing model. Trip Affiliates uses standard per-room pricing, so it is always `Standard`: a rate carries one price per date, whatever the occupancy.

**`rooms`** — the rooms available for mapping. Each room carries:

| Field   | Description                                                  |
| ------- | ------------------------------------------------------------ |
| `id`    | Room identifier on the Trip Affiliates side — the room name. |
| `title` | Room title.                                                  |
| `rates` | Rates of the room.                                           |

Each rate carries:

| Field   | Description                          |
| ------- | ------------------------------------ |
| `id`    | Rate ID on the Trip Affiliates side. |
| `title` | Rate title.                          |

Trip Affiliates identifies rooms by name rather than by a separate code, so `id` and `title` are the same string — use `id` verbatim as `room_type_code`. Rates belonging to a room with no adult capacity on the Trip Affiliates side are not returned and cannot be mapped.

#### 4. Collect the Channex side

Trip Affiliates connections are one-to-one: **one connection maps exactly one Channex property to one Trip Affiliates hotel**. Pick the property to connect, then fetch its room types and rate plans through the `options` endpoints:

```
GET /api/v1/room_types/options?filter[property_id]={property_id}
GET /api/v1/rate_plans/options?filter[property_id]={property_id}
```

Do not enable `multi_occupancy` here. Although the descriptor declares `occupancy`, `pricing_type` and `primary_occ`, the Trip Affiliates synchronization reads none of them, and the hotel is reported as `Standard` — so one Channex rate plan maps to one Trip Affiliates rate as a whole.

#### 5. Build the mapping structure

The mapping is a list of `rate_plans` entries, one per (Channex rate plan → Trip Affiliates room/rate) pair:

```json
{
  "rate_plan_id": "a35f1fd4-63c6-4fbc-8fbe-359869bd9958",
  "settings": {
    "room_type_code": "Deluxe Double Room",
    "rate_plan_code": "RP1001",
    "extra_adult_price": 0,
    "extra_child_price": 0
  }
}
```

**`rate_plan_id`** — the Channex rate plan UUID (from step 4).

**`settings`** — the fields declared by `rate_params` in the adapter descriptor:

| Field               | Description                                                                                               |
| ------------------- | --------------------------------------------------------------------------------------------------------- |
| `room_type_code`    | Room name on the Trip Affiliates side. Required — a mapping without it is skipped during synchronization. |
| `rate_plan_code`    | Rate ID on the Trip Affiliates side. Required — a mapping without it is skipped during synchronization.   |
| `occupancy`         | Declared by the descriptor but not used by the Trip Affiliates synchronization.                           |
| `pricing_type`      | Declared by the descriptor but not used by the Trip Affiliates synchronization.                           |
| `primary_occ`       | Declared by the descriptor but not used by the Trip Affiliates synchronization.                           |
| `extra_adult_price` | Extra adult surcharge amount. Optional.                                                                   |
| `extra_child_price` | Extra child surcharge amount. Optional.                                                                   |

Create one mapping per Trip Affiliates room + rate pair you want to sell. There is no primary mapping to nominate: with one mapping per rate, every mapping carries that rate's price, availability and restrictions.

A full mapping for a room sold on two Trip Affiliates rates:

```json
[
  {
    "rate_plan_id": "a35f1fd4-63c6-4fbc-8fbe-359869bd9958",
    "settings": {
      "room_type_code": "Deluxe Double Room",
      "rate_plan_code": "RP1001",
      "extra_adult_price": 0,
      "extra_child_price": 0
    }
  },
  {
    "rate_plan_id": "2a0c416b-d8e6-4950-b52e-e7821030fd9d",
    "settings": {
      "room_type_code": "Deluxe Double Room",
      "rate_plan_code": "RP1002"
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
    "channel": "TripAffiliates",
    "group_id": "60674dd6-1aeb-4c41-9e0c-8ffb378a4570",
    "title": "Trip Affiliates Channel",
    "properties": ["acb388d9-546b-42fc-9ae2-baf00e7f0d8c"],
    "settings": {
      "hotel_code": "TA-88214",
      "min_stay_type": "Arrival"
    },
    "rate_plans": [
      {
        "rate_plan_id": "a35f1fd4-63c6-4fbc-8fbe-359869bd9958",
        "settings": {
          "room_type_code": "Deluxe Double Room",
          "rate_plan_code": "RP1001",
          "extra_adult_price": 0,
          "extra_child_price": 0
        }
      },
      {
        "rate_plan_id": "2a0c416b-d8e6-4950-b52e-e7821030fd9d",
        "settings": {
          "room_type_code": "Deluxe Double Room",
          "rate_plan_code": "RP1002"
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
| `properties` | UUIDs of the connected properties. One property for Trip Affiliates.                                       |
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
      "title": "Trip Affiliates Channel",
      "channel": "TripAffiliates",
      "is_active": false,
      "actions": [],
      "properties": ["acb388d9-546b-42fc-9ae2-baf00e7f0d8c"],
      "settings": {
        "hotel_code": "TA-88214",
        "min_stay_type": "Arrival"
      },
      "rate_plans": [
        {
          "id": "9d7e45b3-367b-4286-a081-17a6c8d3c62e",
          "rate_plan_id": "a35f1fd4-63c6-4fbc-8fbe-359869bd9958",
          "settings": {
            "room_type_code": "Deluxe Double Room",
            "rate_plan_code": "RP1001",
            "extra_adult_price": 0,
            "extra_child_price": 0
          }
        },
        {
          "id": "0f6fe97e-ab8b-4f0b-a1cd-dc3500f18295",
          "rate_plan_id": "2a0c416b-d8e6-4950-b52e-e7821030fd9d",
          "settings": {
            "room_type_code": "Deluxe Double Room",
            "rate_plan_code": "RP1002"
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

Only one connection per Trip Affiliates `hotel_code` is allowed on Channex.

#### 7. Activate the connection

```
POST /api/v1/channels/{channel_id}/activate
```

No payload. Activation requires the connection to have at least one property and at least one rate plan mapping; activating starts the synchronization — Channex pushes the full current availability, rates and restrictions to Trip Affiliates and begins receiving bookings.

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

The Trip Affiliates adapter declares no connection actions — `actions` is empty on the descriptor and on every Trip Affiliates connection.

#### What gets synchronized

An active connection pushes each batch of changes to Trip Affiliates as two calls: a rate and inventory update carrying prices and availability, and a restriction update.

**Availability** is sent per room and rate. An availability of zero or below is sent as `0`.

**Rates** are sent per room and rate, one price per date — Trip Affiliates prices the room, not the occupancy. The extra adult and extra child surcharges declared on the mapping travel with them, and the rate plan's meal type is taken from the Channex rate plan rather than from the mapping. A price of `0` is sent as `0`.

**Restrictions** map as follows:

| Channex restriction   | Trip Affiliates field |
| --------------------- | --------------------- |
| `stop_sell`           | closed                |
| `closed_to_arrival`   | closed to arrival     |
| `closed_to_departure` | closed to departure   |
| `min_stay`            | minimum stay          |
| `max_stay`            | maximum stay          |

`min_stay` and `max_stay` are both clamped to 1–31 (a `max_stay` of `0`, meaning no limit in Channex, is sent as `31`).

**`min_stay_type`** decides which Channex minimum stay feeds the minimum stay: `Arrival` sends the min-stay-on-arrival value, `Through` sends the min-stay-through value. The other one is ignored.

**Mappings must carry both codes.** A mapping missing either `rate_plan_code` or `room_type_code` is skipped, and nothing for it reaches Trip Affiliates.

**Horizon** — changes are pushed for the next 18 months, counted from today in the property's timezone. Changes for dates in the past or beyond that window are dropped.

**Bookings** are pushed to Channex by Trip Affiliates rather than polled, and each one is acknowledged back once Channex has taken it.

#### Trip Affiliates settings reference

The full set of connection `settings` for Trip Affiliates:

| Setting                    | Description                                                                                                                                                    |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hotel_code`               | The Trip Affiliates Hotel Code. Required.                                                                                                                      |
| `send_email_notifications` | When `true`, Channex sends a notification about each booking.                                                                                                  |
| `email`                    | The email address the notifications go to.                                                                                                                     |
| `min_stay_type`            | How the minimum stay restriction is applied: `Arrival` (counted from the arrival date) or `Through` (applied to every stayed-through date). Default `Arrival`. |
