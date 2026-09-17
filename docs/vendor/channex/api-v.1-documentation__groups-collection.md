<!-- https://docs.channex.io/api-v.1-documentation/groups-collection.md -->
> For the complete documentation index, see [llms.txt](https://docs.channex.io/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://docs.channex.io/api-v.1-documentation/groups-collection.md).

# Groups Collection

API methods to work with Groups

**Group** is an entity to combine your properties together to make management easier. You can combine properties to one or many groups.<br>

{% hint style="info" %}
A Property must be a member of a group, you cannot remove from a group unless it is a member of another group
{% endhint %}

## Groups List

Retrieve list of Groups associated with user.

{% tabs %}
{% tab title="Request" %}
Request:

```
GET https://staging.channex.io/api/v1/groups
```

{% endtab %}

{% tab title="Success Response" %}
**Success Response Example**

Status Code: `200 OK`

```javascript
{
  "data": [
    {
      "type": "group",
      "id": "f5338935-7fe0-40eb-9d7e-4dbf7ecc52c7",
      "attributes": {
        "id": "f5338935-7fe0-40eb-9d7e-4dbf7ecc52c7",
        "title": "User Group"
      },
      "relationships": {
        "properties": {
          "data": [
            {
              "id": "716305c4-561a-4561-a187-7f5b8aeb5920",
              "type": "property",
              "attributes": {
                "id": "716305c4-561a-4561-a187-7f5b8aeb5920",
                "title": "Property A"
              }
            },
            {
              "id": "1b0e7c64-93b7-49f2-8b3c-99568f78b907",
              "type": "property",
              "attributes": {
                "id": "1b0e7c64-93b7-49f2-8b3c-99568f78b907",
                "title": "Property B"
              }
            }
          ]
        }
      }
    },
    {
      "type": "group",
      "id": "e1804b27-ca56-4bb6-9fac-8ed9662d3af7",
      "attributes": {
        "id": "e1804b27-ca56-4bb6-9fac-8ed9662d3af7",
        "title": "test"
      },
      "relationships": {
        "properties": {
          "data": []
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
Method can return a Success result with `200 OK` HTTP Code if operation is successful. Will contain a list of Group objects in the answer.\
\
**Unauthorised Error**\
Method can return a Unauthorised Error result with `401 Unauthorized` HTTP Code if wrong API Key provided.

## Get Group by ID

Retrieve specific Group associated with User by ID.

{% tabs %}
{% tab title="Request" %}
Request:

```
GET https://staging.channex.io/api/v1/groups/:id
```

{% endtab %}

{% tab title="Success Response" %}
**Success Response Example**

Status Code: `200 OK`

```javascript
{
  "data": {
    "type": "group",
    "id": "f5338935-7fe0-40eb-9d7e-4dbf7ecc52c7",
    "attributes": {
      "id": "f5338935-7fe0-40eb-9d7e-4dbf7ecc52c7",
      "title": "User Group"
    },
    "relationships": {
      "properties": {
        "data": [
          {
            "id": "716305c4-561a-4561-a187-7f5b8aeb5920",
            "type": "property",
            "attributes": {
              "id": "716305c4-561a-4561-a187-7f5b8aeb5920",
              "title": "Property A"
            }
          },
          {
            "id": "1b0e7c64-93b7-49f2-8b3c-99568f78b907",
            "type": "property",
            "attributes": {
              "id": "1b0e7c64-93b7-49f2-8b3c-99568f78b907",
              "title": "Property B"
            }
          }
        ]
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
Method can return a Success result with `200 OK` HTTP Code if operation is successful. Will contain a Group object in the answer.\
\
**Unauthorised Error**\
Method can return a Unauthorised Error result with `401 Unauthorized` HTTP Code if wrong API Key provided or User not have access to requested Property.

**Not Found Error**\
Method can return a Not Found Error result with `404 Not Found` HTTP Code if Group with provided ID is not present at system.

## Create Group

Create a new Group.

{% tabs %}
{% tab title="Request" %}
Request:

```
POST https://staging.channex.io/api/v1/groups
```

Query body (JSON):

```javascript
{
  "group": {
    "title": "South London Group"
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
    "type": "group",
    "id": "f5338935-7fe0-40eb-9d7e-4dbf7ecc52c7",
    "attributes": {
      "id": "f5338935-7fe0-40eb-9d7e-4dbf7ecc52c7",
      "title": "South London Group"
    },
    "relationships": {
      "properties": {
        "data": []
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

Any non-empty string with maximum length of 255 symbols.\
Note: The Group will be represented in the system under that title.

### Returns

**Success**\
Method can return a Success result with `201 Created` HTTP Code if operation is successful. Will contain a Group object in the answer.

**Unauthorised Error**\
Method can return a Unauthorised Error result with `401 Unauthorized` HTTP Code if wrong API Key provided.

**Validation Error**\
Method can return a Validation Error result with `422 Unprocessable Entity` HTTP Code if any validation rule is failed.

## Update Group

Update a Group.

{% tabs %}
{% tab title="Request" %}
Request:

```
PUT https://staging.channex.io/api/v1/groups/:id
```

Query body (JSON):

```javascript
{
  "group": {
    "title": "North London Group"
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
    "type": "group",
    "id": "f5338935-7fe0-40eb-9d7e-4dbf7ecc52c7",
    "attributes": {
      "id": "f5338935-7fe0-40eb-9d7e-4dbf7ecc52c7",
      "title": "North London Group"
    },
    "relationships": {
      "properties": {
        "data": []
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

**title `[required]`**

Any non-empty string with maximum length of 255 symbols.\
Note: The Group will be represented in the system under that title.

### Returns

**Success**\
Method can return a Success result with `200 OK` HTTP Code if operation is successful. Will contain a Group object in the answer.\
\
**Unauthorised Error**\
Method can return a Unauthorised Error result with `401 Unauthorized` HTTP Code if wrong API Key provided.

**Not Found Error**\
Method can return a Not Found Error result with `404 Not Found` HTTP Code if Group with provided ID is not present at system.

**Validation Error**\
Method can return a Validation Error result with `422 Unprocessable Entity` HTTP Code if any validation rule is failed.

## Remove Group

Remove a Group.

{% tabs %}
{% tab title="Request" %}
Request:

```
DELETE https://staging.channex.io/api/v1/groups/:id
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
Method can return a Success result with `200 OK` HTTP Code if operation is successful. Will contain a Meta object with message in the answer.\
\
**Bad Request Error**\
Method can return a Bad Request Error result with `400 Bad Request` HTTP Code if the Group you would like to remove has at least one Property attached.

**Unauthorised Error**\
Method can return a Unauthorised Error result with `401 Unauthorized` HTTP Code if wrong API Key provided.

**Not Found Error**\
Method can return a Not Found Error result with `404 Not Found` HTTP Code if Group with provided ID is not present at system.

## Associate Property With Group

Associate a Property with a Group.

{% tabs %}
{% tab title="Request" %}
Request:

```
POST https://staging.channex.io/api/v1/groups/:group_id/properties/:property_id
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

**Validation Error Response**

Status Code: `422 Unprocessable Entity`

```javascript
{
  "errors": {
    "code": "validation_error",
    "title": "Validation Error",
    "details": {
      "hotel_id": [
        "Only one GroupHotel entity per Group and Hotel pair allowed!"
      ]
    }
  }
}
```

{% endtab %}
{% endtabs %}

### Returns

**Success**\
Method can return a Success result with `200 OK` HTTP Code if operation is successful. Will contain a Meta object with message in the answer.\
\
**Unauthorised Error**\
Method can return a Unauthorised Error result with `401 Unauthorized` HTTP Code if wrong API Key provided.

**Not Found Error**\
Method can return a Not Found Error result with `404 Not Found` HTTP Code if Group or Property with provided ID is not present at system.

**Validation Error**\
Method can return a Validation Error result with `422 Unprocessable Entity` HTTP Code if Property is already associated with a Group.

## Remove Property From Group

Remove a Property from a Group.

{% tabs %}
{% tab title="Request" %}
Request:

```
DELETE https://staging.channex.io/api/v1/groups/:group_id/properties/:property_id
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
Method can return a Success result with `200 OK` HTTP Code if operation is successful. Will contain a Meta object with message in the answer.\
\
**Bad Request Error**\
Method can return a Bad Request Error result with `400 Bad Request` HTTP Code if the Property you would like to remove from Group not attached to any other Group.

**Unauthorised Error**\
Method can return a Unauthorised Error result with `401 Unauthorized` HTTP Code if wrong API Key provided.

**Not Found Error**\
Method can return a Not Found Error result with `404 Not Found` HTTP Code if Group or Property with provided ID is not present at system.
