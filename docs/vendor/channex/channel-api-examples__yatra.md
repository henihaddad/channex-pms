<!-- https://docs.channex.io/channel-api-examples/yatra.md -->
> For the complete documentation index, see [llms.txt](https://docs.channex.io/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://docs.channex.io/channel-api-examples/yatra.md).

# Yatra

This guide walks through creating a channel connection between Channex and Yatra over the API: discovering the adapter, validating the hotel credentials, reading the rooms and rates on both sides, building the mapping, and creating and activating the connection.

A **channel connection** (a *channel*) links rate plans of a Channex property to rooms and rates on the OTA side. Once the connection is active, Channex pushes availability, rates and restrictions to Yatra and receives bookings back.

Every OTA has its own API and data model, so the connection settings and the mapping settings differ per channel. The flow below is shared by most channels (Booking.com, Expedia, Agoda, Open Channel–based OTAs and others); the payloads shown are the Yatra ones. Airbnb is the exception — it requires an OAuth authorization step and is covered by a separate guide.

All endpoints require authentication with an API key, sent in the `user-api-key` header.

#### The flow at a glance

1. Get the adapter descriptor — what settings and mapping fields Yatra needs.
2. Collect the settings from the user and run a test connection.
3. Get the mapping details — the room types and rate plans on the Yatra side.
4. Collect the Channex side — the property, its room types and rate plans.
5. Build the mapping structure.
6. Create the connection.
7. Activate it.

#### 1. Get the adapter descriptor

Each channel is described by an **adapter descriptor**: the settings it needs (`params`) and the per-mapping fields it needs (`rate_params`).

```
GET /api/v1/channels/adapter?code=Yatra
```

The full catalog of adapters is available at `GET /api/v1/channels/list`.

Response (abridged):

```json
{
  "data": {
    "code": "Yatra",
    "title": "Yatra",
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
      "ari_amount_settings": {
        "default": "With Commission",
        "position": 3,
        "type": "select",
        "options": ["With Commission", "Without Commission"],
        "title": "ARI Amount"
      }
    },
    "rate_params": {
      "rate_plan_code": { "position": 0, "title": "Rate Plan", "type": "string" },
      "room_type_code": { "position": 1, "title": "Room Type", "type": "string" }
    }
  }
}
```

What to read from it:

* **`params`** — the connection settings to collect from the user. Each entry describes one field: `title` (English label), `type` (`string`, `integer`, `boolean`, `select`, `hidden`), `position` (ordering for a UI), `default`, `options` (for `select` fields) and conditional display `rules`.
* **`rate_params`** — the fields each rate plan mapping must carry (step 5), described the same way.

For Yatra, the only setting to collect from the user is **`hotel_code`** — the Yatra Hotel Code. The remaining settings have sensible defaults; see the settings reference.

Note how short `rate_params` is: a Yatra mapping is a room type and a rate plan, with no occupancy dimension. That shapes steps 4 and 5.

#### 2. Test the connection

Before creating anything, validate the collected settings with a test connection:

```
POST /api/v1/channels/test_connection
```

```json
{
  "channel": "Yatra",
  "settings": {
    "hotel_code": "YTR-40219"
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

`success: true` means the credentials are correct and the hotel is ready for connection on the Yatra side. On failure the response is still `200 OK` with `success: false` — check the `success` field, not the status code.

Yatra has no dedicated test endpoint, so the check reads the hotel information; `hotel_code` is required, and an empty or missing one is rejected before the request leaves Channex.

#### 3. Get the mapping details

Next, fetch the room types and rate plans the hotel exposes on the Yatra side:

```
POST /api/v1/channels/mapping_details
```

The payload is the same as for the test connection:

```json
{
  "channel": "Yatra",
  "settings": {
    "hotel_code": "YTR-40219"
  }
}
```

Response:

```json
{
  "data": {
    "pricing_type": null,
    "rooms": [
      {
        "id": "DLX",
        "title": "Deluxe Room",
        "rates": [
          {
            "id": "RP-2001",
            "title": "Room Only"
          },
          {
            "id": "RP-2002",
            "title": "Breakfast Included"
          }
        ]
      }
    ]
  }
}
```

Every channel returns its own mapping-details shape; this one is Yatra's.

**`pricing_type`** — Yatra reports no pricing model, so it is always `null`. A rate plan carries one price per date, whatever the occupancy.

**`rooms`** — the room types available for mapping. Each one carries:

| Field   | Description                       |
| ------- | --------------------------------- |
| `id`    | Room type code on the Yatra side. |
| `title` | Room type name.                   |
| `rates` | Rate plans of the room type.      |

Each rate plan carries:

| Field   | Description                     |
| ------- | ------------------------------- |
| `id`    | Rate plan ID on the Yatra side. |
| `title` | Rate plan name.                 |

Rate plans carry no occupancy options, because Yatra prices a room type rather than a headcount.

#### 4. Collect the Channex side

Yatra connections are one-to-one: **one connection maps exactly one Channex property to one Yatra hotel**. Pick the property to connect, then fetch its room types and rate plans through the `options` endpoints:

```
GET /api/v1/room_types/options?filter[property_id]={property_id}
GET /api/v1/rate_plans/options?filter[property_id]={property_id}
```

Do not enable `multi_occupancy` here. Yatra mappings have no occupancy field, so one Channex rate plan maps to one Yatra rate plan as a whole; expanding occupancy options would produce entries the mapping cannot express.

#### 5. Build the mapping structure

The mapping is a list of `rate_plans` entries, one per (Channex rate plan → Yatra room type/rate plan) pair:

```json
{
  "rate_plan_id": "a35f1fd4-63c6-4fbc-8fbe-359869bd9958",
  "settings": {
    "room_type_code": "DLX",
    "rate_plan_code": "RP-2001"
  }
}
```

**`rate_plan_id`** — the Channex rate plan UUID (from step 4).

**`settings`** — the fields declared by `rate_params` in the adapter descriptor:

| Field            | Description                       |
| ---------------- | --------------------------------- |
| `room_type_code` | Room type code on the Yatra side. |
| `rate_plan_code` | Rate plan ID on the Yatra side.   |

Create one mapping per Yatra room type + rate plan pair you want to sell. There is no primary mapping to nominate: with one mapping per rate plan, every mapping carries that rate plan's price, availability and restrictions.

A full mapping for a room type sold on two Yatra rate plans:

```json
[
  {
    "rate_plan_id": "a35f1fd4-63c6-4fbc-8fbe-359869bd9958",
    "settings": {
      "room_type_code": "DLX",
      "rate_plan_code": "RP-2001"
    }
  },
  {
    "rate_plan_id": "2a0c416b-d8e6-4950-b52e-e7821030fd9d",
    "settings": {
      "room_type_code": "DLX",
      "rate_plan_code": "RP-2002"
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
    "channel": "Yatra",
    "group_id": "60674dd6-1aeb-4c41-9e0c-8ffb378a4570",
    "title": "Yatra Channel",
    "properties": ["acb388d9-546b-42fc-9ae2-baf00e7f0d8c"],
    "settings": {
      "hotel_code": "YTR-40219",
      "ari_amount_settings": "With Commission"
    },
    "rate_plans": [
      {
        "rate_plan_id": "a35f1fd4-63c6-4fbc-8fbe-359869bd9958",
        "settings": {
          "room_type_code": "DLX",
          "rate_plan_code": "RP-2001"
        }
      },
      {
        "rate_plan_id": "2a0c416b-d8e6-4950-b52e-e7821030fd9d",
        "settings": {
          "room_type_code": "DLX",
          "rate_plan_code": "RP-2002"
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
| `properties` | UUIDs of the connected properties. One property for Yatra.                                                 |
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
      "title": "Yatra Channel",
      "channel": "Yatra",
      "is_active": false,
      "actions": [],
      "properties": ["acb388d9-546b-42fc-9ae2-baf00e7f0d8c"],
      "settings": {
        "hotel_code": "YTR-40219",
        "ari_amount_settings": "With Commission"
      },
      "rate_plans": [
        {
          "id": "9d7e45b3-367b-4286-a081-17a6c8d3c62e",
          "rate_plan_id": "a35f1fd4-63c6-4fbc-8fbe-359869bd9958",
          "settings": {
            "room_type_code": "DLX",
            "rate_plan_code": "RP-2001"
          }
        },
        {
          "id": "0f6fe97e-ab8b-4f0b-a1cd-dc3500f18295",
          "rate_plan_id": "2a0c416b-d8e6-4950-b52e-e7821030fd9d",
          "settings": {
            "room_type_code": "DLX",
            "rate_plan_code": "RP-2002"
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

Only one connection per Yatra `hotel_code` is allowed on Channex.

#### 7. Activate the connection

```
POST /api/v1/channels/{channel_id}/activate
```

No payload. Activation requires the connection to have at least one property and at least one rate plan mapping; activating starts the synchronization — Channex pushes the full current availability, rates and restrictions to Yatra and begins receiving bookings.

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

The Yatra adapter declares no connection actions — `actions` is empty on the descriptor and on every Yatra connection.

#### What gets synchronized

An active connection pushes each batch of changes to Yatra as two calls: an availability notification carrying availability and restrictions, and a rate notification carrying prices.

**Availability** is sent per room type and rate plan. An availability of zero or below is sent as `0` and closes the date as well.

**Rates** are sent per room type and rate plan, one price per date. A price of `0` is not sent as a price; it closes the date instead.

**`ari_amount_settings`** decides how the price is labelled: `With Commission` sends it as the amount after tax, `Without Commission` as the amount before tax.

**Restrictions** — Yatra takes stop sell and minimum stay only:

| Channex restriction | Yatra field  |
| ------------------- | ------------ |
| `stop_sell`         | closed       |
| `min_stay`          | minimum stay |

The minimum stay is clamped to 1–28, and the value sent is the min stay on arrival. Maximum stay, closed to arrival and closed to departure are not sent.

**Batching** — consecutive dates that carry identical values are collapsed into a single date range, and a range spans at most 122 days; longer stretches are split.

**Horizon** — changes are pushed for the next 18 months, counted from today in the property's timezone. Changes for dates in the past or beyond that window are dropped.

**Retries** — a failed synchronization is retried, so a transient Yatra error does not silently lose the change.

**Bookings** are pushed to Channex by Yatra rather than polled, and are matched back to a Channex rate plan by the room type and rate plan codes they carry. A booking for an unmapped pair still arrives, but as unmapped.

#### Yatra settings reference

The full set of connection `settings` for Yatra:

| Setting                    | Description                                                                                                                                                      |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hotel_code`               | The Yatra Hotel Code. Required.                                                                                                                                  |
| `send_email_notifications` | When `true`, Channex sends a notification about each booking.                                                                                                    |
| `email`                    | The email address the notifications go to.                                                                                                                       |
| `ari_amount_settings`      | Which amount the pushed prices are sent as: `With Commission` (the amount after tax) or `Without Commission` (the amount before tax). Default `With Commission`. |
