<!-- https://docs.channex.io/api-v.1-documentation/rate-plans-collection.md -->
> For the complete documentation index, see [llms.txt](https://docs.channex.io/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://docs.channex.io/api-v.1-documentation/rate-plans-collection.md).

# Rate Plans Collection

API methods to work with Rate Plans

**Rate Plan** is a pricing plan of how to sell your Room Types. This contains information about prices and restrictions.

## Rate Plans List

Retrieve a list of Rate Plans associated with user Properties.

{% tabs %}
{% tab title="Request" %}
Request:

```
GET https://staging.channex.io/api/v1/rate_plans
```

{% endtab %}

{% tab title="Success Response" %}
**Success Response Example**

Status Code: `200 OK`

```javascript
{
  "data": [
    {
      "type": "rate_plan",
      "id": "bab451e7-9ab1-4cc4-aa16-107bf7bbabb2",
      "attributes": {
        "id": "bab451e7-9ab1-4cc4-aa16-107bf7bbabb2",
        "title": "Best Available Rate",
        "sell_mode": "per_room",
        "rate_mode": "manual",
        "currency": "GBP",
        "children_fee": "0.00",
        "infant_fee": "0.00",
        "max_stay": [0, 0, 0, 0, 0, 0, 0],
        "min_stay_arrival": [1, 1, 1, 1, 1, 1, 1],
        "min_stay_through": [1, 1, 1, 1, 1, 1, 1],
        "closed_to_arrival": [false, false, false, false, false, false, false],
        "closed_to_departure": [false, false, false, false, false, false, false],
        "stop_sell": [false, false, false, false, false, false, false],
        "options": [
          {
            "occupancy": 3,
            "is_primary": true,
            "derived_option": null,
            "rate": 0
          }
        ],
        "inherit_rate": false,
        "inherit_closed_to_arrival": false,
        "inherit_closed_to_departure": false,
        "inherit_stop_sell": false,
        "inherit_min_stay_arrival": false,
        "inherit_min_stay_through": false,
        "inherit_max_stay": false,
        "inherit_availability_offset": false,
        "inherit_max_sell": false,
        "inherit_max_availability": false,
        "auto_rate_settings": null,
        "meal_type": "none"
      },
      "relationships": {
        "room_type": {
          "data": {
            "type": "room_type",
            "id": "994d1375-dbbd-4072-8724-b2ab32ce781b"
          }
        },
        "property": {
          "data": {
            "type": "property",
            "id": "716305c4-561a-4561-a187-7f5b8aeb5920"
          }
        }
      }
    }
  ],
  "meta": {
    "page": 1,
    "total": 1,
    "limit": 10
  }
}
```

{% endtab %}

{% tab title="Error Response" %}
**Unauthorised Error Response**

Status Code: `401 Unauthorized`

```javascript
{
  "errors": {
    "code": "unauthorized",
    "title": "Unauthorized"
  }
}
```

{% endtab %}
{% endtabs %}

### Pagination

By default, this method returns the first 10 elements. To get more details, you should use [Pagination](https://docs.channex.io/api-v.1-documentation/api-reference#pagination) arguments.\
Information about count of entities and current pagination position contained at `meta` section at response object.

### Returns

**Success**\
Method can return a Success result with `200 OK` HTTP Code if operation is successful. Will contain a list of Rate Plan objects in the answer.\
\
**Unauthorised Error**\
Method can return a Unauthorised Error result with `401 Unauthorized` HTTP Code if wrong API Key provided.

## Rate Plan Options

Method to get list of all rate plans associated with the current account without additional details and pagination limits.

{% tabs %}
{% tab title="Request" %}
Request:

```
GET https://staging.channex.io/api/v1/rate_plans/options?filter[property_id]={property_id}
```

{% endtab %}

{% tab title="Success Response" %}
**Success Response Example**

Status Code: `200 OK`

```javascript
{
  "data": [
    {
      "attributes": {
        "id": "bab451e7-9ab1-4cc4-aa16-107bf7bbabb2",
        "occupancy": 3,
        "parent_rate_plan_id": null,
        "property_id": "716305c4-561a-4561-a187-7f5b8aeb5920",
        "rate_category_id": null,
        "room_type_id": "994d1375-dbbd-4072-8724-b2ab32ce781b",
        "sell_mode": "per_room",
        "title": "Best Available Rate"
      },
      "id": "bab451e7-9ab1-4cc4-aa16-107bf7bbabb2",
      "type": "rate_plan"
    }
  ]
}
```

{% endtab %}

{% tab title="Error Response" %}
**Unauthorised Error Response**

Status Code: `401 Unauthorized`

```javascript
{
  "errors": {
    "code": "unauthorized",
    "title": "Unauthorized"
  }
}
```

{% endtab %}
{% endtabs %}

## Get Rate Plan by ID

Retrieve a specific Rate Plan by ID.

{% tabs %}
{% tab title="Request" %}
Request:

```
GET https://staging.channex.io/api/v1/rate_plans/:id
```

{% endtab %}

{% tab title="Success Response" %}
**Success Response Example**

Status Code: `200 OK`

```javascript
{
  "data": {
    "type": "rate_plan",
    "id": "bab451e7-9ab1-4cc4-aa16-107bf7bbabb2",
    "attributes": {
      "id": "bab451e7-9ab1-4cc4-aa16-107bf7bbabb2",
      "title": "Best Available Rate",
      "sell_mode": "per_room",
      "rate_mode": "manual",
      "currency": "GBP",
      "children_fee": "0.00",
      "infant_fee": "0.00",
      "max_stay": [0, 0, 0, 0, 0, 0, 0],
      "min_stay_arrival": [1, 1, 1, 1, 1, 1, 1],
      "min_stay_through": [1, 1, 1, 1, 1, 1, 1],
      "closed_to_arrival": [false, false, false, false, false, false, false],
      "closed_to_departure": [false, false, false, false, false, false, false],
      "stop_sell": [false, false, false, false, false, false, false],
      "options": [
        {
          "occupancy": 3,
          "is_primary": true,
          "derived_option": null,
          "rate": 0
        }
      ],
      "inherit_rate": false,
      "inherit_closed_to_arrival": false,
      "inherit_closed_to_departure": false,
      "inherit_stop_sell": false,
      "inherit_min_stay_arrival": false,
      "inherit_min_stay_through": false,
      "inherit_max_stay": false,
      "inherit_availability_offset": false,
      "inherit_max_sell": false,
      "inherit_max_availability": false,
      "auto_rate_settings": null,
      "meal_type": "none"
    },
    "relationships": {
      "room_type": {
        "data": {
          "type": "room_type",
          "id": "994d1375-dbbd-4072-8724-b2ab32ce781b"
        }
      },
      "property": {
        "data": {
          "type": "property",
          "id": "716305c4-561a-4561-a187-7f5b8aeb5920"
        }
      },
      "tax_set": {
        "data": {
          "type": "tax_set",
          "id": "4adfa81f-af0a-4b39-834f-1336ab065c08"
        }
      }
    }
  }
}
```

{% endtab %}

{% tab title="Error Response" %}
**Unauthorised Error Response**

Status Code: `401 Unauthorized`

```javascript
{
  "errors": {
    "code": "unauthorized",
    "title": "Unauthorized"
  }
}
```

**Not Found Error**

Status Code: `404 Not Found`

```javascript
{
  "errors": {
    "code": "resource_not_found",
    "title": "Resource Not Found"
  }
}
```

{% endtab %}
{% endtabs %}

### Returns

**Success**\
Method can return a Success result with `200 OK` HTTP Code if operation is successful. Will contain a Rate Plan object in the answer.\
\
**Unauthorised Error**\
Method can return a Unauthorised Error result with `401 Unauthorized` HTTP Code if wrong API Key provided.

**Not Found Error**\
Method can return a Not Found Error result with `404 Not Found` HTTP Code if Rate Plan with provided ID is not present at system.

## Create Rate Plan

Create a new Rate Plan.

{% hint style="info" %}
All created rates will have default values set by Channex. Rate = 0, Stop sell = Off, Min Stay = 1. After you create a rate please use the [Availability and Rates API](/api-v.1-documentation/ari.md#update-rate-and-restrictions) to send values per day.
{% endhint %}

{% tabs %}
{% tab title="Request" %}
Request:

```
POST https://staging.channex.io/api/v1/rate_plans
```

Query body (JSON):

```javascript
{
  "rate_plan": {
    "title": "Best Available Rate",
    "property_id": "716305c4-561a-4561-a187-7f5b8aeb5920",
    "room_type_id": "994d1375-dbbd-4072-8724-b2ab32ce781b",
    "tax_set_id": "4adfa81f-af0a-4b39-834f-1336ab065c08",
    "parent_rate_plan_id": null,
    "children_fee": "0.00",
    "infant_fee": "0.00",
    "max_stay": [0, 0, 0, 0, 0, 0, 0],
    "min_stay_arrival": [1, 1, 1, 1, 1, 1, 1],
    "min_stay_through": [1, 1, 1, 1, 1, 1, 1],
    "closed_to_arrival": [false, false, false, false, false, false, false],
    "closed_to_departure": [false, false, false, false, false, false, false],
    "stop_sell": [false, false, false, false, false, false, false],
    "options": [
      {
        "occupancy": 3,
        "is_primary": true,
        "rate": 0
      }
    ],
    "currency": "GBP",
    "sell_mode": "per_room",
    "rate_mode": "manual",
    "inherit_rate": false,
    "inherit_closed_to_arrival": false,
    "inherit_closed_to_departure": false,
    "inherit_stop_sell": false,
    "inherit_min_stay_arrival": false,
    "inherit_min_stay_through": false,
    "inherit_max_stay": false,
    "inherit_max_sell": false,
    "inherit_max_availability": false,
    "inherit_availability_offset": false,
    "auto_rate_settings": null
  }
}
```

{% endtab %}

{% tab title="Success Response" %}
**Success Response Example**

Status Code: `201 Created`

```javascript
{
  "data": {
    "type": "rate_plan",
    "id": "bab451e7-9ab1-4cc4-aa16-107bf7bbabb2",
    "attributes": {
      "id": "bab451e7-9ab1-4cc4-aa16-107bf7bbabb2",
      "title": "Best Available Rate",
      "sell_mode": "per_room",
      "rate_mode": "manual",
      "currency": "GBP",
      "children_fee": "0.00",
      "infant_fee": "0.00",
      "max_stay": [0, 0, 0, 0, 0, 0, 0],
      "min_stay_arrival": [1, 1, 1, 1, 1, 1, 1],
      "min_stay_through": [1, 1, 1, 1, 1, 1, 1],
      "closed_to_arrival": [false, false, false, false, false, false, false],
      "closed_to_departure": [false, false, false, false, false, false, false],
      "stop_sell": [false, false, false, false, false, false, false],
      "options": [
        {
          "occupancy": 3,
          "is_primary": true,
          "derived_option": null,
          "rate": 0
        }
      ],
      "inherit_rate": false,
      "inherit_closed_to_arrival": false,
      "inherit_closed_to_departure": false,
      "inherit_stop_sell": false,
      "inherit_min_stay_arrival": false,
      "inherit_max_stay": false,
      "inherit_availability_offset": false,
      "inherit_max_sell": false,
      "inherit_max_availability": false,
      "auto_rate_settings": null,
      "meal_type": "none"
    },
    "relationships": {
      "room_type": {
        "data": {
          "type": "room_type",
          "id": "994d1375-dbbd-4072-8724-b2ab32ce781b"
        }
      },
      "property": {
        "data": {
          "type": "property",
          "id": "716305c4-561a-4561-a187-7f5b8aeb5920"
        }
      },
      "tax_set": {
        "data": {
          "type": "tax_set",
          "id": "4adfa81f-af0a-4b39-834f-1336ab065c08"
        }
      }
    }
  }
}
```

{% endtab %}

{% tab title="Error Response" %}
**Unauthorised Error Response**

Status Code: `401 Unauthorized`

```javascript
{
  "errors": {
    "code": "unauthorized",
    "title": "Unauthorized"
  }
}
```

**Validation Error Response**

Status Code: `422 Unprocessable Entity`

```javascript
{
  "errors": {
    "code": "validation_error",
    "title": "Validation Error",
    "details": {
      "title": [
        "can't be blank"
      ]
    }
  }
}
```

{% endtab %}
{% endtabs %}

### Fields

**title `[required]`**

Any non-empty string with maximum length of 255 symbols. Should be unique per Property.\
Note: The Rate Plan will be represented in the system under that title.

**property\_id `[required]`**

String with valid UUID of the Property ID that you would like to associate with the created Rate Plan.

**room\_type\_id `[required]`**

String with valid UUID of Room Type ID that you would like to associate with the created Rate Plan.

**tax\_set\_id `[optional]`**

String with valid UUID of Tax Set ID that you would like to associate with the created Rate Plan. If not provided, default Tax Set associated with Property will be used.

**options `[required]`**

Array of Occupancy Option objects.

**parent\_rate\_plan\_id `[optional]`**

String with valid UUID of Rate Plan object what you would like to associate as parent with created Rate Plan.

**currency `[optional]`**

3 symbols long string with Currency Alphabetic code based at [ISO 4217](https://www.iso.org/iso-4217-currency-codes.html).\
Note: Field is optional, by default system set Currency from associated Property.\
Property can have Rate Plans with different Currencies.

**sell\_mode `[optional]`**

String, allow only two values: `per_room` or `per_person`.\
Field is optional, be default system set `per_room` value.\
Note: Sell mode for Rate Plan.\
Per Room Rate Plan mean price is equal to any count of allowed guests. Price for 1 Guest will be same with price for 2 Guests.\
Per Person Rate Plan used to create Rate Plans where price is calculated based at Guests count.

**rate\_mode `[optional]`**

String, allows only the next values: `manual`, `derived`, `auto`, `cascade`.\
Field is optional, by default the system will set to `manual`.\
Note: Rate Mode field represent how to calculate rate for current Rate Plan. At Channex.io we have 4 possible ways to do that:\
**Manual** - price is specified at options.rate field.\
**Derived** - price derived from parent\_rate\_plan for primary occupancy option.\
**Cascade** - price derived from parent\_rate\_plan for each occupancy option.\
**Auto** - price calculated automatically based at price for primary occupancy option and auto\_rate\_settings.\
Read more about Rate Modes and Derived options at our Rate Plan Section.

**meal\_type `[optional]`**

String, allow only the next values:

* `none`,
* `all_inclusive`,
* `breakfast`,
* `lunch`,
* `dinner`,
* `american`,
* `bed_and_breakfast`,
* `buffet_breakfast`,
* `carribean_breakfast`,
* `continental_breakfast`,
* `english_breakfast`,
* `european_plan`,
* `family_plan`,
* `full_board`,
* `full_breakfast`,
* `half_board`,
* `room_only`,
* `self_catering`,
* `bermuda`,
* `dinner_bed_and_breakfast_plan`,
* `family_american`,
* `breakfast_and_lunch`,
* `lunch_and_dinner`

**auto\_rate\_settings `[optional]`**

Object with Auto Rate Settings structure.\
Field is optional generally, but required if `rate_mode` equal to `auto`.\
This object contain information how to increase or decrease rate options from primary occupancy option.

**inherit\_rate `[optional]`**

Boolean value.\
Field is optional. By default equal to false if `parent_rate_plan_id` is empty, true if `parent_rate_plan_id` is present.\
Allow Rate Plan derive `rate` from Parent Rate Plan. When Parent Rate Plan is changed, Rate Plan will be automatically updated.

**inherit\_closed\_to\_arrival `[optional]`**

Boolean value.\
Field is optional. By default equal to false if `parent_rate_plan_id` is empty, true if `parent_rate_plan_id` is present.\
Allow Rate Plan derive `closed_to_arrival` from Parent Rate Plan. When Parent Rate Plan is changed, Rate Plan will be automatically updated.

**inherit\_closed\_to\_departure `[optional]`**

Boolean value.\
Field is optional. By default equal to false if `parent_rate_plan_id` is empty, true if `parent_rate_plan_id` is present.\
Allow Rate Plan derive `closed_to_departure` from Parent Rate Plan. When Parent Rate Plan is changed, Rate Plan will be automatically updated.

**inherit\_stop\_sell `[optional]`**

Boolean value.\
Field is optional. By default equal to false if `parent_rate_plan_id` is empty, true if `parent_rate_plan_id` is present.\
Allow Rate Plan derive `stop_sell` from Parent Rate Plan. When Parent Rate Plan is changed, Rate Plan will be automatically updated.

**inherit\_min\_stay\_arrival `[optional]`**

Boolean value.\
Field is optional. By default equal to false if `parent_rate_plan_id` is empty, true if `parent_rate_plan_id` is present.\
Allow Rate Plan derive `min_stay_arrival` from Parent Rate Plan. When Parent Rate Plan is changed, Rate Plan will be automatically updated.

**inherit\_min\_stay\_through `[optional]`**

Boolean value.\
Field is optional. By default equal to false if `parent_rate_plan_id` is empty, true if `parent_rate_plan_id` is present.\
Allow Rate Plan derive `min_stay_through` from Parent Rate Plan. When Parent Rate Plan is changed, Rate Plan will be automatically updated.

**inherit\_max\_stay `[optional]`**

Boolean value.\
Field is optional. By default equal to false if `parent_rate_plan_id` is empty, true if `parent_rate_plan_id` is present.\
Allow Rate Plan derive `max_stay` from Parent Rate Plan. When Parent Rate Plan is changed, Rate Plan will be automatically updated.

**inherit\_max\_sell `[optional]`**

Boolean value.\
Field is optional. By default equal to false if `parent_rate_plan_id` is empty, true if `parent_rate_plan_id` is present.\
Allow Rate Plan derive `max_sell` from Parent Rate Plan. When Parent Rate Plan is changed, Rate Plan will be automatically updated.

**inherit\_max\_availability `[optional]`**

Boolean value.\
Field is optional. By default equal to false if `parent_rate_plan_id` is empty, true if `parent_rate_plan_id` is present.\
Allow Rate Plan derive `max_availability` from Parent Rate Plan. When Parent Rate Plan is changed, Rate Plan will be automatically updated.

**inherit\_availability\_offset `[optional]`**

Boolean value.\
Field is optional. By default equal to false if `parent_rate_plan_id` is empty, true if `parent_rate_plan_id` is present.\
Allow Rate Plan derive `availability_offset` from Parent Rate Plan. When Parent Rate Plan is changed, Rate Plan will be automatically updated.

**children\_fee `[optional]`**

String or non-negative integer value.\
Represent additional fee which should be added to normal price if guest is Children, based at Hotel Age Policy.

**infant\_fee `[optional]`**

String or non-negative integer value.\
Represent additional fee which should be added to normal price if guest is Infant, based at Hotel Age Policy.

**max\_stay `[optional]`**

Positive Integer or Array of 7 Positive Integers.\
Represent default values for Max Stay restriction. This value will be applied to created Rate Plan and for each new date what will be added in state.\
You can pass single value (for any day) or specify specific default value for each weekday by passing Array with 7 elements.

**min\_stay\_arrival `[optional]`**

Positive Integer or Array of 7 Positive Integers.\
Represent default values for Min Stay Arrival restriction. This value will be applied to created Rate Plan and for each new date what will be added in state.\
You can pass single value (for any day) or specify specific default value for each weekday by passing Array with 7 elements.

**min\_stay\_through `[optional]`**

Positive Integer or Array of 7 Positive Integers.\
Represent default values for Min Stay Through restriction. This value will be applied to created Rate Plan and for each new date what will be added in state.\
You can pass single value (for any day) or specify specific default value for each weekday by passing Array with 7 elements.

**closed\_to\_arrival `[optional]`**

Boolean or Array of 7 Booleans.\
Represent default values for Closed To Arrival restriction. This value will be applied to created Rate Plan and for each new date what will be added in state.\
You can pass single value (for any day) or specify specific default value for each weekday by passing Array with 7 elements.

**closed\_to\_departure `[optional]`**

Boolean or Array of 7 Booleans.\
Represent default values for Closed To Departure restriction. This value will be applied to created Rate Plan and for each new date what will be added in state.\
You can pass single value (for any day) or specify specific default value for each weekday by passing Array with 7 elements.

**stop\_sell `[optional]`**

Boolean or Array of 7 Booleans.\
Represent default values for Stop Sell restriction. This value will be applied to created Rate Plan and for each new date what will be added in state.\
You can pass single value (for any day) or specify specific default value for each weekday by passing Array with 7 elements.

### Occupancy Options

Occupancy options is an entity chained with a Rate Plan and represents prices for different count of guests. If you create Per Room Rate Plan you should pass Occupancy Option for maximum occupancy. For Per Person Rate Plan you should pass Occupancy Option for each possible count of adult guests.

Each Occupancy Option should have next fields:

**occupancy `[required]`**

Any positive integer value.\
Count of guests allowed for current Occupancy Option

**is\_primary `[required]`**

Boolean value.\
Marker to show main Occupancy Option. Actual for derived options, because Main Option will be used as base point for calculations.

**derived\_option `[optional]`**

Valid Derived Options Object.\
This field represent rules to derive and modify parent values for current rate occupancy option.

**rate `[optional]`**

Any positive integer value.\
This field represent default Rate value what will be applied to each date for new Rate Plan and for each date which is came into state after "UpdateDate" task when Channex open new future date.

### Derived Options

Derived Options is rules to modify a value from Parent Rate Plan or Primary Occupancy Option.\
This field represented as Object and has next structure:

```javascript
{
  "rate": [["increase_by_amount", "10"]]
}
```

Usually this object contain information about Rate modification, but you can modify Min Stay Arrival, Availability Offset and other values.

Object should contain key of modified restriction and array of arrays with modification rules. Each modification rule should be represented as 2 items length Array, where first item is modification rule, second item is modification argument. Each modification rule applied to original value step-by-step, from left side to right.

**Modification rules**

`increase_by_amount` Add provided amount to original price.\
`increase_by_percent` Increase original value by provided percent value. Applicable only for Rate restriction.\
`decrease_by_amount` Decrease original value by provided amount.\
`decrease_by_percent` Decrease original value by provided percent value. Applicable only for Rate restriction.

**Example:**

```javascript
{
  "rate": [["increase_by_percent", "5.00"], ["increase_by_amount", "12.00"]]
}
```

In that example we are take original value, 100 $ as example, then add 5% and then add 12.00$ and receive 117$ as result value.

```
100.00$ + 5% -> 105.00$
105$ + 12.00 -> 117.00$
```

You are not limited at count of modification rules.

### Returns

**Success**\
Method can return a Success result with `201 Created` HTTP Code if operation is successful. Will contain a Rate Plan object in the answer.

**Unauthorised Error**\
Method can return a Unauthorised Error result with `401 Unauthorized` HTTP Code if wrong API Key provided.

**Validation Error**\
Method can return a Validation Error result with `422 Unprocessable Entity` HTTP Code if any validation rule is failed.

### Examples

{% tabs %}
{% tab title="Per Room Manual" %}

```javascript
{
  "rate_plan": {
    "title": "Best Available Rate",
    "property_id": "716305c4-561a-4561-a187-7f5b8aeb5920",
    "room_type_id": "994d1375-dbbd-4072-8724-b2ab32ce781b",
    "parent_rate_plan_id": null,
    "children_fee": "0.00",
    "infant_fee": "0.00",
    "max_stay": [0, 0, 0, 0, 0, 0, 0],
    "min_stay_arrival": [1, 1, 1, 1, 1, 1, 1],
    "min_stay_through": [1, 1, 1, 1, 1, 1, 1],
    "closed_to_arrival": [false, false, false, false, false, false, false],
    "closed_to_departure": [false, false, false, false, false, false, false],
    "stop_sell": [false, false, false, false, false, false, false],
    "options": [
      {
        "occupancy": 3,
        "is_primary": true,
        "rate": 0
      }
    ],
    "currency": "GBP",
    "sell_mode": "per_room",
    "rate_mode": "manual",
    "inherit_rate": false,
    "inherit_closed_to_arrival": false,
    "inherit_closed_to_departure": false,
    "inherit_stop_sell": false,
    "inherit_min_stay_arrival": false,
    "inherit_min_stay_through": false,
    "inherit_max_stay": false,
    "inherit_max_sell": false,
    "inherit_max_availability": false,
    "inherit_availability_offset": false,
    "auto_rate_settings": null
  }
}
```

{% endtab %}

{% tab title="Per Person Manual" %}

```json
{
  "rate_plan": {
    "title": "Best Available Rate",
    "property_id": "716305c4-561a-4561-a187-7f5b8aeb5920",
    "room_type_id": "994d1375-dbbd-4072-8724-b2ab32ce781b",
    "parent_rate_plan_id": null,
    "children_fee": "0.00",
    "infant_fee": "0.00",
    "max_stay": [0, 0, 0, 0, 0, 0, 0],
    "min_stay_arrival": [1, 1, 1, 1, 1, 1, 1],
    "min_stay_through": [1, 1, 1, 1, 1, 1, 1],
    "closed_to_arrival": [false, false, false, false, false, false, false],
    "closed_to_departure": [false, false, false, false, false, false, false],
    "stop_sell": [false, false, false, false, false, false, false],
    "options": [
      {
        "occupancy": 1,
        "is_primary": false,
        "rate": 0
      },
      {
        "occupancy": 2,
        "is_primary": false,
        "rate": 0
      },
      {
        "occupancy": 3,
        "is_primary": true,
        "rate": 0
      }
    ],
    "currency": "GBP",
    "sell_mode": "per_person",
    "rate_mode": "manual",
    "inherit_rate": false,
    "inherit_closed_to_arrival": false,
    "inherit_closed_to_departure": false,
    "inherit_stop_sell": false,
    "inherit_min_stay_arrival": false,
    "inherit_min_stay_through": false,
    "inherit_max_stay": false,
    "inherit_max_sell": false,
    "inherit_max_availability": false,
    "inherit_availability_offset": false,
    "auto_rate_settings": null
  }
}
```

{% endtab %}

{% tab title="Per Person Derived" %}

```json
{
  "rate_plan": {
    "title": "Best Available Rate",
    "property_id": "716305c4-561a-4561-a187-7f5b8aeb5920",
    "room_type_id": "994d1375-dbbd-4072-8724-b2ab32ce781b",
    "parent_rate_plan_id": "bab451e7-9ab1-4cc4-aa16-107bf7bbabb2",
    "children_fee": "0.00",
    "infant_fee": "0.00",
    "max_stay": [0, 0, 0, 0, 0, 0, 0],
    "min_stay_arrival": [1, 1, 1, 1, 1, 1, 1],
    "min_stay_through": [1, 1, 1, 1, 1, 1, 1],
    "closed_to_arrival": [false, false, false, false, false, false, false],
    "closed_to_departure": [false, false, false, false, false, false, false],
    "stop_sell": [false, false, false, false, false, false, false],
    "options": [
      {
        "occupancy": 1,
        "is_primary": true,
        "rate": 0
      },
      {
        "occupancy": 2,
        "is_primary": false,
        "derived_option": { "rate": [["increase_by_percent", "10"]] },
        "rate": 0
      },
      {
        "occupancy": 3,
        "is_primary": false,
        "derived_option": { "rate": [["increase_by_percent", "20"]] },
        "rate": 0
      }
    ],
    "currency": "GBP",
    "sell_mode": "per_person",
    "rate_mode": "derived",
    "inherit_rate": false,
    "inherit_closed_to_arrival": false,
    "inherit_closed_to_departure": false,
    "inherit_stop_sell": false,
    "inherit_min_stay_arrival": false,
    "inherit_min_stay_through": false,
    "inherit_max_stay": false,
    "inherit_max_sell": false,
    "inherit_max_availability": false,
    "inherit_availability_offset": false,
    "auto_rate_settings": null
  }
}
```

{% endtab %}
{% endtabs %}

## Update Rate Plan

Update a Rate Plan.

{% tabs %}
{% tab title="Request" %}
Request:

```
PUT https://staging.channex.io/api/v1/rate_plans/:id
```

Query body (JSON):

```javascript
{
  "rate_plan": {
    "title": "Best Available Rate",
    "property_id": "716305c4-561a-4561-a187-7f5b8aeb5920",
    "room_type_id": "994d1375-dbbd-4072-8724-b2ab32ce781b",
    "tax_set_id": "4adfa81f-af0a-4b39-834f-1336ab065c08",
    "parent_rate_plan_id": null,
    "children_fee": "0.00",
    "infant_fee": "0.00",
    "max_stay": [0, 0, 0, 0, 0, 0, 0],
    "min_stay_arrival": [1, 1, 1, 1, 1, 1, 1],
    "min_stay_through": [1, 1, 1, 1, 1, 1, 1],
    "closed_to_arrival": [false, false, false, false, false, false, false],
    "closed_to_departure": [false, false, false, false, false, false, false],
    "stop_sell": [false, false, false, false, false, false, false],
    "options": [
      {
        "occupancy": 3,
        "is_primary": true,
        "rate": 0
      }
    ],
    "currency": "GBP",
    "sell_mode": "per_room",
    "rate_mode": "manual",
    "inherit_rate": false,
    "inherit_closed_to_arrival": false,
    "inherit_closed_to_departure": false,
    "inherit_stop_sell": false,
    "inherit_min_stay_arrival": false,
    "inherit_min_stay_through": false,
    "inherit_max_stay": false,
    "inherit_max_sell": false,
    "inherit_max_availability": false,
    "inherit_availability_offset": false,
    "auto_rate_settings": null
  }
}
```

{% endtab %}

{% tab title="Success Response" %}
**Success Response Example**

Status Code: `200 OK`

```javascript
{
  "data": {
    "type": "rate_plan",
    "id": "bab451e7-9ab1-4cc4-aa16-107bf7bbabb2",
    "attributes": {
      "id": "bab451e7-9ab1-4cc4-aa16-107bf7bbabb2",
      "title": "Best Available Rate",
      "sell_mode": "per_room",
      "rate_mode": "manual",
      "currency": "GBP",
      "children_fee": "0.00",
      "infant_fee": "0.00",
      "options": [
        {
          "occupancy": 3,
          "is_primary": true,
          "derived_option": null,
          "rate": 0
        }
      ],
      "inherit_rate": false,
      "inherit_closed_to_arrival": false,
      "inherit_closed_to_departure": false,
      "inherit_stop_sell": false,
      "inherit_min_stay_arrival": false,
      "inherit_max_stay": false,
      "inherit_availability_offset": false,
      "inherit_max_sell": false,
      "inherit_max_availability": false,
      "auto_rate_settings": null,
      "meal_type": "none"
    },
    "relationships": {
      "room_type": {
        "data": {
          "type": "room_type",
          "id": "994d1375-dbbd-4072-8724-b2ab32ce781b"
        }
      },
      "property": {
        "data": {
          "type": "property",
          "id": "716305c4-561a-4561-a187-7f5b8aeb5920"
        }
      },
      "tax_set": {
        "data": {
          "type": "tax_set",
          "id": "4adfa81f-af0a-4b39-834f-1336ab065c08"
        }
      }
    }
  }
}
```

{% endtab %}

{% tab title="Error Response" %}
**Unauthorised Error Response**

Status Code: `401 Unauthorized`

```javascript
{
  "errors": {
    "code": "unauthorized",
    "title": "Unauthorized"
  }
}
```

**Not Found Error**

Status Code: `404 Not Found`

```javascript
{
  "errors": {
    "code": "resource_not_found",
    "title": "Resource Not Found"
  }
}
```

**Validation Error Response**

Status Code: `422 Unprocessable Entity`

```javascript
{
  "errors": {
    "code": "validation_error",
    "title": "Validation Error",
    "details": {
      "title": [
        "can't be blank"
      ]
    }
  }
}
```

{% endtab %}
{% endtabs %}

### Fields

This method use same fields as Create Rate Plan method.

### Returns

**Success**\
Method can return a Success result with `200 OK` HTTP Code if operation is successful. Will contain a Rate Plan object in the answer.\
\
**Unauthorised Error**\
Method can return a Unauthorised Error result with `401 Unauthorized` HTTP Code if wrong API Key provided.

**Not Found Error**\
Method can return a Not Found Error result with `404 Not Found` HTTP Code if Rate Plan with provided ID is not present at system.

**Validation Error**\
Method can return a Validation Error result with `422 Unprocessable Entity` HTTP Code if any validation rule is failed.

## Remove Rate Plan

Remove a Rate Plan.

{% tabs %}
{% tab title="Request" %}
Request:

```
DELETE https://staging.channex.io/api/v1/rate_plans/:id
```

{% endtab %}

{% tab title="Success Response" %}
**Success Response Example**

Status Code: `200 OK`

```javascript
{
  "meta": {
    "message": "Success"
  }
}
```

{% endtab %}

{% tab title="Error Response" %}
**Unauthorised Error Response**

Status Code: `401 Unauthorized`

```javascript
{
  "errors": {
    "code": "unauthorized",
    "title": "Unauthorized"
  }
}
```

**Not Found Error**

Status Code: `404 Not Found`

```javascript
{
  "errors": {
    "code": "resource_not_found",
    "title": "Resource Not Found"
  }
}
```

{% endtab %}
{% endtabs %}

### Flags

Because system is not allow to remove RatePlan associated with any channel, we expose additional feature flag - force. To remove RatePlan and unmap it from Channel you can use next request:

```
DELETE https://staging.channex.io/api/v1/rate_plans/:id?force=true
```

Please, be careful with that method, once Rate Plan was removed we can't restore it and any channel information.

### Returns

**Success**\
Method can return a Success result with `200 OK` HTTP Code if operation is successful. Will contain a Meta object with message in the answer.

**Unauthorised Error**\
Method can return a Unauthorised Error result with `401 Unauthorized` HTTP Code if wrong API Key provided.

**Not Found Error**\
Method can return a Not Found Error result with `404 Not Found` HTTP Code if Rate Plan with provided ID is not present at system.
