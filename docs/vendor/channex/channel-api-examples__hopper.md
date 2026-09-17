<!-- https://docs.channex.io/channel-api-examples/hopper.md -->
> For the complete documentation index, see [llms.txt](https://docs.channex.io/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://docs.channex.io/channel-api-examples/hopper.md).

# Hopper

This guide walks through creating a channel connection between Channex and Hopper over the API: discovering the adapter, running a test connection, selecting the rate plans to sell, and creating and activating the connection.

A **channel connection** (a *channel*) links rate plans of a Channex property to the OTA. Once the connection is active, Channex pushes availability, rates and restrictions to Hopper and receives bookings back.

Every OTA has its own API and data model, so the connection settings and the mapping settings differ per channel. Hopper's flow is shorter than that of most channels: it needs no credentials, and there are no Hopper-side rooms and rates to discover and match — Hopper sells the Channex rate plans directly, so the mapping simply lists the rate plans to expose.

All endpoints require authentication with an API key, sent in the `user-api-key` header.

### The flow at a glance

1. Get the adapter descriptor — what settings Hopper supports.
2. Run a test connection.
3. Collect the Channex side — the property, its room types and rate plans.
4. Build the mapping structure — the rate plans to sell on Hopper.
5. Create the connection.
6. Activate it.

### 1. Get the adapter descriptor

Each channel is described by an **adapter descriptor**: the settings it needs (`params`) and the per-mapping fields it needs (`rate_params`).

```
GET /api/v1/channels/adapter?code=Hopper
```

The full catalog of adapters is available at `GET /api/v1/channels/list`.

Response (abridged):

```json
{
  "data": {
    "code": "Hopper",
    "title": "Hopper",
    "kind": "meta",
    "actions": [],
    "params": {
      "email": {
        "position": 1,
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
        "position": 2,
        "type": "boolean",
        "title": "Send Property Notification"
      },
      "max_stay_type": {
        "default": "Arrival",
        "position": 3,
        "type": "switch",
        "options": ["Arrival", "Through"],
        "title": "Max Stay Type"
      }
    },
    "rate_params": {}
  }
}
```

What to read from it:

* **`params`** — the connection settings to collect from the user. Each entry describes one field: `title` (English label), `type` (`string`, `integer`, `boolean`, `select`, `switch`, `hidden`), `position` (ordering for a UI), `default`, `options` (for `select` and `switch` fields) and conditional display `rules`.
* **`rate_params`** — the fields each rate plan mapping must carry. For Hopper it is empty: mappings carry no channel-specific fields — only the generic `sync` flag (step 4).

Hopper needs no credentials — there is nothing that must be collected from the user. All settings are optional and control notifications and restriction handling; see the settings reference.

### 2. Test the connection

Before creating anything, validate the settings with a test connection:

```
POST /api/v1/channels/test_connection
```

```json
{
  "channel": "Hopper",
  "settings": {}
}
```

`channel` is the adapter code from the descriptor; `settings` is the object built from `params` — for Hopper it can be empty.

Response:

```json
{
  "data": {
    "success": true,
    "errors": null
  }
}
```

`success: true` means the settings are valid and the connection can be created. On failure the response is still `200 OK` with `success: false` — check the `success` field, not the status code.

### 3. Collect the Channex side

Hopper connections are one-to-one: **one connection maps exactly one Channex property to Hopper**. Pick the property to connect, then fetch its room types and rate plans through the `options` endpoints:

```
GET /api/v1/room_types/options?filter[property_id]={property_id}
GET /api/v1/rate_plans/options?filter[property_id]={property_id}
```

### 4. Build the mapping structure

Hopper's mapping is direct: instead of matching Channex rate plans against rooms and rates on the OTA side, the mapping simply lists the Channex rate plans to sell on Hopper. The mapping is a list of `rate_plans` entries, one per rate plan:

```json
{
  "rate_plan_id": "a35f1fd4-63c6-4fbc-8fbe-359869bd9958",
  "settings": {
    "sync": true
  }
}
```

**`rate_plan_id`** — the Channex rate plan UUID (from step 3).

**`settings`** — a single field:

| Field  | Description                                      |
| ------ | ------------------------------------------------ |
| `sync` | Whether the rate plan is synchronized to Hopper. |

A full mapping exposing two rate plans:

```json
[
  {
    "rate_plan_id": "a35f1fd4-63c6-4fbc-8fbe-359869bd9958",
    "settings": {
      "sync": true
    }
  },
  {
    "rate_plan_id": "2a0c416b-d8e6-4950-b52e-e7821030fd9d",
    "settings": {
      "sync": true
    }
  }
]
```

### 5. Create the connection

```
POST /api/v1/channels
```

The payload is wrapped in a `channel` key:

```json
{
  "channel": {
    "channel": "Hopper",
    "group_id": "60674dd6-1aeb-4c41-9e0c-8ffb378a4570",
    "title": "Hopper Channel",
    "properties": ["acb388d9-546b-42fc-9ae2-baf00e7f0d8c"],
    "settings": {
      "max_stay_type": "Arrival"
    },
    "rate_plans": [
      {
        "rate_plan_id": "a35f1fd4-63c6-4fbc-8fbe-359869bd9958",
        "settings": {
          "sync": true
        }
      },
      {
        "rate_plan_id": "2a0c416b-d8e6-4950-b52e-e7821030fd9d",
        "settings": {
          "sync": true
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
| `properties` | UUIDs of the connected properties. One property for Hopper.                                                |
| `settings`   | The connection settings built from `params` — the same object the test connection validated.               |
| `rate_plans` | The mapping structure from step 4. Optional — mappings can also be added later by updating the connection. |

The response is `201 Created` with the channel connection resource (abridged):

```json
{
  "data": {
    "type": "channel",
    "id": "ca4ac55f-3be1-4039-9542-21e8285ffbf9",
    "attributes": {
      "id": "ca4ac55f-3be1-4039-9542-21e8285ffbf9",
      "title": "Hopper Channel",
      "channel": "Hopper",
      "is_active": false,
      "actions": [],
      "properties": ["acb388d9-546b-42fc-9ae2-baf00e7f0d8c"],
      "settings": {
        "max_stay_type": "Arrival"
      },
      "rate_plans": [
        {
          "id": "9d7e45b3-367b-4286-a081-17a6c8d3c62e",
          "rate_plan_id": "a35f1fd4-63c6-4fbc-8fbe-359869bd9958",
          "settings": {
            "sync": true
          }
        },
        {
          "id": "0f6fe97e-ab8b-4f0b-a1cd-dc3500f18295",
          "rate_plan_id": "2a0c416b-d8e6-4950-b52e-e7821030fd9d",
          "settings": {
            "sync": true
          }
        }
      ]
    }
  }
}
```

Note that the connection **starts disabled**: `is_active` in the create payload has no effect — a new connection is always created with `is_active: false`. Activation is a separate, explicit step.

### 6. Activate the connection

```
POST /api/v1/channels/{channel_id}/activate
```

No payload. Activation requires the connection to have at least one property and at least one rate plan mapping; activating starts the synchronization — Channex pushes the full current availability, rates and restrictions to Hopper and begins receiving bookings.

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

The Hopper adapter declares no connection actions — `actions` is empty on the descriptor and on every Hopper connection.

### Hopper settings reference

The full set of connection `settings` for Hopper:

| Setting                    | Description                                                                                                                                                    |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `email`                    | The email address the notifications go to.                                                                                                                     |
| `send_email_notifications` | When `true`, Channex sends a notification about each booking. Default `false`.                                                                                 |
| `max_stay_type`            | How the maximum stay restriction is applied: `Arrival` (counted from the arrival date) or `Through` (applied to every stayed-through date). Default `Arrival`. |
