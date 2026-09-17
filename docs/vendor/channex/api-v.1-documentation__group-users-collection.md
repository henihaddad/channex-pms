<!-- https://docs.channex.io/api-v.1-documentation/group-users-collection.md -->
> For the complete documentation index, see [llms.txt](https://docs.channex.io/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://docs.channex.io/api-v.1-documentation/group-users-collection.md).

# Group Users Collection

API methods to work with Group Users

**Group User** is an association between a Group and a User, represents who can manage a group and all properties under the group with which role and access rights.

## Group Users List

Retrieve list of Group Users associated with a Group.

{% tabs %}
{% tab title="Request" %}
Request:

```
GET https://staging.channex.io/api/v1/group_users?filter[group_id]=GROUP_ID
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
      "type": "group_user",
      "attributes": {
        "id": "776533f2-c10e-49d8-bddc-14b3e27c2a00",
        "overrides": null,
        "group_id": "52397a6e-c330-44f4-a293-47042d3a3607",
        "role": "owner",
        "user_id": "c9cfa184-5095-4ef2-bbe2-e723ffb49184"
      },
      "relationships": {
        "group": {
          "data": {
            "id": "52397a6e-c330-44f4-a293-47042d3a3607",
            "type": "group"
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
Method can return a Success result with `200 OK` HTTP Code if operation is successful. Will contain a list of Group User objects in the answer.\
\
**Unauthorised Error**\
Method can return a Unauthorised Error result with `401 Unauthorized` HTTP Code if wrong API Key provided.

## Invite User to Group

Create a new Group User. By inviting a User into a Group, you are automatically granting access for this user to all properties in the Group.

{% tabs %}
{% tab title="Request" %}
Request:

```
POST https://staging.channex.io/api/v1/group_users
```

Query body (JSON):

```javascript
{
  "invite": {
    "group_id": "52397a6e-c330-44f4-a293-47042d3a3607",
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
    "type": "group_user",
    "attributes": {
      "id": "776533f2-c10e-49d8-bddc-14b3e27c2a00",
      "overrides": null,
      "group_id": "52397a6e-c330-44f4-a293-47042d3a3607",
      "role": "user",
      "user_id": "c9cfa184-5095-4ef2-bbe2-e723ffb49184"
    },
    "relationships": {
      "group": {
        "data": {
          "id": "52397a6e-c330-44f4-a293-47042d3a3607",
          "type": "group"
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

**group\_id `[required]`**

String with valid UUID for Group object what you would use as target for invitation.

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
Method can return a Success result with `201 Created` HTTP Code if operation is successful. Will contain a Group User object in the answer.\
\
**Bad Request Error**\
Method can return a Bad Request Error result with `400 Bad Request` HTTP Code if provided user already invited.\
\
**Unauthorised Error**\
Method can return a Unauthorised Error result with `401 Unauthorized` HTTP Code if wrong API Key provided.\
\
**Forbidden Error**\
Method can return a Forbidden Error result with `403 Forbidden` HTTP Code if current user not have permissions to invite user into provided group.

**Validation Error**\
Method can return a Validation Error result with `422 Unprocessable Entity` HTTP Code if any validation rule is failed.

## Get Group User by ID

Retrieve a Group User by ID.

{% tabs %}
{% tab title="Request" %}
Request:

```
GET https://staging.channex.io/api/v1/group_users/:id
```

{% endtab %}

{% tab title="Success Response" %}
**Success Response Example**

Status Code: `200 OK`

```javascript
{
  "data": {
    "id": "776533f2-c10e-49d8-bddc-14b3e27c2a00",
    "type": "group_user",
    "attributes": {
      "id": "776533f2-c10e-49d8-bddc-14b3e27c2a00",
      "overrides": null,
      "group_id": "52397a6e-c330-44f4-a293-47042d3a3607",
      "role": "owner",
      "user_id": "c9cfa184-5095-4ef2-bbe2-e723ffb49184"
    },
    "relationships": {
      "group": {
        "data": {
          "id": "52397a6e-c330-44f4-a293-47042d3a3607",
          "type": "group"
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
Method can return a Success result with `200 OK` HTTP Code if operation is successful. Will contain a Group User object in the answer.\
\
**Unauthorised Error**\
Method can return a Unauthorised Error result with `401 Unauthorized` HTTP Code if wrong API Key provided.\
\
**Forbidden Error**\
Method can return a Forbidden Error result with `403 Forbidden` HTTP Code if current user not have permissions to call this action.

## Update Group User

Update the Group User information.

{% tabs %}
{% tab title="Request" %}
Request:

```
PUT https://staging.channex.io/api/v1/group_users/:id
```

Query body (JSON):

```javascript
{
  "group_user": {
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
    "type": "group_user",
    "attributes": {
      "id": "776533f2-c10e-49d8-bddc-14b3e27c2a00",
      "overrides": null,
      "group_id": "52397a6e-c330-44f4-a293-47042d3a3607",
      "role": "user",
      "user_id": "c9cfa184-5095-4ef2-bbe2-e723ffb49184"
    },
    "relationships": {
      "group": {
        "data": {
          "id": "52397a6e-c330-44f4-a293-47042d3a3607",
          "type": "group"
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

Through this method you can update only two fields - role and overrides. Please see Invite User to Group for more detailed information.

### Returns

**Success**\
Method can return a Success result with `200 OK` HTTP Code if operation is successful. Will contain a Group User object in the answer.\
\
**Unauthorised Error**\
Method can return a Unauthorised Error result with `401 Unauthorized` HTTP Code if wrong API Key provided.\
\
**Forbidden Error**\
Method can return a Forbidden Error result with `403 Forbidden` HTTP Code if current user not have permissions to call this action.\
\
**Resource Not Found Error**\
Method can return a Resource Not Found Error result with `404 Not Found` HTTP Code if requested Group User is not defined.

**Validation Error**\
Method can return a Validation Error result with `422 Unprocessable Entity` HTTP Code if any validation rule is failed.

## Withdraw Group User Access

Revoke Group User access to a specific Group.

{% tabs %}
{% tab title="Request" %}
Request:

```
DELETE https://staging.channex.io/api/v1/group_users/:id
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
Method can return a Resource Not Found Error result with `404 Not Found` HTTP Code if requested Group User is not defined.
