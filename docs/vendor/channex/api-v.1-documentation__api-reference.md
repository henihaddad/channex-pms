<!-- https://docs.channex.io/api-v.1-documentation/api-reference.md -->
> For the complete documentation index, see [llms.txt](https://docs.channex.io/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://docs.channex.io/api-v.1-documentation/api-reference.md).

# API Reference

Documentation for Channex.io HTTP JSON-based API version 1.0

## **Help**

If you have any comments, suggestions or recommendations, please let us know via <support@channex.io>.

## API Reference

The [Channex.io](https://channex.io) API is organised around REST. Our API has a predictable, resource-oriented URLs, and uses HTTP response codes to indicate API errors. We use built-in HTTP features, like HTTP authentication and HTTP verbs, which are understood by off-the-shelf HTTP clients. We support cross-origin resource sharing, allowing you to interact securely with our API from a client-side web application. JSON is returned by all API responses, including errors.

API support `GET`, `POST`, `PUT` and `DELETE` queries.

Each response is valid JSON object and **MUST** contain at least one key: `errors`, `meta` or `data`.

If response has success status, it **MUST** contain `data` or `meta` key at response object.

`data` object **CAN** be an Object or Array of Objects.

Each `data` object contain `type` and `attributes` keys with response object definition.

```json
{
  "meta": {
    "message": "Human readability message"
  },
  "data": {
    "type": "session",
    "attributes": {
      "field": "value"
    }
  }
}
```

Each `POST` or `PUT` query **MUST** contain a valid JSON Object and use `type` of passed object as key for data.

```json
{
  "user": {
    "email": "test@test.com"
  }
}
```

Where `user` is `type` of passed entity.

## Authentication

Channex.io supports API key access, which can be created in the user profile section of an account with an active subscription.

### API Key Access

Authentication method, where previously generated API Key is used to sign requests:

```
GET https://staging.channex.io/api/v1/properties/ HTTP/1.1
Host: staging.channex.io
Content-Type: application/json
user-api-key: uU08XiMgk8a7CrY4xUjAReUIuTrn83R123adaVb8Tf/qMcVTEgriuJhXWs/1Q1P
```

Please, read this [article](/application-documentation/api-key-access.md) to get more information.

## Errors

Channex uses conventional HTTP response codes to indicate the success or failure of an API request. In general: Codes in the 2xx range indicates success. Codes in the 4xx range indicate an error that failed given the information provided (e.g., a required parameter was omitted, validation errors, etc.). Codes in the 5xx range indicates an error with the Channex servers and you should retry.

Each error response **MUST** include `errors` Object with error details.

```json
{
  "errors": {
    "code": "validation_error",
    "title": "Validation Error",
    "details": {
      "is_active": [
        "can't be blank"
      ]
    }
  }
}
```

Errors Object **MUST** include `code` and `title` fields, other fields is optional.

## Status Codes

`200 OK`\
Success Response

`400 Bad Request`\
The request was unacceptable, often due to missing a required parameter.

`401 Unauthorized`\
No valid API Key provided.

`403 Forbidden`\
Access forbidden. User does not have rights to call this action.

`404 Not Found`\
The requested resource doesn't exist.

`422 Unprocessable Entity`\
Validation Error.

## Pagination

Most List API endpoints at Channex by default returns only first 10 elements. To get more elements you should implement Pagination traversing logic. To work with pagination, use next arguments:

```mustache
GET https://staging.channex.io/api/v1/{{resource}}?pagination[page]={{X}}&pagination[limit]={{Y}}
```

Where `resource` is requested endpoint, `X` - number of requested page, `Y` - count of elements at response.

Please, keep in mind, `page` counted from 1. Max `limit` value is 100.

To control how much elements associated with current account, you can use `meta` section from response:

```json
...
"meta": {
  "limit": 10,
  "page": 1,
  "total": 4
}
...
```

## Order

The most List API Endpoints at Channex support order arguments to get the elements in order. Order field and direction should be provided as a GET argument:

```mustache
GET https://staging.channex.io/api/v1/{{resource}}?order[{{field}}]={{direction}}
```

Where `field` is a field name for sort, `direction` has two possible values (`asc` or `desc`).

Most endpoints by default sort entities by `title` field at ascending direction.

## Filtering data arguments

Most API endpoints in Channex supports filtering data arguments. Our filtering API provide operations to comparison and inclusion checks.

### Basic Concept

Filtering arguments are passed as regular `GET` arguments in the query string under the `filter` prefix. Each field should be wrapped into square brackets: `filter[field]`. To pass list of possible values, use comma symbol: `filter[field]=value1,value2`.

By default symbol `=` mean comparison operator is *equal* if single value passed or is *includes* if list of values passed. But you can use other operators, like greater than or less than by passing it as second argument for filter: `filter[field][gte]=value` or `filter[field][lte]=value`. You can use more than one comparison operator for one field, to build conditions like DATE greater than 2019-01-01 and less than 2019-02-01.

### Supported comparison operators

* `gt` (greater than)
* `gte` (greater than or equal)
* `lt` (less than)
* `lte` (less than or equal)
* `eq` (equal to) default operation if you pass value after `=` symbol
* `not` (not equal to)

### Examples

#### Basic Comparison

Field equal provided value.

```mustache
{{API_ENDPOINT}}/?filter[property_id]={{PROPERTY_ID}}
```

#### Multiple values

Field should be equal to at least one values from provided list.

```mustache
{{API_ENDPOINT}}/?filter[property_id]={{PROPERTY_ID1}},{{PROPERTY_ID2}}
```

#### Multiple fields

Pass several filter arguments.

```mustache
{{API_ENDPOINT}}/?filter[property_id]={{PROPERTY_ID}}&filter[room_type_id]={{ROOM_TYPE_ID}}
```

#### Comparison operations

Use greater than and less than comparison operations

```mustache
{{API_ENDPOINT}}/?filter[date][gte]={{DATE_FROM}}&filter[date][lte]={{DATE_TO}}
```

## API Sandbox Server

For easy access to our API and to make some tests we have prepared a sandbox server that you can use to integrate. You can sign up yourself and create an API key in the user profile area of the admin.

```
https://staging.channex.io
```
