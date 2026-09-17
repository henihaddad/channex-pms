<!-- https://docs.channex.io/api-v.1-documentation/property-users-collection.md -->
> For the complete documentation index, see [llms.txt](https://docs.channex.io/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://docs.channex.io/api-v.1-documentation/property-users-collection.md).

# Property Users Collection

API methods to work with Property Users

**Property User** is an association between a Property and an User, who can manage a property and with which role and access rights.

## Property Users List

Retrieve a list of Property Users associated with a Property.

{% tabs %}
{% tab title="Request" %}
Request:

```
GET https://staging.channex.io/api/v1/property_users?filter[property_id]=PROPERTY_ID
```

{% endtab %}

{% tab title="Success Response" %}
**Success Response Example**

Status Code: `200 OK`

```javascript
{
  "data": [
    {
      "id": "776533f2-c10e-49d8-bddc-14b3e27c2a00",
      "type": "property_user",
      "attributes": {
        "id": "776533f2-c10e-49d8-bddc-14b3e27c2a00",
        "overrides": null,
        "property_id": "52397a6e-c330-44f4-a293-47042d3a3607",
        "role": "owner",
        "user_id": "c9cfa184-5095-4ef2-bbe2-e723ffb49184"
      },
      "relationships": {
        "property": {
          "data": {
            "id": "52397a6e-c330-44f4-a293-47042d3a3607",
            "type": "property"
          }
        },
        "user": {
          "data": {
            "id": "c9cfa184-5095-4ef2-bbe2-e723ffb49184",
            "type": "user",
            "email": "user@channex.io",
            "name": "Channex User"
          }
        }
      }
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
Method can return a Success result with `200 OK` HTTP Code if operation is successful. Will contain a list of Property User objects in the answer.\
\
**Unauthorised Error**\
Method can return a Unauthorised Error result with `401 Unauthorized` HTTP Code if wrong API Key provided.

## Invite User to Property

Create new Property User.

{% tabs %}
{% tab title="Request" %}
Request:

```
POST https://staging.channex.io/api/v1/property_users
```

Query body (JSON):

```javascript
{
  "invite": {
    "property_id": "52397a6e-c330-44f4-a293-47042d3a3607",
    "user_email": "other_user@channex.io",
    "role": "user",
    "overrides": {}
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
    "id": "776533f2-c10e-49d8-bddc-14b3e27c2a00",
    "type": "property_user",
    "attributes": {
      "id": "776533f2-c10e-49d8-bddc-14b3e27c2a00",
      "overrides": null,
      "property_id": "52397a6e-c330-44f4-a293-47042d3a3607",
      "role": "user",
      "user_id": "c9cfa184-5095-4ef2-bbe2-e723ffb49184"
    },
    "relationships": {
      "property": {
        "data": {
          "id": "52397a6e-c330-44f4-a293-47042d3a3607",
          "type": "property"
        }
      },
      "user": {
        "data": {
          "id": "c9cfa184-5095-4ef2-bbe2-e723ffb49184",
          "type": "user",
          "email": "user@channex.io",
          "name": "Channex User"
        }
      }
    }
  }
}
```

{% endtab %}

{% tab title="Error Response" %}
**Bad Request Error Response**

Status Code: `400 Bad Request`

```javascript
{
  "errors": {
    "code": "bad_request",
    "title": "Bad Request",
    "details": "User already invited"
  }
}
```

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

**Forbidden Error Response**

Status Code: `403 Forbidden`

```javascript
{
  "errors": {
    "code": "forbidden",
    "title": "Forbidden"
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
      "user_email": [
        "can't be blank"
      ]
    }
  }
}
```

{% endtab %}
{% endtabs %}

### Fields

**property\_id `[required]`**

String with valid UUID for Property object what you would use as target for invitation.

**user\_email `[required]`**

String with a valid email address of invited user.\
Note: If user is not registered at our system, we are create they account automatically and send email with instructions to on-board into channex.io.

**role `[required]`**

String with a valid role name.\
Right now you can use 2 roles - `owner` and `user`.

**overrides `[optional]`**

JSON Object with access policies overrides.

### Returns

**Success**\
Method can return a Success result with `201 Created` HTTP Code if operation is successful. Will contain a Property User object in the answer.\
\
**Bad Request Error**\
Method can return a Bad Request Error result with `400 Bad Request` HTTP Code if provided user already invited.\
\
**Unauthorised Error**\
Method can return a Unauthorised Error result with `401 Unauthorized` HTTP Code if wrong API Key provided.\
\
**Forbidden Error**\
Method can return a Forbidden Error result with `403 Forbidden` HTTP Code if current user not have permissions to invite user into provided property.

**Validation Error**\
Method can return a Validation Error result with `422 Unprocessable Entity` HTTP Code if any validation rule is failed.

## Get Property User by ID

Retrieve Property User by ID.

{% tabs %}
{% tab title="Request" %}
Request:

```
GET https://staging.channex.io/api/v1/property_users/:id
```

{% endtab %}

{% tab title="Success Response" %}
**Success Response Example**

Status Code: `200 OK`

```javascript
{
  "data": {
    "id": "776533f2-c10e-49d8-bddc-14b3e27c2a00",
    "type": "property_user",
    "attributes": {
      "id": "776533f2-c10e-49d8-bddc-14b3e27c2a00",
      "overrides": null,
      "property_id": "52397a6e-c330-44f4-a293-47042d3a3607",
      "role": "owner",
      "user_id": "c9cfa184-5095-4ef2-bbe2-e723ffb49184"
    },
    "relationships": {
      "property": {
        "data": {
          "id": "52397a6e-c330-44f4-a293-47042d3a3607",
          "type": "property"
        }
      },
      "user": {
        "data": {
          "id": "c9cfa184-5095-4ef2-bbe2-e723ffb49184",
          "type": "user",
          "email": "user@channex.io",
          "name": "Channex User"
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

**Forbidden Error Response**

Status Code: `403 Forbidden`

```javascript
{
  "errors": {
    "code": "forbidden",
    "title": "Forbidden"
  }
}
```

{% endtab %}
{% endtabs %}

### Returns

**Success**\
Method can return a Success result with `200 OK` HTTP Code if operation is successful. Will contain a Property User object in the answer.\
\
**Unauthorised Error**\
Method can return a Unauthorised Error result with `401 Unauthorized` HTTP Code if wrong API Key provided.\
\
**Forbidden Error**\
Method can return a Forbidden Error result with `403 Forbidden` HTTP Code if current user not have permissions to call this action.

## Update Property User

Update property access information.

{% tabs %}
{% tab title="Request" %}
Request:

```
PUT https://staging.channex.io/api/v1/property_users/:id
```

Query body (JSON):

```javascript
{
  "property_user": {
    "role": "user",
    "overrides": null
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
    "id": "776533f2-c10e-49d8-bddc-14b3e27c2a00",
    "type": "property_user",
    "attributes": {
      "id": "776533f2-c10e-49d8-bddc-14b3e27c2a00",
      "overrides": null,
      "property_id": "52397a6e-c330-44f4-a293-47042d3a3607",
      "role": "user",
      "user_id": "c9cfa184-5095-4ef2-bbe2-e723ffb49184"
    },
    "relationships": {
      "property": {
        "data": {
          "id": "52397a6e-c330-44f4-a293-47042d3a3607",
          "type": "property"
        }
      },
      "user": {
        "data": {
          "id": "c9cfa184-5095-4ef2-bbe2-e723ffb49184",
          "type": "user",
          "email": "user@channex.io",
          "name": "Channex User"
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

**Forbidden Error Response**

Status Code: `403 Forbidden`

```javascript
{
  "errors": {
    "code": "forbidden",
    "title": "Forbidden"
  }
}
```

**Resource Not Found Error Response**

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
      "role": [
        "can't be blank"
      ]
    }
  }
}
```

{% endtab %}
{% endtabs %}

### Fields

Through this method you can update only two fields - role and overrides. Please see [Invite User to Property](#invite-user-to-property) for more detailed information.

### Returns

**Success**\
Method can return a Success result with `200 OK` HTTP Code if operation is successful. Will contain a Property User object in the answer.\
\
**Unauthorised Error**\
Method can return a Unauthorised Error result with `401 Unauthorized` HTTP Code if wrong API Key provided.\
\
**Forbidden Error**\
Method can return a Forbidden Error result with `403 Forbidden` HTTP Code if current user not have permissions to call this action.\
\
**Resource Not Found Error**\
Method can return a Resource Not Found Error result with `404 Not Found` HTTP Code if requested Property User is not defined.

**Validation Error**\
Method can return a Validation Error result with `422 Unprocessable Entity` HTTP Code if any validation rule is failed.

## Withdraw Property User Access

Revoke Property User access to a specific property.

{% tabs %}
{% tab title="Request" %}
Request:

```
DELETE https://staging.channex.io/api/v1/property_users/:id
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
**Bad Request Error Response**

Status Code: `400 Bad Request`

```javascript
{
  "errors": {
    "code": "bad_request",
    "details": "User can not withdraw themself",
    "title": "Bad Request"
  }
}
```

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

**Forbidden Error Response**

Status Code: `403 Forbidden`

```javascript
{
  "errors": {
    "code": "forbidden",
    "title": "Forbidden"
  }
}
```

**Resource Not Found Error Response**

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
Method can return a Success result with `200 OK` HTTP Code if operation is successful.\
\
**Bad Request Error**\
Method can return a Bad Request Error result with `400 Bad Request` HTTP Code if user will try to remove them self.\
\
**Unauthorised Error**\
Method can return a Unauthorised Error result with `401 Unauthorized` HTTP Code if wrong API Key provided.\
\
**Forbidden Error**\
Method can return a Forbidden Error result with `403 Forbidden` HTTP Code if current user not have permissions to call this action.\
\
**Resource Not Found Error**\
Method can return a Resource Not Found Error result with `404 Not Found` HTTP Code if requested Property User is not defined.
