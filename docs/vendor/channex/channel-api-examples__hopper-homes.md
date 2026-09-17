<!-- https://docs.channex.io/channel-api-examples/hopper-homes.md -->
> For the complete documentation index, see [llms.txt](https://docs.channex.io/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://docs.channex.io/channel-api-examples/hopper-homes.md).

# Hopper Homes

This guide walks through creating a channel connection between Channex and Hopper Homes over the API: discovering the adapter, creating the host, creating and publishing listings, mapping them to rate plans, and activating the connection.

A **channel connection** (a *channel*) links rate plans of a Channex property to rooms and rates on the OTA side. Once the connection is active, Channex pushes availability, rates and restrictions to Hopper Homes and receives bookings back.

Hopper Homes is one of the exceptions to the shared channel flow. Where most OTAs are connected by creating a channel with the property's own credentials, a Hopper Homes connection begins by creating a **host** — Channex registers the host with Hopper Homes and stores the returned access token on the connection, so there are no credentials to collect from the user. And where other channels expose an existing catalog of rooms and rates to map against, **Hopper Homes listings are created from Channex**: you build each listing, wait for Hopper Homes to publish it, and then map it to a rate plan. Mappings themselves work as they do everywhere else — a list of `rate_plans` on the connection — but each entry points at a listing rather than at a room and rate. Airbnb is the other exception, and it works differently again — it is covered by a separate guide.

All endpoints require authentication with an API key, sent in the `user-api-key` header.

#### The flow at a glance

1. Get the adapter descriptor — what settings and mapping fields Hopper Homes needs.
2. Create the host and the connection.
3. Create a listing for each unit you want to sell.
4. Check the listing status until Hopper Homes publishes it.
5. List the listings available for mapping.
6. Map each listing to a rate plan.
7. Activate the connection.

#### 1. Get the adapter descriptor

Each channel is described by an **adapter descriptor**: the settings it needs (`params`) and the per-mapping fields it needs (`rate_params`).

```
GET /api/v1/channels/adapter?code=HopperHomes
```

The full catalog of adapters is available at `GET /api/v1/channels/list`.

Response (abridged):

```json
{
  "data": {
    "code": "HopperHomes",
    "title": "Hopper Homes",
    "kind": "ota",
    "actions": [],
    "params": {
      "min_stay_type": {
        "default": "Arrival",
        "position": 1,
        "type": "switch",
        "options": ["Arrival", "Through"],
        "title": "Min Stay Type"
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
      },
      "host_email": {
        "position": 4,
        "type": "string",
        "title": "Verified Host Email"
      },
      "host_name": {
        "position": 5,
        "type": "string",
        "title": "Display Host Name"
      }
    },
    "rate_params": {
      "listing_id": { "position": 0, "title": "Listing", "type": "integer" }
    },
    "channel_restrictions": {
      "currency": "USD"
    }
  }
}
```

What to read from it:

* **`params`** — the connection settings. Each entry describes one field: `title` (English label), `type` (`string`, `integer`, `boolean`, `select`, `switch`, `hidden`), `position` (ordering for a UI), `default`, `options` (for `select` and `switch` fields) and conditional display `rules`.
* **`rate_params`** — the fields each rate plan mapping must carry (step 6). For Hopper Homes there is exactly one: `listing_id`. The descriptor types it as an integer, but Hopper Homes issues listing IDs as **UUID strings** — send the value exactly as the listing endpoints return it.
* **`channel_restrictions`** — constraints the channel places on the connection. Hopper Homes trades in **USD only**, so the connected properties must price in USD.

Unlike other channels there is no hotel identifier to collect. **`host_name`** and **`host_email`** are the two values to collect from the user; they are submitted when the host is created in step 2, and the access token and host ID Hopper Homes returns are stored on the connection automatically.

#### 2. Create the host and the connection

Hopper Homes connections are not created through `POST /api/v1/channels`. Use the host endpoint instead — it registers the host with Hopper Homes and creates the channel connection in one call:

```
POST /api/v1/channels/create_host
```

```json
{
  "channel": "HopperHomes",
  "group_id": "60674dd6-1aeb-4c41-9e0c-8ffb378a4570",
  "title": "Hopper Homes Channel",
  "properties": ["acb388d9-546b-42fc-9ae2-baf00e7f0d8c"],
  "host_name": "Coastal Stays",
  "host_email": "owner@coastalstays.example",
  "settings": {
    "min_stay_type": "Arrival"
  }
}
```

| Field        | Description                                                                                            |
| ------------ | ------------------------------------------------------------------------------------------------------ |
| `channel`    | The adapter code from the descriptor.                                                                  |
| `group_id`   | UUID of the group the connection belongs to. Required.                                                 |
| `title`      | Connection title. Optional — generated from the channel and property names when omitted.               |
| `properties` | UUIDs of the connected properties. Hopper Homes accepts **several properties** through one connection. |
| `host_name`  | The host name Hopper Homes displays. Required.                                                         |
| `host_email` | The host's verified email address on Hopper Homes. Required.                                           |
| `settings`   | Connection settings built from `params`. Optional — every one of them has a default.                   |

`host_name` and `host_email` are sent to Hopper Homes as the host's display name and verified email. Hopper Homes answers with a host ID and a host access token, which Channex stores in the connection's settings as `tokens` alongside `host_name` and `host_email`. The response is `201 Created` with the channel connection resource — the same shape as any other channel:

```json
{
  "data": {
    "type": "channel",
    "id": "ca4ac55f-3be1-4039-9542-21e8285ffbf9",
    "attributes": {
      "id": "ca4ac55f-3be1-4039-9542-21e8285ffbf9",
      "title": "Hopper Homes Channel",
      "channel": "HopperHomes",
      "currency": "USD",
      "is_active": false,
      "actions": [],
      "properties": ["acb388d9-546b-42fc-9ae2-baf00e7f0d8c"],
      "settings": {
        "tokens": {
          "host_access_token": "pKq7Rn2vXt4WcH9sLb3ZmY6dTf8gJa1E",
          "host_id": "cabd52b2-255a-490f-bb06-d8205afa8d46"
        },
        "host_name": "Coastal Stays",
        "host_email": "owner@coastalstays.example",
        "min_stay_type": "Arrival",
        "derived_option": {}
      },
      "rate_plans": [],
      "expected_removal_date": null
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

Three things in that response are worth reading. **`settings.tokens`** carries the `host_access_token` and the `host_id` Hopper Homes issued — Channex writes them and uses them for every later call, so you never send them yourself, but the `host_id` is the value to quote when asking Hopper Homes about the host. **`currency`** is fixed to `USD`, following the adapter's channel restriction. And **`derived_option`** is the generic Channex mapping-derivation setting, present on every channel.

Note that the connection **starts disabled** and **unmapped**: `is_active` is `false` and `rate_plans` is empty. Both are filled in by the steps below. Keep the returned `id` — every step from here on is scoped to it.

A connection is unique per host: the stored token and host ID are the uniqueness key, so creating a second host does not collide with an existing connection, but the same host cannot back two connections.

If you need the connection back later, read it with `GET /api/v1/channels/{channel_id}`.

#### 3. Create a listing

Everything Hopper Homes sells is a **listing**, and listings do not exist until you create them. Create one per unit you want to sell:

```
POST /api/v1/channels/{channel_id}/action/create_listing
```

The connection's stored token is used automatically — the payload carries only the listing itself:

```json
{
  "title": "Ocean View Apartment",
  "description": "Two-bedroom apartment with a sea-facing balcony.",
  "property_type": "apartment",
  "room_type": "entire_place",
  "address": "12 Marine Parade",
  "city": "Santa Monica",
  "state": "CA",
  "postal_code": "90401",
  "country_code": "US",
  "latitude": 34.0094,
  "longitude": -118.4973,
  "max_adults": 4,
  "max_children": 2,
  "number_of_beds": 3,
  "number_of_bedrooms": 2,
  "number_of_bathrooms": 2,
  "check_in_start_time": "15:00",
  "check_in_end_time": "22:00",
  "check_out_start_time": "07:00",
  "check_out_end_time": "11:00",
  "check_in_instructions": "Self check-in with a lockbox.",
  "amenities": ["wifi", "kitchen", "pool", "mountain_view"],
  "pets_allowed": false,
  "smoking_allowed": false,
  "parties_allowed": false,
  "house_rules": "No smoking indoors.",
  "photos": [
    {
      "caption": null,
      "original_url": "https://example.com/photos/ocean-view-01.jpg"
    }
  ],
  "registration_number": "STR-2024-0184",
  "size_square_feet": 950,
  "rooms": [
    {
      "name": "Master bedroom",
      "beds": [
        { "bed_type": "king", "count": 1 }
      ]
    },
    {
      "name": "Twin room",
      "beds": [
        { "bed_type": "twin", "count": 2 }
      ]
    }
  ]
}
```

The fields describe the unit as guests will see it:

| Field                                                                                    | Description                                                                                                 |
| ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `title`, `description`                                                                   | Listing name and long description.                                                                          |
| `property_type`, `room_type`                                                             | What kind of place it is and how much of it is let. See the vocabularies below.                             |
| `address`, `city`, `state`, `postal_code`, `country_code`                                | Postal address of the unit. `address` is stored as `address1`; a listing read back also carries `address2`. |
| `latitude`, `longitude`                                                                  | Coordinates of the unit.                                                                                    |
| `max_adults`, `max_children`                                                             | Occupancy limits. Their sum is sent as the listing's maximum occupancy.                                     |
| `number_of_beds`, `number_of_bedrooms`, `number_of_bathrooms`                            | Layout of the unit.                                                                                         |
| `check_in_start_time`, `check_in_end_time`, `check_out_start_time`, `check_out_end_time` | Check-in and check-out windows.                                                                             |
| `check_in_instructions`, `house_rules`                                                   | Free-text guest instructions and rules.                                                                     |
| `amenities`                                                                              | Amenity codes offered. Use the codes from the amenity vocabulary below.                                     |
| `pets_allowed`, `smoking_allowed`, `parties_allowed`                                     | Policy flags.                                                                                               |
| `photos`                                                                                 | Photos, each an object with an `original_url` and an optional `caption`.                                    |
| `registration_number`                                                                    | Short-term-rental registration number, where the jurisdiction requires one.                                 |
| `size_square_feet`                                                                       | Floor area.                                                                                                 |
| `rooms`                                                                                  | Per-room breakdown: each room has a `name` and a list of `beds`, each bed a `bed_type` and a `count`.       |

The response carries the created listing, including the `listing_id` that step 6 maps against. Listings are always created in English (`en-US`).

Hopper Homes will not accept a sparse listing. Channex's own listing form treats these as mandatory, which is a reliable guide to what the channel rejects: `title`, `description`, `property_type`, `room_type`, `address`, `city`, `state`, `postal_code`, `registration_number`, `latitude`, `longitude`, `max_adults`, `number_of_beds`, `number_of_bedrooms`, `number_of_bathrooms`, `check_in_instructions`, `house_rules`, `check_in_start_time`, `check_out_end_time`, and at least one entry in `amenities`. Two carry minimum lengths — `title` at least 5 characters and `description` at least 200 — so a short marketing blurb is not enough. Validation failures come back as the channel's own prose rather than structured field errors: the message arrives wrapped as `Invalid value for: body (…)` and names each offending field inline, for example `Got value 'null' with wrong type, expecting String at 'title'`.

`room_type` takes one of two values — `entire_place` or `private_room`.

`property_type` comes from a fixed list of about fifty values, among them `apartment`, `aparthotel`, `bed_and_breakfast`, `boutique_hotel`, `bungalow`, `cabin`, `campsite`, `castle`, `chalet`, `condo`, `cottage`, `guesthouse`, `hostel`, `hotel`, `house`, `resort`, `townhouse` and `villa`.

`bed_type`, inside each room's `beds`, takes `bunk_bed`, `cal_king`, `crib`, `full`, `king`, `queen`, `sofa_bed`, `twin` or `twin_xl`.

`amenities` only accepts codes Hopper Homes knows. Read the vocabulary before building the payload:

```
GET /api/v1/channels/{channel_id}/action/amenities
```

```json
{
  "data": {
    "amenities": [
      "accessibility",
      "air_conditioning",
      "barbecue_grill",
      "bathtub",
      "coffee_maker",
      "dedicated_workspace",
      "dishwasher",
      "free_parking",
      "gym",
      "heating",
      "hot_tub",
      "kitchen",
      "mountain_view",
      "pool",
      "smoke_alarm",
      "washer",
      "wifi"
    ]
  }
}
```

The full list is around a hundred codes covering accessibility, kitchen and laundry equipment, views, parking, safety devices and on-site facilities. It is a fixed vocabulary rather than free text — a code outside it is rejected.

To change a listing afterwards, send the same payload plus the `listing_id` to `PUT /api/v1/channels/{channel_id}/action/update_listing`. To read one back, use `GET /api/v1/channels/{channel_id}/action/get_listing` with its `listing_id`. `create_listing` answers with the stored listing under `data.listing`; `update_listing` does not — it answers with `data.success` alone, so read the listing back with `get_listing` if you need the stored result.

#### 4. Check the listing status

A new listing is not immediately sellable — Hopper Homes reviews and publishes it. Poll its status:

```
GET /api/v1/channels/{channel_id}/action/get_listing_status
```

with the `listing_id` of the listing to check. The answer arrives under `data.listing_status`. A listing carries two status fields, and both matter:

| Field                          | Description                                                                            |
| ------------------------------ | -------------------------------------------------------------------------------------- |
| `listing_status`               | Whether the listing is live on the host's side — `active` once it is selling.          |
| `publish_status.current_state` | Where the listing stands in Hopper Homes' publication process — `activated` when done. |
| `publish_status.is_published`  | `true` once Hopper Homes has published the listing.                                    |

Only a published listing receives availability, rates and bookings, so wait for `is_published` to turn `true` before mapping and activating.

You can also drive the status yourself. This is how a listing is taken off sale or put back on without deleting it:

```
POST /api/v1/channels/{channel_id}/action/change_listing_status
```

```json
{
  "listing_id": "c704fc37-6f0d-44cf-91f0-eaad7000ab64",
  "status": "active"
}
```

| Field        | Description                        |
| ------------ | ---------------------------------- |
| `listing_id` | Listing whose status is being set. |
| `status`     | The status to move the listing to. |

`status` takes one of three values:

| Status     | Meaning                                                                                                                                         |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `active`   | The listing is live and sellable.                                                                                                               |
| `inactive` | The listing is taken off sale but kept, and can be set back to `active` later.                                                                  |
| `archived` | The listing is retired. Archived listings are excluded from `all_listings`, so an archived listing disappears from the catalog you map against. |

The response carries the updated listing under `data.listing`. In practice `active` and `inactive` are the pair toggled to take a listing off sale and put it back, while `archived` is the one-way retirement.

Channex also sets these statuses on its own at three points in a connection's life, so a listing can change status without anyone calling the action:

| When                                     | Status applied | Which listings                |
| ---------------------------------------- | -------------- | ----------------------------- |
| A mapping is removed from the connection | `inactive`     | The listing that was unmapped |
| The connection is deactivated            | `inactive`     | Every mapped listing          |
| The connection is disconnected           | `archived`     | Every mapped listing          |

The reverse does not happen. Activating a connection does not move its listings back to `active` — activation only resumes the synchronization. So after a deactivate-then-activate cycle the listings are still `inactive`, and each has to be set back to `active` with this action; until then the connection is running but nothing is sellable.

#### 5. List the listings available for mapping

Once the listings exist, fetch them together with their current status:

```
GET /api/v1/channels/{channel_id}/action/all_listings
```

No payload — the connection's stored token identifies the host. Response (abridged):

```json
{
  "data": {
    "listings": [
      {
        "listing_id": "5983c17e-5c9c-4e10-9736-fea46430e016",
        "title": "Luxury Private Mountain Villa with Pool in Puglia",
        "internal_title": null,
        "external_id": null,
        "property_type": "villa",
        "room_type": "entire_place",
        "language": "en-US",
        "timezone": "Europe/Rome",
        "address1": "Via Ariella, 17",
        "address2": "",
        "city": "Roseto",
        "state": "Valfortore FG",
        "postal_code": "71039",
        "country_code": "IT",
        "latitude": 41.3721296,
        "longitude": 15.0958689,
        "max_occupancy": 20,
        "max_adults": 20,
        "max_children": null,
        "number_of_beds": 13,
        "number_of_bedrooms": 5,
        "number_of_bathrooms": 6,
        "size_square_feet": 8500,
        "registration_number": "IT071044B400101732",
        "check_in_start_time": "15:00",
        "check_in_end_time": "19:00",
        "check_out_start_time": "10:00",
        "check_out_end_time": "12:00",
        "pets_allowed": true,
        "smoking_allowed": false,
        "parties_allowed": false,
        "amenities": ["wifi", "pool", "kitchen", "gym", "mountain_view"],
        "photos": [
          {
            "caption": null,
            "original_url": "https://example.com/photos/villa-01.jpg"
          }
        ],
        "rooms": [
          {
            "name": "Blue room",
            "beds": [
              { "bed_type": "king", "count": 1 },
              { "bed_type": "twin", "count": 1 }
            ]
          }
        ],
        "distribution_channels": ["hopper_app", "hts"],
        "listing_status": "active",
        "publish_status": {
          "current_state": "activated",
          "is_published": true
        }
      }
    ]
  }
}
```

Archived listings are left out. Each entry is the listing's full record merged with its status, so this one call is enough to decide what to map — no per-listing follow-up needed. `distribution_channels` shows where Hopper Homes is distributing the listing, and `timezone` is the timezone its calendar is kept in.

The mapping-details endpoint returns the same catalog in the dictionary form used by listing-based channels, should you prefer it:

```
POST /api/v1/channels/mapping_details
```

```json
{
  "data": {
    "listing_id_dictionary": {
      "values": [
        {
          "id": "5983c17e-5c9c-4e10-9736-fea46430e016",
          "title": "Ocean View Apartment",
          "type": "apartment",
          "room_type": "entire_place",
          "occupancies": [1, 2, 3, 4, 5, 6]
        }
      ]
    }
  }
}
```

| Field         | Description                                                 |
| ------------- | ----------------------------------------------------------- |
| `id`          | Listing ID on the Hopper Homes side.                        |
| `title`       | Listing title.                                              |
| `type`        | Property type of the listing.                               |
| `room_type`   | How much of the property is let.                            |
| `occupancies` | Occupancy options, from one guest to the listing's maximum. |

#### 6. Map each listing to a rate plan

Mappings are written to the connection, by updating it with the `rate_plans` list:

```
PUT /api/v1/channels/{channel_id}
```

The payload is wrapped in a `channel` key, and carries one `rate_plans` entry per listing you are selling:

```json
{
  "channel": {
    "rate_plans": [
      {
        "rate_plan_id": "601f9765-cb84-4a22-90df-e520dc181d7f",
        "settings": {
          "listing_id": "c704fc37-6f0d-44cf-91f0-eaad7000ab64"
        }
      }
    ]
  }
}
```

**`rate_plan_id`** — the UUID of the Channex rate plan to map. Fetch the candidates with `GET /api/v1/rate_plans/options?filter[property_id]={property_id}`; Hopper Homes mappings have no occupancy field, so do not expand occupancy options.

**`settings`** — the fields declared by `rate_params`:

| Field        | Description                          |
| ------------ | ------------------------------------ |
| `listing_id` | Listing ID on the Hopper Homes side. |

One listing maps to one rate plan. There is no primary mapping to nominate and no occupancy to enumerate: the listing is the sellable unit, and its mapping carries that listing's price, availability and restrictions.

**`rate_plans` replaces the whole mapping set**, so send every mapping you want to keep on each update — a stored mapping missing from the list is removed, and a mapping sent with `settings: null` is removed as well. That is also how a listing is unmapped: send the list without it.

Only the fields you are changing need to be in the payload; the rest of the connection is left alone. Round-tripping a whole connection resource read back from `GET /api/v1/channels/{channel_id}` works too — the read-only fields in it are ignored.

Once mappings exist, each one's pricing and availability settings can be read and changed through `GET`/`PUT /api/v1/channels/{channel_id}/mappings/{mapping_id}/pricing_settings` and `.../availability_settings`, using the mapping `id` that a read of the connection reports.

#### 7. Activate the connection

```
POST /api/v1/channels/{channel_id}/activate
```

No payload. Activation requires the connection to have at least one property and at least one mapped listing; activating starts the synchronization — Channex pushes the full current availability, rates and restrictions to Hopper Homes and begins receiving bookings.

The counterpart is `POST /api/v1/channels/{channel_id}/deactivate`, which stops the synchronization but keeps the connection and its mappings.

#### Updating a connection

```
PUT /api/v1/channels/{channel_id}
```

The same endpoint that writes the mappings in step 6 also changes the connection itself. The payload is wrapped in `channel`, and two rules matter:

* **`channel` cannot be changed** — a different adapter code is rejected.
* **`rate_plans`, when present, replaces the whole mapping set.** A stored mapping missing from the list is removed, and a mapping sent with `settings: null` is removed as well. Omit `rate_plans` entirely to keep the stored mappings while changing `settings`, `title` or the connected properties.

Listings themselves are not part of this payload — they are created and edited through the action endpoints in step 3.

#### Deleting a connection

```
DELETE /api/v1/channels/{channel_id}
```

An active connection must be deactivated first. Deleting removes the connection and all its mappings; bookings received through it are kept.

Deletion reaches the channel too: it archives every listing the connection had mapped, which retires them on the Hopper Homes side and drops them out of `all_listings`. Deactivating first has already set them to `inactive`, so the sequence over a connection's whole life is `inactive` on deactivate, then `archived` on delete. Neither step is undone by creating a new connection — a fresh connection sees the archived listings gone from the catalog, so plan a delete accordingly.

#### Actions

The Hopper Homes adapter declares no connection actions — `actions` is empty on the descriptor and on every Hopper Homes connection. The listing, pricing and availability operations are reached through the channel-scoped action route, `/api/v1/channels/{channel_id}/action/{action}`:

| Method | Action                    | What it does                                     |
| ------ | ------------------------- | ------------------------------------------------ |
| `GET`  | `all_listings`            | Lists the host's listings with their status.     |
| `GET`  | `amenities`               | Returns the amenity codes a listing may declare. |
| `POST` | `create_listing`          | Creates a listing.                               |
| `PUT`  | `update_listing`          | Updates a listing.                               |
| `GET`  | `get_listing`             | Reads one listing.                               |
| `GET`  | `get_listing_status`      | Reads one listing's status.                      |
| `POST` | `change_listing_status`   | Sets one listing's status.                       |
| `GET`  | `get_default_rules`       | Reads a listing's default availability rules.    |
| `PUT`  | `update_default_rules`    | Updates a listing's default availability rules.  |
| `GET`  | `get_default_pricing`     | Reads a listing's default pricing.               |
| `PUT`  | `update_default_pricing`  | Updates a listing's default pricing.             |
| `GET`  | `get_pricing_settings`    | Reads a listing's pricing settings.              |
| `PUT`  | `update_pricing_settings` | Updates a listing's pricing settings.            |

The reads take the listing as a query parameter (`?listing_id=…`); the writes carry `listing_id` in the body.

#### Default availability rules

Alongside the dated availability Channex pushes, each listing carries a set of **default rules** — the baseline Hopper Homes falls back on for dates no update covers, and the lead-time limits that bound bookability. Read them with:

```
GET /api/v1/channels/{channel_id}/action/get_default_rules?listing_id=c704fc37-6f0d-44cf-91f0-eaad7000ab64
```

```json
{
  "data": {
    "rules": {
      "available": true,
      "check_in_days": ["sat", "mon", "thu", "tue", "wed", "sun"],
      "min_stay": 1,
      "max_stay": 2,
      "min_lead_time_hours": 1,
      "max_lead_time_days": 2
    }
  }
}
```

Write them with:

```
PUT /api/v1/channels/{channel_id}/action/update_default_rules
```

```json
{
  "listing_id": "c704fc37-6f0d-44cf-91f0-eaad7000ab64",
  "available": true,
  "check_in_days": ["mon", "tue", "wed", "thu", "sat", "sun"],
  "min_stay": 1,
  "max_stay": 2,
  "min_lead_time_hours": 1,
  "max_lead_time_days": 2
}
```

| Field                  | Description                                                                                                                               |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `listing_id`           | Listing the rules belong to.                                                                                                              |
| `available`            | Whether the listing is open by default on dates no update covers.                                                                         |
| `check_in_days`        | Weekdays a stay may begin on, as three-letter codes: `mon`, `tue`, `wed`, `thu`, `fri`, `sat`, `sun`. Omit a day to close arrivals on it. |
| `min_stay`, `max_stay` | Default length-of-stay bounds.                                                                                                            |
| `min_lead_time_hours`  | How close to arrival a booking may still be made.                                                                                         |
| `max_lead_time_days`   | How far ahead a booking may be made.                                                                                                      |

The update answers with the stored rules, in the same shape the read returns.

A `null` means the rule is unset and Hopper Homes' own default applies — a freshly created listing returns all six as `null`:

```json
{
  "data": {
    "rules": {
      "available": null,
      "check_in_days": null,
      "min_stay": null,
      "max_stay": null,
      "min_lead_time_hours": null,
      "max_lead_time_days": null
    }
  }
}
```

Every field is sent on each update, so include the values you want to keep; a field left out is sent as `null` and clears the rule. `0` is a legal value for `min_stay`, `max_stay`, `min_lead_time_hours` and `max_lead_time_days`, and means the bound is not enforced — distinct from `null`, which hands the decision back to Hopper Homes' own default.

#### Default pricing

Each listing also carries a default price, used for dates no rate update covers. Read it with:

```
GET /api/v1/channels/{channel_id}/action/get_default_pricing?listing_id=c704fc37-6f0d-44cf-91f0-eaad7000ab64
```

```json
{
  "data": {
    "pricing": {
      "nightly_price": null,
      "day_of_week_prices": null,
      "guests_included_rent": null,
      "additional_guest_fee": null
    }
  }
}
```

Write it with:

```
PUT /api/v1/channels/{channel_id}/action/update_default_pricing
```

```json
{
  "listing_id": "c704fc37-6f0d-44cf-91f0-eaad7000ab64",
  "nightly_price": "100",
  "day_of_week_prices": {
    "mon": "20",
    "tue": "23",
    "wed": "23",
    "thu": "45",
    "fri": "234",
    "sat": "35",
    "sun": "35"
  },
  "guests_included_rent": 2,
  "additional_guest_fee": "1"
}
```

| Field                  | Description                                                                      |
| ---------------------- | -------------------------------------------------------------------------------- |
| `listing_id`           | Listing the pricing belongs to.                                                  |
| `nightly_price`        | Default price for a night.                                                       |
| `day_of_week_prices`   | Per-weekday overrides of the nightly price, keyed by three-letter weekday codes. |
| `guests_included_rent` | How many guests the nightly price covers.                                        |
| `additional_guest_fee` | Charge for each guest beyond that number.                                        |

Prices are sent as decimal strings — `nightly_price`, `additional_guest_fee` and every entry in `day_of_week_prices`. `guests_included_rent` is the exception: it is a guest count, so it travels as a plain integer. The weekday keys are `mon`, `tue`, `wed`, `thu`, `fri`, `sat` and `sun`.

A price has to be derivable for every night, so either `nightly_price` is set, or all seven `day_of_week_prices` are. Supplying neither — or only some of the weekdays with no `nightly_price` to fall back on — is rejected with *Either a default price or all dayOfWeek prices must be specified*.

The response echoes the stored pricing:

```json
{
  "data": {
    "pricing": {
      "nightly_price": "100",
      "day_of_week_prices": {
        "mon": "20",
        "tue": "23",
        "wed": "23",
        "thu": "45",
        "fri": "234",
        "sat": "35",
        "sun": "35"
      },
      "guests_included_rent": 2,
      "additional_guest_fee": "1"
    }
  }
}
```

As with the availability rules, every field travels on each update — a field left out is cleared, not left alone.

#### Pricing settings

Separate from the price itself are the listing's pricing **settings**: its cancellation policy and the fees and taxes added on top of the rent.

```
GET /api/v1/channels/{channel_id}/action/get_pricing_settings?listing_id=c704fc37-6f0d-44cf-91f0-eaad7000ab64
```

```json
{
  "data": {
    "pricing": {
      "cancellation_policy": null,
      "currency": "USD",
      "pricing_model": "nightly_pricing",
      "fees": [],
      "taxes": []
    }
  }
}
```

```
PUT /api/v1/channels/{channel_id}/action/update_pricing_settings
```

```json
{
  "listing_id": "c704fc37-6f0d-44cf-91f0-eaad7000ab64",
  "cancellation_policy": "strict",
  "fees": [
    {
      "kind": "cleaning_fee",
      "name": "Test",
      "type": "flat_fee",
      "amount": "10",
      "charge_mode": "per_stay",
      "include_in_rent": true,
      "applicability_rule": {
        "type": "length_of_stay_between",
        "min_los": 2,
        "max_los": 2
      }
    }
  ],
  "taxes": [
    {
      "name": "test",
      "type": "flat_tax",
      "amount": "3",
      "charge_mode": "per_night",
      "applicability_rule": {
        "type": "booking_date_in",
        "from": "2026-09-04",
        "until": "2026-09-11"
      }
    }
  ]
}
```

| Field                 | Description                                                  |
| --------------------- | ------------------------------------------------------------ |
| `listing_id`          | Listing the settings belong to.                              |
| `cancellation_policy` | The listing's cancellation policy. See the vocabulary below. |
| `fees`                | Fees added to the booking.                                   |
| `taxes`               | Taxes added to the booking.                                  |

A **fee** carries a `name`, a `kind` (`cleaning_fee`, `pet_fee` or `other`), a `type`, a `charge_mode`, and `include_in_rent` deciding whether it is folded into the displayed rent. A **tax** has the same shape without `kind` and `include_in_rent`. Of these, `include_in_rent` and `applicability_rule` are optional; the rest are not.

`type` says how the charge is expressed, and settles both which amount field carries it and which charge modes are open to it:

| `type`                             | Amount field | Available `charge_mode`                                     |
| ---------------------------------- | ------------ | ----------------------------------------------------------- |
| `flat_fee` (fee), `flat_tax` (tax) | `amount`     | `per_stay`, `per_guest`, `per_night`, `per_guest_per_night` |
| `percentage_fee` (fee)             | `percent`    | `of_rent`                                                   |
| `percentage_tax` (tax)             | `percent`    | `of_rent`, `of_rent_and_fees`                               |

The flat types carry `amount` and the percentage types carry `percent`; the two are not interchangeable, and whichever does not belong to the chosen type is left null. Both travel as decimal strings.

An `applicability_rule` narrows when the charge applies. Its shape follows its own `type`, and the date-based type differs between fees and taxes:

| `applicability_rule.type` | Applies to | Fields                                 |
| ------------------------- | ---------- | -------------------------------------- |
| `length_of_stay_between`  | Both       | `min_los` and `max_los`, both optional |
| `stay_dates_overlap`      | Fees       | `from` and `until`, both required      |
| `booking_date_in`         | Taxes      | `from` and `until`, both required      |

`length_of_stay_between` bounds the stay lengths the charge applies to. `stay_dates_overlap` applies a fee when the stay itself overlaps the given dates, while `booking_date_in` applies a tax when the booking is *made* within them — a distinction worth keeping in mind, since the two look alike in a payload.

`cancellation_policy` accepts either the ID of a cancellation policy created on the Hopper Homes side, or one of the built-in names — `moderate`, `strict` or `non-refundable`. Send `null` to leave it unset; Channex's own UI shows the unset state as `not_set`, but that is a form placeholder only and never travels over the API.

**`currency` and `pricing_model` are fixed.** Channex always sends `USD` and `nightly_pricing` regardless of what the payload contains, so the two fields are read-only in practice — they appear in the response but cannot be changed here.

The response echoes the stored settings, with the fees and taxes as Hopper Homes recorded them.

#### What gets synchronized

An active connection pushes each batch of changes to Hopper Homes as four calls, one per kind of data: rates, calendar blocks, length-of-stay restrictions and changeover restrictions.

**Availability is a calendar block, not a count.** A listing is one sellable unit, so Hopper Homes takes availability as a date range being open or blocked rather than as a number of rooms. Channex sends the range with `available` set to the opposite of the closed state; the numeric availability of the Channex rate plan does not travel.

**Rates** are sent per listing and date range. A price of `0` is not sent as a price; it closes the date instead.

**Restrictions** map as follows:

| Channex restriction   | Hopper Homes field     |
| --------------------- | ---------------------- |
| `stop_sell`           | calendar block         |
| `min_stay`            | minimum length of stay |
| `max_stay`            | maximum length of stay |
| `closed_to_arrival`   | changeover restriction |
| `closed_to_departure` | changeover restriction |

`min_stay` and `max_stay` are both clamped to 1–31 (a `max_stay` of `0`, meaning no limit in Channex, is sent as `31`).

**`min_stay_type`** decides which Channex minimum stay feeds the minimum length of stay: `Arrival` sends the min-stay-on-arrival value, `Through` sends the min-stay-through value. The other one is ignored.

**Batching** — consecutive dates that carry identical values are collapsed into a single date range, and each kind of data is sent as its own request.

**Horizon** — changes are pushed for the next 730 days, counted from today in the property's timezone. Changes for dates in the past or beyond that window are dropped.

**Bookings** are pushed to Channex by Hopper Homes rather than polled, with cancellations arriving on their own path, and are matched back to a Channex rate plan by the listing they were made against.

#### Hopper Homes settings reference

The full set of connection `settings` for Hopper Homes:

| Setting                    | Description                                                                                                                                                    |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `min_stay_type`            | How the minimum stay restriction is applied: `Arrival` (counted from the arrival date) or `Through` (applied to every stayed-through date). Default `Arrival`. |
| `send_email_notifications` | When `true`, Channex sends a notification about each booking.                                                                                                  |
| `email`                    | The email address the notifications go to.                                                                                                                     |
| `host_email`               | The host's verified email address on Hopper Homes. Set when the host is created.                                                                               |
| `host_name`                | The host name Hopper Homes displays. Set when the host is created.                                                                                             |

The connection also carries a `tokens` object with the `host_access_token` and `host_id` Hopper Homes issued when the host was created, plus the `derived_option` and `mappingSettings` objects shared by all channels. All three are written by Channex and are not settings to supply or edit. The connection's `currency` is fixed to `USD` by the adapter's channel restriction.
