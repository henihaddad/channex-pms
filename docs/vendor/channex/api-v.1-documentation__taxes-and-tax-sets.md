<!-- https://docs.channex.io/api-v.1-documentation/taxes-and-tax-sets.md -->
> For the complete documentation index, see [llms.txt](https://docs.channex.io/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://docs.channex.io/api-v.1-documentation/taxes-and-tax-sets.md).

# Taxes and Tax Sets

To represent Taxes associated with Property and Rate Plans at Channex.io you can use Taxes and Tax Sets.

### **Taxes**

Entity which represent specific tax applicable to your Rate Plan or Property. Example: VAT 20%, City Tax 1 EUR per Guest per Night or any other.

### Tax Sets

Entity which represent group of Taxes applicable to your Rate Plan or Property.

Each property can have many Tax Sets and Taxes, but only one can be selected as Default Tax Set. Default Tax Set will be applied to each new Rate Plan automatically.

## Taxes List

Retrieve list of Taxes associated with user.

{% tabs %}
{% tab title="Request" %}
Request:

```
GET https://staging.channex.io/api/v1/taxes
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
        "applicable_after": null,
        "applicable_before": null,
        "applicable_date_ranges": [],
        "currency": null,
        "id": "6d30137e-74a1-41f6-aa96-2c0371e94dbf",
        "is_inclusive": true,
        "logic": "percent",
        "max_nights": null,
        "rate": "10.00",
        "skip_nights": null,
        "title": "10% VAT",
        "type": "tax"
      },
      "relationships": {
        "property": {
          "data": {
            "type": "property",
            "id": "716305c4-561a-4561-a187-7f5b8aeb5920"
          }
        }
      },
      "id": "6d30137e-74a1-41f6-aa96-2c0371e94dbf",
      "type": "tax"
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

### Returns

**Success**\
Method can return a Success result with `200 OK` HTTP Code if operation is successful. Will contain a list of Tax objects in the answer.\
\
**Unauthorised Error**\
Method can return a Unauthorised Error result with `401 Unauthorized` HTTP Code if wrong API Key provided.

## Get Tax by ID

Retrieve specific Tax associated with User by ID.

{% tabs %}
{% tab title="Request" %}
Request:

```
GET https://staging.channex.io/api/v1/taxes/:id
```

{% endtab %}

{% tab title="Success Response" %}
**Success Response Example**

Status Code: `200 OK`

```javascript
{
  "data": {
    "attributes": {
      "applicable_after": null,
      "applicable_before": null,
      "applicable_date_ranges": [],
      "currency": null,
      "id": "6d30137e-74a1-41f6-aa96-2c0371e94dbf",
      "is_inclusive": true,
      "logic": "percent",
      "max_nights": null,
      "rate": "10.00",
      "skip_nights": null,
      "title": "10% VAT",
      "type": "tax"
    },
    "relationships": {
      "property": {
        "data": {
          "type": "property",
          "id": "716305c4-561a-4561-a187-7f5b8aeb5920"
        }
      }
    },
    "id": "6d30137e-74a1-41f6-aa96-2c0371e94dbf",
    "type": "tax"
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
Method can return a Success result with `200 OK` HTTP Code if operation is successful. Will contain a Tax object in the answer.\
\
**Unauthorised Error**\
Method can return a Unauthorised Error result with `401 Unauthorized` HTTP Code if wrong API Key provided or User not have access to requested Tax.

**Not Found Error**\
Method can return a Not Found Error result with `404 Not Found` HTTP Code if Tax with provided ID is not present at system.

## Create Tax

Create a new Tax.

{% tabs %}
{% tab title="Request" %}
Request:

```
POST https://staging.channex.io/api/v1/taxes
```

Query body (JSON):

```javascript
{
  "tax": {
    "title": "VAT",
    "logic": "percent",
    "type": "tax",
    "rate": "20.00",
    "is_inclusive": true,
    "property_id": "716305c4-561a-4561-a187-7f5b8aeb5920",
    "skip_nights": 1,
    "max_nights": 10,
    "applicable_date_ranges": [
      {
        "after": "2024-01-01",
        "before": "2024-12-31"
      }
    ]
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
    "attributes": {
      "applicable_after": null,
      "applicable_before": null,
      "applicable_date_ranges": [
        {
          "after": "2024-01-01",
          "before": "2024-12-31"
        }
      ],
      "currency": null,
      "id": "6d30137e-74a1-41f6-aa96-2c0371e94dbf",
      "is_inclusive": true,
      "logic": "percent",
      "max_nights": 10,
      "rate": "20.00",
      "skip_nights": 1,
      "title": "20% VAT",
      "type": "tax"
    },
    "relationships": {
      "property": {
        "data": {
          "type": "property",
          "id": "716305c4-561a-4561-a187-7f5b8aeb5920"
        }
      }
    },
    "id": "6d30137e-74a1-41f6-aa96-2c0371e94dbf",
    "type": "tax"
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

Any non-empty string with maximum length of 255 symbols.\
Note: The Tax will be represented in the system under that title.

**logic `[required]`**

One of possible values: `percent` , `per_room`, `per_room_per_night`, `per_person`, `per_person_per_night`, `per_night`, `per_booking`

**type `[required]`**

One of possible values: `tax`, `fee`, `city_tax`.

**rate `[required]`**

String value with amount applicable to tax. If `logic` is `percent`, can be between 0 and 100 only. At other cases, represent fixed amount of tax.

**currency `[required]`\***

Required only if `logic` is not `percent`. Should be a valid currency code. Represent Tax amount currency.

**is\_inclusive `[required]`**

Boolean value. Represent include tax into room price or should be added atop.

**property\_id `[required]`**

UUID. Relation to associated Property.

**skip\_nights `[optional]`**

Positive Integer value. Represent count of days what should be skipped at tax calculation. Useful for long-stay taxes, which should be applied from 8 day of stay.

**max\_nights `[optional]`**

Positive Integer value. Represent max count of days what should be used as a taxable base for this Tax. Useful for long-stay or short-stay taxes when tax should be applied only for first 7 days of stay.

**applicable\_date\_ranges `[optional]`**

List of applicable date ranges, represented as an object:

```
{
  "after": "2024-01-01",
  "before": "2024-12-31"
}
```

Where `after` and `before` is a valid date at ISO format.

This ranges define a ranges of dates when this tax should be applied. Useful to define periodical City Tax or Touristic Tax which is applicable for High Season. Example: Touristic Tax should be collected from 1 June to 31 August. At other dates this Tax is not applied.

You can define up to 20 date ranges.

Note: API responses always contain `applicable_after`, `applicable_before` and `applicable_date_ranges`. The `applicable_after` / `applicable_before` pair is a legacy representation of a single date range — if you provide them on create or update, `applicable_date_ranges` will be populated with that range automatically. If you provide only `applicable_date_ranges`, the legacy fields stay `null`.

### Returns

**Success**\
Method can return a Success result with `201 Created` HTTP Code if operation is successful. Will contain a Tax object in the answer.

**Unauthorised Error**\
Method can return a Unauthorised Error result with `401 Unauthorized` HTTP Code if wrong API Key provided.

**Validation Error**\
Method can return a Validation Error result with `422 Unprocessable Entity` HTTP Code if any validation rule is failed.

## Update Tax

Update a Tax.

{% tabs %}
{% tab title="Request" %}
Request:

```
PUT https://staging.channex.io/api/v1/taxes/:id
```

Query body (JSON):

```javascript
{
  "tax": {
    "title": "New Tax Title"
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
    "attributes": {
      "applicable_after": null,
      "applicable_before": null,
      "applicable_date_ranges": [],
      "currency": null,
      "id": "6d30137e-74a1-41f6-aa96-2c0371e94dbf",
      "is_inclusive": true,
      "logic": "percent",
      "max_nights": null,
      "rate": "20.00",
      "skip_nights": null,
      "title": "New Tax Title",
      "type": "tax"
    },
    "relationships": {
      "property": {
        "data": {
          "type": "property",
          "id": "716305c4-561a-4561-a187-7f5b8aeb5920"
        }
      }
    },
    "id": "6d30137e-74a1-41f6-aa96-2c0371e94dbf",
    "type": "tax"
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

### Returns

**Success**\
Method can return a Success result with `200 OK` HTTP Code if operation is successful. Will contain a Tax object in the answer.\
\
**Unauthorised Error**\
Method can return a Unauthorised Error result with `401 Unauthorized` HTTP Code if wrong API Key provided.

**Not Found Error**\
Method can return a Not Found Error result with `404 Not Found` HTTP Code if Tax with provided ID is not present at system.

**Validation Error**\
Method can return a Validation Error result with `422 Unprocessable Entity` HTTP Code if any validation rule is failed.

## Remove Tax

Remove a Tax.

{% tabs %}
{% tab title="Request" %}
Request:

```
DELETE https://staging.channex.io/api/v1/taxes/:id
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

### Returns

**Success**\
Method can return a Success result with `200 OK` HTTP Code if operation is successful. Will contain a Meta object with message in the answer.

**Unauthorised Error**\
Method can return a Unauthorised Error result with `401 Unauthorized` HTTP Code if wrong API Key provided.

**Not Found Error**\
Method can return a Not Found Error result with `404 Not Found` HTTP Code if Tax with provided ID is not present at system.

## Tax Sets List

Retrieve list of Tax Sets associated with user.

{% tabs %}
{% tab title="Request" %}
Request:

```
GET https://staging.channex.io/api/v1/tax_sets
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
        "currency": "USD",
        "id": "b70b756d-0b81-431d-a35c-f3dee28a00a7",
        "taxes": [
          {
            "applicable_after": null,
            "applicable_before": null,
            "applicable_date_ranges": [],
            "currency": null,
            "id": "c1fb94b3-ce95-4233-be0e-2748b3728715",
            "is_inclusive": true,
            "logic": "percent",
            "max_nights": null,
            "rate": "10.00",
            "skip_nights": null,
            "taxes": [],
            "title": "10% IVA",
            "type": "tax"
          },
          {
            "applicable_after": null,
            "applicable_before": null,
            "applicable_date_ranges": [],
            "currency": null,
            "id": "a3c4f3c8-841c-4492-b5ff-ce9ca92c1c83",
            "is_inclusive": false,
            "logic": "percent",
            "max_nights": null,
            "rate": "3.00",
            "skip_nights": null,
            "taxes": [],
            "title": "3% TBID",
            "type": "tax"
          }
        ],
        "title": "Tax Set Title"
      },
      "relationships": {
        "property": {
          "data": {
            "type": "property",
            "id": "716305c4-561a-4561-a187-7f5b8aeb5920"
          }
        }
      },
      "id": "b70b756d-0b81-431d-a35c-f3dee28a00a7",
      "type": "tax_set"
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

### Returns

**Success**\
Method can return a Success result with `200 OK` HTTP Code if operation is successful. Will contain a list of Tax Set objects in the answer.\
\
**Unauthorised Error**\
Method can return a Unauthorised Error result with `401 Unauthorized` HTTP Code if wrong API Key provided.

## Get Tax Set by ID

Retrieve specific Tax Set associated with User by ID.

{% tabs %}
{% tab title="Request" %}
Request:

```
GET https://staging.channex.io/api/v1/tax_sets/:id
```

{% endtab %}

{% tab title="Success Response" %}
**Success Response Example**

Status Code: `200 OK`

```javascript
{
  "data": {
    "attributes": {
      "currency": "USD",
      "id": "b70b756d-0b81-431d-a35c-f3dee28a00a7",
      "associated_rate_plan_ids": ["77229f71-8c8f-4d79-92ed-749002407267"],
      "taxes": [
        {
          "applicable_after": null,
          "applicable_before": null,
          "applicable_date_ranges": [],
          "currency": null,
          "id": "c1fb94b3-ce95-4233-be0e-2748b3728715",
          "is_inclusive": true,
          "logic": "percent",
          "max_nights": null,
          "rate": "10.00",
          "skip_nights": null,
          "taxes": [],
          "title": "10% IVA",
          "type": "tax",
          "level": 0
        },
        {
          "applicable_after": null,
          "applicable_before": null,
          "applicable_date_ranges": [],
          "currency": null,
          "id": "a3c4f3c8-841c-4492-b5ff-ce9ca92c1c83",
          "is_inclusive": false,
          "logic": "percent",
          "max_nights": null,
          "rate": "3.00",
          "skip_nights": null,
          "taxes": [],
          "title": "3% TBID",
          "type": "tax",
          "level": 0
        }
      ],
      "title": "Tax Set Title"
    },
    "relationships": {
      "property": {
        "data": {
          "type": "property",
          "id": "716305c4-561a-4561-a187-7f5b8aeb5920"
        }
      }
    },
    "id": "b70b756d-0b81-431d-a35c-f3dee28a00a7",
    "type": "tax_set"
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
Method can return a Success result with `200 OK` HTTP Code if operation is successful. Will contain a Tax Set object in the answer.\
\
**Unauthorised Error**\
Method can return a Unauthorised Error result with `401 Unauthorized` HTTP Code if wrong API Key provided or User not have access to requested Tax Set.

**Not Found Error**\
Method can return a Not Found Error result with `404 Not Found` HTTP Code if Tax Set with provided ID is not present at system.

## Create Tax Set

Create a new Tax Set.

{% tabs %}
{% tab title="Request" %}
Request:

```
POST https://staging.channex.io/api/v1/tax_sets
```

Query body (JSON):

```javascript
{
  "tax_set": {
    "title": "Tax Set Title",
    "property_id": "716305c4-561a-4561-a187-7f5b8aeb5920",
    "associated_rate_plan_ids": ["77229f71-8c8f-4d79-92ed-749002407267"],
    "taxes": [
      {
        "id": "c1fb94b3-ce95-4233-be0e-2748b3728715",
        "level": 0
      },
      {
        "id": "a3c4f3c8-841c-4492-b5ff-ce9ca92c1c83",
        "level": 0
      }
    ],
    "currency": "USD"
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
    "attributes": {
      "currency": "USD",
      "id": "b70b756d-0b81-431d-a35c-f3dee28a00a7",
      "associated_rate_plan_ids": ["77229f71-8c8f-4d79-92ed-749002407267"],
      "taxes": [
        {
          "applicable_after": null,
          "applicable_before": null,
          "applicable_date_ranges": [],
          "currency": null,
          "id": "c1fb94b3-ce95-4233-be0e-2748b3728715",
          "is_inclusive": true,
          "logic": "percent",
          "max_nights": null,
          "rate": "10.00",
          "skip_nights": null,
          "taxes": [],
          "title": "10% IVA",
          "type": "tax",
          "level": 0
        },
        {
          "applicable_after": null,
          "applicable_before": null,
          "applicable_date_ranges": [],
          "currency": null,
          "id": "a3c4f3c8-841c-4492-b5ff-ce9ca92c1c83",
          "is_inclusive": false,
          "logic": "percent",
          "max_nights": null,
          "rate": "3.00",
          "skip_nights": null,
          "taxes": [],
          "title": "3% TBID",
          "type": "tax",
          "level": 0
        }
      ],
      "title": "Tax Set Title"
    },
    "relationships": {
      "property": {
        "data": {
          "type": "property",
          "id": "716305c4-561a-4561-a187-7f5b8aeb5920"
        }
      }
    },
    "id": "b70b756d-0b81-431d-a35c-f3dee28a00a7",
    "type": "tax_set"
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

Any non-empty string with maximum length of 255 symbols.\
Note: The Tax Set will be represented in the system under that title.

**property\_id `[required]`**

UUID of Property which is associated with Tax Set.\
Note: If it is first `Tax Set` for `Property`, it will be automatically installed as `default_tax_set` for this property.

**currency `[required]`\***

String. Should be a valid currency code. Represent Tax Set currency.

**taxes `[required]`**

List of object with associated taxes IDs. Can contain another taxes inside.

{% hint style="info" %}
Taxes in the request should look like:

```json
{
  "id": "c1fb94b3-ce95-4233-be0e-2748b3728715" // TAX UUID
}
```

However, if one tax needs to be calculated **after** another, you can use the `level` field to define the calculation order:

```json
{
  "id": "c1fb94b3-ce95-4233-be0e-2748b3728715", // TAX UUID
  "level": 0
}
```

**Example:**\
Assume you have a **Cleaning Fee** of $10.00 per night and **VAT** of 20%. VAT should be calculated **on top of** the Cleaning Fee.

```
Night Price:      100.00 USD  
Cleaning Fee:     10.00 USD  
VAT (20%):        20% of 100.00 + 20% of 10.00 = 22.00 USD  
```

To achieve this, you define the order using the `level` field.\
In this example, you'll use two levels: `level 1` for the Cleaning Fee and `level 0` for VAT.

Our calculation logic processes taxes from the **deepest level (highest number)** to the **top level (lowest number)**.\
So we first calculate **level 1**, then calculate **level 0** based on:

```
Night Price + all amounts from level 1
```

**Final request example:**

```json
[
    {
        "id": "c1fb94b3-ce95-4233-be0e-2748b3728715", // Cleaning Fee
        "level": 1
    },
    {
        "id": "a3c4f3c8-841c-4492-b5ff-ce9ca92c1c83", // VAT 20%
        "level": 0
    }
]
```

{% endhint %}

**associated\_rate\_plan\_ids `[optional]`**

List of Strings which represent Rate Plan UUID which should be associated with created / updated Tax Set.

### Returns

**Success**\
Method can return a Success result with `201 Created` HTTP Code if operation is successful. Will contain a Tax Set object in the answer.

**Unauthorised Error**\
Method can return a Unauthorised Error result with `401 Unauthorized` HTTP Code if wrong API Key provided.

**Validation Error**\
Method can return a Validation Error result with `422 Unprocessable Entity` HTTP Code if any validation rule is failed.

## Update Tax Set

Update a Tax Set.

{% tabs %}
{% tab title="Request" %}
Request:

```
PUT https://staging.channex.io/api/v1/tax_sets/:id
```

Query body (JSON):

```javascript
{
  "tax_set": {
    "title": "New Tax Set Title",
    "associated_rate_plan_ids": ["77229f71-8c8f-4d79-92ed-749002407267"]
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
    "attributes": {
      "currency": "USD",
      "id": "b70b756d-0b81-431d-a35c-f3dee28a00a7",
      "associated_rate_plan_ids": ["77229f71-8c8f-4d79-92ed-749002407267"],
      "taxes": [
        {
          "applicable_after": null,
          "applicable_before": null,
          "applicable_date_ranges": [],
          "currency": null,
          "id": "c1fb94b3-ce95-4233-be0e-2748b3728715",
          "is_inclusive": true,
          "logic": "percent",
          "max_nights": null,
          "rate": "10.00",
          "skip_nights": null,
          "taxes": [],
          "title": "10% IVA",
          "type": "tax",
          "level": 0
        },
        {
          "applicable_after": null,
          "applicable_before": null,
          "applicable_date_ranges": [],
          "currency": null,
          "id": "a3c4f3c8-841c-4492-b5ff-ce9ca92c1c83",
          "is_inclusive": false,
          "logic": "percent",
          "max_nights": null,
          "rate": "3.00",
          "skip_nights": null,
          "taxes": [],
          "title": "3% TBID",
          "type": "tax",
          "level": 0
        }
      ],
      "title": "New Tax Set Title"
    },
    "relationships": {
      "property": {
        "data": {
          "type": "property",
          "id": "716305c4-561a-4561-a187-7f5b8aeb5920"
        }
      }
    },
    "id": "b70b756d-0b81-431d-a35c-f3dee28a00a7",
    "type": "tax_set"
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

### Returns

**Success**\
Method can return a Success result with `200 OK` HTTP Code if operation is successful. Will contain a Tax Set object in the answer.\
\
**Unauthorised Error**\
Method can return a Unauthorised Error result with `401 Unauthorized` HTTP Code if wrong API Key provided.

**Not Found Error**\
Method can return a Not Found Error result with `404 Not Found` HTTP Code if Tax Set with provided ID is not present at system.

**Validation Error**\
Method can return a Validation Error result with `422 Unprocessable Entity` HTTP Code if any validation rule is failed.

## Remove Tax Set

Remove a Tax Set.

{% tabs %}
{% tab title="Request" %}
Request:

```
DELETE https://staging.channex.io/api/v1/tax_sets/:id
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

### Returns

**Success**\
Method can return a Success result with `200 OK` HTTP Code if operation is successful. Will contain a Meta object with message in the answer.

**Unauthorised Error**\
Method can return a Unauthorised Error result with `401 Unauthorized` HTTP Code if wrong API Key provided.

**Not Found Error**\
Method can return a Not Found Error result with `404 Not Found` HTTP Code if Tax Set with provided ID is not present at system.
