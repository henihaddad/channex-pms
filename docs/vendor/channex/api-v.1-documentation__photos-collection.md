<!-- https://docs.channex.io/api-v.1-documentation/photos-collection.md -->
> For the complete documentation index, see [llms.txt](https://docs.channex.io/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://docs.channex.io/api-v.1-documentation/photos-collection.md).

# Photos Collection

API Methods to work with Photos

**Photo** is entity to represent photo associated with Property and Room Type (optional).

## Photos List

Retrieve list of Photos associated with user Properties.

{% tabs %}
{% tab title="Request" %}
Request:

```
GET https://staging.channex.io/api/v1/photos
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
        "author": null,
        "description": null,
        "id": "ae75d43e-21c5-46b6-a593-5046791f7841",
        "kind": "ad",
        "position": 0,
        "property_id": "52397a6e-c330-44f4-a293-47042d3a3607",
        "room_type_id": null,
        "url": "https://img.channex.io/312fa6cb-8151-409b-b612-773e271a76df/"
      },
      "id": "ae75d43e-21c5-46b6-a593-5046791f7841",
      "type": "photo"
    }
  ],
  "meta": {}
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
Method can return a Success result with `200 OK` HTTP Code if operation is successful. Will contain a list of Photo objects in the answer.\
\
**Unauthorised Error**\
Method can return a Unauthorised Error result with `401 Unauthorized` HTTP Code if wrong API Key provided.

## Get Photo by ID

Retrieve specific Photo by ID.

{% tabs %}
{% tab title="Request" %}
Request:

```
GET https://staging.channex.io/api/v1/photos/:id
```

{% endtab %}

{% tab title="Success Response" %}
**Success Response Example**

Status Code: `200 OK`

```javascript
{
  "data": {
    "attributes": {
      "author": null,
      "description": null,
      "id": "ae75d43e-21c5-46b6-a593-5046791f7841",
      "kind": "ad",
      "position": 0,
      "property_id": "52397a6e-c330-44f4-a293-47042d3a3607",
      "room_type_id": null,
      "url": "https://img.channex.io/312fa6cb-8151-409b-b612-773e271a76df/"
    },
    "id": "ae75d43e-21c5-46b6-a593-5046791f7841",
    "type": "photo"
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
Method can return a Success result with `200 OK` HTTP Code if operation is successful. Will contain a Photo object in the answer.\
\
**Unauthorised Error**\
Method can return a Unauthorised Error result with `401 Unauthorized` HTTP Code if wrong API Key provided or User not have access to requested Photo.

**Not Found Error**\
Method can return a Not Found Error result with `404 Not Found` HTTP Code if Photo with provided ID is not present at system.

## Create Photo

Create new Photo.

{% tabs %}
{% tab title="Request" %}
Request:

```
POST https://staging.channex.io/api/v1/photos
```

Query body (JSON):

```javascript
{
  "photo": {
    "author": "Author Name",
    "description": "Room View",
    "kind": "photo",
    "position": 0,
    "url": "https://img.channex.io/af08bc1d-8074-476c-bdb7-cec931edaf6a/",
    "property_id": "52397a6e-c330-44f4-a293-47042d3a3607",
    "room_type_id": null
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
      "author": "Author Name",
      "description": "Room View",
      "id": "656d8cab-beaa-45a3-8ddb-44684816edba",
      "kind": "photo",
      "position": 0,
      "property_id": "52397a6e-c330-44f4-a293-47042d3a3607",
      "room_type_id": null,
      "url": "https://img.channex.io/af08bc1d-8074-476c-bdb7-cec931edaf6a/"
    },
    "id": "656d8cab-beaa-45a3-8ddb-44684816edba",
    "type": "photo"
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
      "url": [
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

String with valid UUID of Property object what you would like to associate with created Photo.

**url `[required]`**

Valid URL address of Photo image.

**room\_type\_id `[optional]`**

String with valid UUID of Room Type object what you would like to associate with created Photo.\
If `room_type_id` is `null`, Photo will be associated only with Property.

**kind `[optional]`**

One of three possible values: `photo`, `ad` (advertising), `menu` (restaurant menu photo).\
By default value kind will be equal to `photo`.

**author `[optional]`**

Name of photo author.

**description `[optional]`**

Text with Photo description.

**position `[optional]`**

Any positive integer number.\
This field represent Photo position at list of Property or Room Type Photos. Photo with position equal to 0 is used as Cover Photo.\
Position should be unique per `property_id` and `room_type_id` combination.

### Returns

**Success**\
Method can return a Success result with `201 Created` HTTP Code if operation is successful. Will contain a Photo object in the answer.

**Unauthorised Error**\
Method can return a Unauthorised Error result with `401 Unauthorized` HTTP Code if wrong API Key provided.

**Validation Error**\
Method can return a Validation Error result with `422 Unprocessable Entity` HTTP Code if any validation rule is failed.

## Upload Photo

To upload Photos and create it you should use next API:

```
POST https://staging.channex.io/api/v1/photos/upload
--form 'photo=@"path_to_photo/photo.jpg"'
```

In response you will get a link to temporary photo:

```
{
    "url": "https://ams3.digitaloceanspaces.com/temporaryphotos/a66edb22-47da-4da8-bab5-3b6f4056256f.jpg"
}
```

Then you can use this `url` in Create Photo API call.

## Update Photo

Update Photo.

{% tabs %}
{% tab title="Request" %}
Request:

```
PUT https://staging.channex.io/api/v1/photos/:id
```

Query body (JSON):

```javascript
{
  "photo": {
    "author": "Author Name",
    "description": "Room View",
    "kind": "photo",
    "position": 0,
    "url": "https://img.channex.io/af08bc1d-8074-476c-bdb7-cec931edaf6a/",
    "property_id": "52397a6e-c330-44f4-a293-47042d3a3607",
    "room_type_id": null
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
      "author": "Author Name",
      "description": "Room View",
      "id": "656d8cab-beaa-45a3-8ddb-44684816edba",
      "kind": "photo",
      "position": 0,
      "property_id": "52397a6e-c330-44f4-a293-47042d3a3607",
      "room_type_id": null,
      "url": "https://img.channex.io/af08bc1d-8074-476c-bdb7-cec931edaf6a/"
    },
    "id": "656d8cab-beaa-45a3-8ddb-44684816edba",
    "type": "photo"
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
      "url": [
        "can't be blank"
      ]
    }
  }
}
```

{% endtab %}
{% endtabs %}

### Fields

This method use same fields as Create Photo method.

### Returns

**Success**\
Method can return a Success result with `200 OK` HTTP Code if operation is successful. Will contain a Photo object in the answer.\
\
**Unauthorised Error**\
Method can return a Unauthorised Error result with `401 Unauthorized` HTTP Code if wrong API Key provided.

**Not Found Error**\
Method can return a Not Found Error result with `404 Not Found` HTTP Code if Photo with provided ID is not present at system.

**Validation Error**\
Method can return a Validation Error result with `422 Unprocessable Entity` HTTP Code if any validation rule is failed.

## Remove Photo

Remove Photo.

{% tabs %}
{% tab title="Request" %}
Request:

```
DELETE https://staging.channex.io/api/v1/photos/:id
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
Method can return a Not Found Error result with `404 Not Found` HTTP Code if Photo with provided ID is not present at system.

## Batch operations

API methods to create or update [Property](/api-v.1-documentation/hotels-collection.md) or [Room Type](/api-v.1-documentation/room-types-collection.md) have implementation of Photo batch operations.\
To create Property with Photos, you can pass list of Photo arguments as value into `content.photos` key of affected object.

Batch operations support logic to create new Photo entity associated with parent object, update existed photos or drop it.

To update Photo at batch operation, you must provide photo with it ID.

To drop Photo at batch operation, you can pass additional optional key: `is_removed` with value equal to `true` at Photo object what are you like to remove.
