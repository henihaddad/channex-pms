<!-- https://docs.channex.io/api-v.1-documentation/facilities-collection.md -->
> For the complete documentation index, see [llms.txt](https://docs.channex.io/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://docs.channex.io/api-v.1-documentation/facilities-collection.md).

# Facilities Collection

API Methods to work with Facilities

A **Facility** is an entity to represent facilities, amenities, inventory available for Guest coming to your Property.

We have 2 list of facilities - Property Facilities and Room Type Facilities.

Each Facility associated with Facility Category.

Each Property and Room Type can have they own list of Facilities.

Channex provides around 181 default facilities. If you can't find a required facility on our list, please contact us.

## Property Facilities List

Method to get a list of Facilities.

{% tabs %}
{% tab title="Request" %}
Request:

```
GET https://staging.channex.io/api/v1/property_facilities
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
        "id": "4d7cc1cd-d79f-407b-9be4-eb0af95e1bd5",
        "category": "general",
        "title": "Baby safety gates"
      },
      "id": "4d7cc1cd-d79f-407b-9be4-eb0af95e1bd5",
      "type": "facility"
    }
  ],
  "meta": {
    "page": 1,
    "total": 181,
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

By default, this method returns the first 10 elements. To get more details, you should use the [Pagination](https://docs.channex.io/api-v.1-documentation/api-reference#pagination) arguments.\
Information about count of entities and current pagination position contained at `meta` section at response object.

### Returns

**Success**\
Method can return a Success result with `200 OK` HTTP Code if operation is successful. Will contain a list of Facilities objects in the answer.\
\
**Unauthorised Error**\
Method can return a Unauthorised Error result with `401 Unauthorized` HTTP Code if wrong API Key provided.

## Property Facility Options

Method to get list of all facility without additional details and pagination limits.

{% tabs %}
{% tab title="Request" %}
Request:

```
GET https://staging.channex.io/api/v1/property_facilities/options
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
        "id": "4d7cc1cd-d79f-407b-9be4-eb0af95e1bd5",
        "category": "general",
        "title": "Baby safety gates"
      },
      "id": "4d7cc1cd-d79f-407b-9be4-eb0af95e1bd5",
      "type": "facility"
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

## Room Type Facilities List

Method to get a list of Room Type Facilities.

{% tabs %}
{% tab title="Request" %}
Request:

```
GET https://staging.channex.io/api/v1/room_facilities
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
        "id": "4d7cc1cd-d79f-407b-9be4-eb0af95e1bd5",
        "category": "general",
        "title": "Baby safety gates"
      },
      "id": "4d7cc1cd-d79f-407b-9be4-eb0af95e1bd5",
      "type": "facility"
    }
  ],
  "meta": {
    "page": 1,
    "total": 181,
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

By default, this method returns the first 10 elements. To get more details, you should use the [Pagination](https://docs.channex.io/api-v.1-documentation/api-reference#pagination) arguments.\
Information about count of entities and current pagination position contained at `meta` section at response object.

### Returns

**Success**\
Method can return a Success result with `200 OK` HTTP Code if operation is successful. Will contain a list of Facilities objects in the answer.\
\
**Unauthorised Error**\
Method can return a Unauthorised Error result with `401 Unauthorized` HTTP Code if wrong API Key provided.

## Room Type Facility Options

Method to get list of all facility without additional details and pagination limits.

{% tabs %}
{% tab title="Request" %}
Request:

```
GET https://staging.channex.io/api/v1/room_facilities/options
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
        "id": "4d7cc1cd-d79f-407b-9be4-eb0af95e1bd5",
        "category": "general",
        "title": "Baby safety gates"
      },
      "id": "4d7cc1cd-d79f-407b-9be4-eb0af95e1bd5",
      "type": "facility"
    }
  ]
}
```

{% endtab %}
{% endtabs %}
