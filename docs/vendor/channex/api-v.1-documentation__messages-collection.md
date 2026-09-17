<!-- https://docs.channex.io/api-v.1-documentation/messages-collection.md -->
> For the complete documentation index, see [llms.txt](https://docs.channex.io/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://docs.channex.io/api-v.1-documentation/messages-collection.md).

# Messages Collection

API to work with Chat

At Channex you are able to work with `Channel Messages`, it is an unified API to work with chat messages from Booking.com, Expedia and Airbnb (only these 3 channels are supported currently).

The messages API has 2 parts - Booking Messages and Message Thread.

{% hint style="info" %}
If you would like a quick start you can use the iframe feature to insert our chat interface into your PMS.
{% endhint %}

## Enable chat on the Property

Go here to applications: <https://app.channex.io/applications>

Add the chat app to the property, then the API and UI for chat will be available.

<figure><img src="https://2514252617-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2F-LWLG7_BCMgWd3mn6DYg%2Fuploads%2FMr6FFjWAdvANmOBb62R8%2FScreenshot%202025-03-11%20at%2020.05.08.png?alt=media&amp;token=81e87a26-4013-4736-b0c2-173c9f33c460" alt="" width="292"><figcaption><p>Find the Messages app and click on it</p></figcaption></figure>

<figure><img src="https://2514252617-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2F-LWLG7_BCMgWd3mn6DYg%2Fuploads%2FQuDanjGFpzGL0y5wE32I%2FScreenshot%202025-03-11%20at%2020.07.31.png?alt=media&amp;token=4220e8e9-ec5d-4955-ba92-c4e85a8de9f6" alt="" width="375"><figcaption><p>Click on Install, this app will cost you depending on type of property you have</p></figcaption></figure>

## Data Structures

### Message

```javascript
{
  "message": "Client Message",
  "attachments": [],
  "sender": "guest",
  "inserted_at": "2021-07-28T04:25:15.000000",
  "updated_at": "2021-07-28T04:25:15.000000"
}
```

`message` Text field with Guest message. Can be empty, if `attachments` is present.

`attachments` List of links to Attachments associated with message.

`sender` Enum field to represent message direction. Can be `guest` or `property`.

`inserted_at` Timestamp, when message was received.

`updated_at` Timestamp, when message was updated.

### Message Thread

```javascript
{
  "title": "Maldonado Roxy",
  "is_closed": false,
  "provider": "BookingCom",
  "message_count": 2,
  "last_message": {
    "attachments": [],
    "inserted_at": "2021-07-27T09:43:05.864520",
    "message": "Thanks for your message.",
    "sender": "property"
  },
  "last_message_received_at": "2021-07-27T09:43:05.864520",
  "inserted_at": "2021-07-27T09:32:14.281622",
  "updated_at": "2021-07-27T09:43:05.868034"
}
```

`title` String field with Message Thread title, usually equal to the Customer name.

`is_closed` Boolean marker to show if the thread is open or not.

`provider` Message provider. String. (This will be "BookingCom" (Booking.com), "Airbnb" or "Expedia") Later there will be more providers.

`message_count` Integer field to represent count of messages inside Message Thread.

`last_message` - Message entity.

`last_message_received_at` Timestamp to represent when last message was received.

`inserted_at` Timestamp, when Message Thread was received.

`updated_at` Timestamp, when Message Thread was updated.

## Booking Messages

Simple API to send and read messages at the Booking level.

### Get Messages per Booking

{% tabs %}
{% tab title="Request" %}
Request:

```
GET https://staging.channex.io/api/v1/bookings/:booking_id/messages
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
        "message": "Message",
        "attachments": [],
        "sender": "guest",
        "inserted_at": "2021-07-28T04:25:15.000000",
        "updated_at": "2021-07-28T04:25:22.613482"
      },
      "id": "5848b518-07a4-4c8c-a998-2784d638ba30",
      "relationships": {
        "message_thread": {
          "data": {
            "id": "4e160f0b-016a-424a-a30d-a9f0a8b1cbaa",
            "type": "message_thread"
          }
        }
      },
      "type": "message"
    }
  ],
  "meta": {
    "limit": 10,
    "order_by": "inserted_at",
    "order_direction": "desc",
    "page": 1,
    "total": 1
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

**Forbidden Error**

Status Code: `403 Forbidden`

```javascript
{
  "errors": {
    "code": "forbidden",
    "title": "Forbidden"
  }
}
```

This error happened, when Property is not have installed Messages Application.

**Not Supported**

Status Code: `422 Unprocessable Entity`

```javascript
{
  "errors": {
    "code": "not_supported",
    "title": "Method not supported"
  }
}
```

This error happened, when Property connected to Messages Application, but original Booking OTA is not support Message API.
{% endtab %}
{% endtabs %}

#### Returns

**Success**\
Method can return a Success result with `200 OK` HTTP Code if operation is successful. Will contain a `Messages` list in the answer.\
\
**Unauthorised Error**\
Method can return a Unauthorised Error result with `401 Unauthorized` HTTP Code if wrong API Key provided or User not have access to requested Booking.

**Not Found Error**\
Method can return a Not Found Error result with `404 Not Found` HTTP Code if Booking with provided ID is not present at system.

**Forbidden Error**\
Method can return a Forbidden Error result with `403 Forbidden` HTTP Code if Property, associated with requested Booking, is not connected to Messages Application.

**Not Supported Error**\
Method can return a Not Supported Error result with `422 Unprocessable Entity` HTTP Code if Booking with provided ID associated with OTA, which not support Messages API.

### Send Message to Booking

{% tabs %}
{% tab title="Request" %}
Request:

```
POST https://staging.channex.io/api/v1/bookings/:booking_id/messages
```

Payload:

```javascript
{
  "message": {
    "message": "MESSAGE CONTENT"
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
      "attachments": [],
      "inserted_at": "2021-07-30T09:53:46.563215",
      "message": "MESSAGE CONTENT",
      "sender": "property",
      "updated_at": "2021-07-30T09:53:46.563215"
    },
    "id": "34849183-7c36-4ac4-9103-cfaeecbc2cc8",
    "relationships": {
      "message_thread": {
        "data": {
          "id": "4e160f0b-016a-424a-a30d-a9f0a8b1cbaa",
          "type": "message_thread"
        }
      },
      "user": {
        "data": {
          "id": "c9080091-6b9f-4868-a2ca-691036d29ed0",
          "type": "user"
        }
      }
    },
    "type": "message"
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

**Forbidden Error**

Status Code: `403 Forbidden`

```javascript
{
  "errors": {
    "code": "forbidden",
    "title": "Forbidden"
  }
}
```

This error happened, when Property is not have installed Messages Application.

**Not Supported**

Status Code: `422 Unprocessable Entity`

```javascript
{
  "errors": {
    "code": "not_supported",
    "title": "Method not supported"
  }
}
```

This error happened, when Property connected to Messages Application, but original Booking OTA is not support Message API.
{% endtab %}
{% endtabs %}

#### Returns

**Success**\
Method can return a Success result with `200 OK` HTTP Code if operation is successful. Will contain a `Message` in the answer.\
\
**Unauthorised Error**\
Method can return a Unauthorised Error result with `401 Unauthorized` HTTP Code if wrong API Key provided or User not have access to requested Booking.

**Not Found Error**\
Method can return a Not Found Error result with `404 Not Found` HTTP Code if Booking with provided ID is not present at system.

**Forbidden Error**\
Method can return a Forbidden Error result with `403 Forbidden` HTTP Code if Property, associated with requested Booking, is not connected to Messages Application.

**Not Supported Error**\
Method can return a Not Supported Error result with `422 Unprocessable Entity` HTTP Code if Booking with provided ID associated with OTA, which not support Messages API.

{% hint style="warning" %}
At current moment we support messages API for Booking.com, Airbnb and Expedia.\
But, please, keep in mind, Expedia bookings created at Expedia Partner Solutions (Expedia Affiliate Network) is not support Messages API at all.
{% endhint %}

### Send Attachment to Booking

Before send attachment you should upload it to Channex side via Create Attachment method

{% tabs %}
{% tab title="Request" %}
Request:

```
POST https://staging.channex.io/api/v1/attachments
```

Payload:

```javascript
{
    "attachment": {
        "file": "base64 encoded string",
        "file_name": "photo.jpeg",
        "file_type": "image/jpeg"
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
        "id": "c40a00f9-d3d3-4809-8d46-adc378c95f20",
        "type": "attachment"
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

**Forbidden Error**

Status Code: `403 Forbidden`

```javascript
{
  "errors": {
    "code": "forbidden",
    "title": "Forbidden"
  }
}
```

This error happened, when Property is not have installed Messages Application.
{% endtab %}
{% endtabs %}

#### Returns

**Success**\
Method can return a Success result with `200 OK` HTTP Code if operation is successful. Will contain a `Attachment` in the answer

#### Send attachment

Next step is send uploaded attachment as a message:

{% tabs %}
{% tab title="Request" %}
Request:

```
POST https://staging.channex.io/api/v1/bookings/:booking_id/messages
```

Payload:

```javascript
{
  "message": {
    "attachment_id": "c40a00f9-d3d3-4809-8d46-adc378c95f20"
  }
}
```

**Warning:** `message` object can hot have `message` field in that case. If `message` field will be present, attachment will be ignored.
{% endtab %}

{% tab title="Success Response" %}
**Success Response Example**

Status Code: `200 OK`

```javascript
{
  "data": {
    "attributes": {
      "attachments": [],
      "inserted_at": "2021-07-30T09:53:46.563215",
      "message": "MESSAGE CONTENT",
      "sender": "property",
      "updated_at": "2021-07-30T09:53:46.563215"
    },
    "id": "34849183-7c36-4ac4-9103-cfaeecbc2cc8",
    "relationships": {
      "message_thread": {
        "data": {
          "id": "4e160f0b-016a-424a-a30d-a9f0a8b1cbaa",
          "type": "message_thread"
        }
      },
      "user": {
        "data": {
          "id": "c9080091-6b9f-4868-a2ca-691036d29ed0",
          "type": "user"
        }
      }
    },
    "type": "message"
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

**Forbidden Error**

Status Code: `403 Forbidden`

```javascript
{
  "errors": {
    "code": "forbidden",
    "title": "Forbidden"
  }
}
```

This error happened, when Property is not have installed Messages Application.
{% endtab %}
{% endtabs %}

#### Returns

Response structure will be same as at regular Send Message operation.

## Message Threads

API methods to work with Message Threads.

### Get Message Threads

{% tabs %}
{% tab title="Request" %}
Request:

```
GET https://staging.channex.io/api/v1/message_threads
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
        "title": "Maldonado Roxy",
        "is_closed": false,
        "provider": "BookingCom",
        "message_count": 2,
        "last_message": {
          "attachments": [],
          "inserted_at": "2021-07-27T09:43:05.864520",
          "message": "Thanks for your message.",
          "sender": "property"
        },
        "last_message_received_at": "2021-07-27T09:43:05.864520",
        "inserted_at": "2021-07-27T09:32:14.281622",
        "updated_at": "2021-07-27T09:43:05.868034"
      },
      "id": "20d1b08c-190e-4068-a77d-4a909a21835d",
      "relationships": {
        "booking": {
          "data": {
            "id": "4d8240fd-d709-454b-a866-08bca2a5a909",
            "type": "booking"
          }
        },
        "channel": {
          "data": {
            "id": "351f145d-cb8c-4df7-9f12-2f6854991b91",
            "type": "channel"
          }
        },
        "property": {
          "data": {
            "id": "71d34923-a8be-4682-9625-e4a2f080df92",
            "type": "property"
          }
        }
      },
      "type": "message_thread"
    }
  ],
  "meta": {
    "limit": 10,
    "order_by": "inserted_at",
    "order_direction": "desc",
    "page": 1,
    "total": 1
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

**Forbidden Error**

Status Code: `403 Forbidden`

```javascript
{
  "errors": {
    "code": "forbidden",
    "title": "Forbidden"
  }
}
```

This error happened, when Property is not have installed Messages Application.
{% endtab %}
{% endtabs %}

#### Returns

**Success**\
Method can return a Success result with `200 OK` HTTP Code if operation is successful. Will contain a `Message Threads` list in the answer.\
\
**Unauthorised Error**\
Method can return a Unauthorised Error result with `401 Unauthorized` HTTP Code if wrong API Key provided or User not have access to requested Booking.

**Forbidden Error**\
Method can return a Forbidden Error result with `403 Forbidden` HTTP Code if Property, associated with requested Booking, is not connected to Messages Application.

### Get Message Thread by ID

{% tabs %}
{% tab title="Request" %}
Request:

```
GET https://staging.channex.io/api/v1/message_threads/:id
```

{% endtab %}

{% tab title="Success Response" %}
**Success Response Example**

Status Code: `200 OK`

```javascript
{
  "data": {
    "attributes": {
      "title": "Maldonado Roxy",
      "is_closed": false,
      "provider": "BookingCom",
      "message_count": 2,
      "last_message": {
        "attachments": [],
        "inserted_at": "2021-07-27T09:43:05.864520",
        "message": "Thanks for your message.",
        "sender": "property"
      },
      "last_message_received_at": "2021-07-27T09:43:05.864520",
      "inserted_at": "2021-07-27T09:32:14.281622",
      "updated_at": "2021-07-27T09:43:05.868034"
    },
    "id": "20d1b08c-190e-4068-a77d-4a909a21835d",
    "relationships": {
      "booking": {
        "data": {
          "id": "4d8240fd-d709-454b-a866-08bca2a5a909",
          "type": "booking"
        }
      },
      "channel": {
        "data": {
          "id": "351f145d-cb8c-4df7-9f12-2f6854991b91",
          "type": "channel"
        }
      },
      "property": {
        "data": {
          "id": "71d34923-a8be-4682-9625-e4a2f080df92",
          "type": "property"
        }
      }
    },
    "type": "message_thread"
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

**Forbidden Error**

Status Code: `403 Forbidden`

```javascript
{
  "errors": {
    "code": "forbidden",
    "title": "Forbidden"
  }
}
```

This error happened, when Property is not have installed Messages Application.
{% endtab %}
{% endtabs %}

#### Returns

**Success**\
Method can return a Success result with `200 OK` HTTP Code if operation is successful. Will contain a `Message Thread` in the answer.\
\
**Unauthorised Error**\
Method can return a Unauthorised Error result with `401 Unauthorized` HTTP Code if wrong API Key provided or User not have access to requested Booking.

**Forbidden Error**\
Method can return a Forbidden Error result with `403 Forbidden` HTTP Code if Property, associated with requested Booking, is not connected to Messages Application.

### Get Message for Message Thread

{% tabs %}
{% tab title="Request" %}
Request:

```
GET https://staging.channex.io/api/v1/message_threads/:id/messages
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
        "attachments": [],
        "inserted_at": "2021-07-30T09:53:46.563215",
        "message": "MESSAGE CONTENT",
        "sender": "property",
        "updated_at": "2021-07-30T09:53:46.563215"
      },
      "id": "34849183-7c36-4ac4-9103-cfaeecbc2cc8",
      "relationships": {
        "message_thread": {
          "data": {
            "id": "20d1b08c-190e-4068-a77d-4a909a21835d",
            "type": "message_thread"
          }
        },
        "user": {
          "data": {
            "id": "c9080091-6b9f-4868-a2ca-691036d29ed0",
            "type": "user"
          }
        }
      },
      "type": "message"
    },
    {
      "attributes": {
        "attachments": [],
        "inserted_at": "2021-07-28T04:25:15.000000",
        "message": "Special request text 1",
        "sender": "guest",
        "updated_at": "2021-07-28T04:25:22.613482"
      },
      "id": "5848b518-07a4-4c8c-a998-2784d638ba30",
      "relationships": {
        "message_thread": {
          "data": {
            "id": "20d1b08c-190e-4068-a77d-4a909a21835d",
            "type": "message_thread"
          }
        }
      },
      "type": "message"
    }
  ],
  "meta": {
    "limit": 10,
    "order_by": "inserted_at",
    "order_direction": "desc",
    "page": 1,
    "total": 2
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

**Forbidden Error**

Status Code: `403 Forbidden`

```javascript
{
  "errors": {
    "code": "forbidden",
    "title": "Forbidden"
  }
}
```

This error happened, when Property is not have installed Messages Application.
{% endtab %}
{% endtabs %}

#### Returns

**Success**\
Method can return a Success result with `200 OK` HTTP Code if operation is successful. Will contain a `Messages` associated with `Message Thread` in the answer.\
\
**Unauthorised Error**\
Method can return a Unauthorised Error result with `401 Unauthorized` HTTP Code if wrong API Key provided or User not have access to requested Booking.

**Forbidden Error**\
Method can return a Forbidden Error result with `403 Forbidden` HTTP Code if Property, associated with requested Booking, is not connected to Messages Application.

{% hint style="info" %}
Message at response can be represented as Attachment. In that case you will get a relative URL. To get full URL for attachment append it by `https://app.channex.io/api/v1/` for production environment and by `https://staging.channex.io/api/v1/` for staging environment.
{% endhint %}

### Send Message to Message Thread

{% tabs %}
{% tab title="Request" %}
Request:

```
POST https://staging.channex.io/api/v1/message_threads/:id/messages
```

Payload:

```javascript
{
  "message": {
    "message": "MESSAGE CONTENT"
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
      "attachments": [],
      "inserted_at": "2021-07-30T09:53:46.563215",
      "message": "MESSAGE CONTENT",
      "sender": "property",
      "updated_at": "2021-07-30T09:53:46.563215"
    },
    "id": "34849183-7c36-4ac4-9103-cfaeecbc2cc8",
    "relationships": {
      "message_thread": {
        "data": {
          "id": "4e160f0b-016a-424a-a30d-a9f0a8b1cbaa",
          "type": "message_thread"
        }
      },
      "user": {
        "data": {
          "id": "c9080091-6b9f-4868-a2ca-691036d29ed0",
          "type": "user"
        }
      }
    },
    "type": "message"
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

#### Returns

**Success**\
Method can return a Success result with `200 OK` HTTP Code if operation is successful. Will contain a `Message` in the answer.\
\
**Unauthorised Error**\
Method can return a Unauthorised Error result with `401 Unauthorized` HTTP Code if wrong API Key provided or User not have access to requested Message Thread.

**Not Found Error**\
Method can return a Not Found Error result with `404 Not Found` HTTP Code if Message Thread with provided ID is not present at system.

### Send Attachments

Please, take a look into [#send-attachment-to-booking](#send-attachment-to-booking "mention").

### Close Message Thread

{% tabs %}
{% tab title="Request" %}
Request:

```
POST https://staging.channex.io/api/v1/message_threads/:id/close
```

{% endtab %}

{% tab title="Success Response" %}
**Success Response Example**

Status Code: `200 OK`

```javascript
{
  "data": {
    "attributes": {
      "title": "Maldonado Roxy",
      "is_closed": true,
      "provider": "BookingCom",
      "message_count": 2,
      "last_message": {
        "attachments": [],
        "inserted_at": "2021-07-27T09:43:05.864520",
        "message": "Thanks for your message.",
        "sender": "property"
      },
      "last_message_received_at": "2021-07-27T09:43:05.864520",
      "inserted_at": "2021-07-27T09:32:14.281622",
      "updated_at": "2021-07-27T09:43:05.868034"
    },
    "id": "20d1b08c-190e-4068-a77d-4a909a21835d",
    "relationships": {
      "booking": {
        "data": {
          "id": "4d8240fd-d709-454b-a866-08bca2a5a909",
          "type": "booking"
        }
      },
      "channel": {
        "data": {
          "id": "351f145d-cb8c-4df7-9f12-2f6854991b91",
          "type": "channel"
        }
      },
      "property": {
        "data": {
          "id": "71d34923-a8be-4682-9625-e4a2f080df92",
          "type": "property"
        }
      }
    },
    "type": "message_thread"
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

#### Returns

**Success**\
Method can return a Success result with `200 OK` HTTP Code if operation is successful. Will contain a `Message Thread` in the answer.\
\
**Unauthorised Error**\
Method can return a Unauthorised Error result with `401 Unauthorized` HTTP Code if wrong API Key provided or User not have access to requested Message Thread.

**Not Found Error**\
Method can return a Not Found Error result with `404 Not Found` HTTP Code if Message Thread with provided ID is not present at system.

### Mark Thread as No Reply needed

{% hint style="warning" %}
This action applicable only for **Booking.com** messages.
{% endhint %}

Booking.com have some internal scoring based at response time, but sometimes Guests provide messages what is not need any reply from Hotel side. In that case, you can mark thread as `No Reply needed`. To do that you can use next API call:

```
POST /api/v1/message_threads/:id/no_reply_needed
```

Payload is empty.

In that case, Booking.com count reaction time correct.

### Threads without bookings

Airbnb have use case called "Inquiry", when Guest request Host to create a Booking for specific dates and prices. This logic associated with Messages, because it is used as conversation mechanic between Guest and Host. As result, when Guest create Inquiry at Airbnb side, it will be represented as a Message Thread without associated booking at Channex side.

```json
{
    "data": {
        "attributes": {
            "title": "Andrew",
            "last_message": {
                "message": "Hello",
                "sender": "property",
                "inserted_at": "2023-11-30T07:17:40.000000",
                "attachments": []
            },
            "inserted_at": "2023-11-30T07:01:49.669975",
            "updated_at": "2023-11-30T07:17:51.536183",
            "is_closed": false,
            "last_message_received_at": "2023-11-30T07:17:40.000000",
            "message_count": 6,
            "provider": "AirBNB"
        },
        "id": "b4153232-2e77-4ccf-8383-ae1119b01bc7",
        "type": "message_thread",
        "relationships": {
            "property": {
                "data": {
                    "id": "71d34923-a8be-4682-9625-e4a2f080df92",
                    "type": "property",
                    "title": "Test Property"
                }
            },
            "channel": {
                "data": {
                    "id": "351f145d-cb8c-4df7-9f12-2f6854991b91",
                    "type": "channel"
                }
            }
        }
    }
}
```

Inside Messages you will see special message with information about Inquiry:

```json
{
    "attributes": {
        "message": "inquiry",
        "meta": {
            "status": "active",
            "live_feed_event_id": "9a52c05b-ea75-4fad-aaab-21741c3be253",
            "booking_details": {
                "checkin_date": "2023-12-02",
                "checkout_date": "2023-12-03",
                "currency": "GBP",
                "expected_payout_amount_accurate": "50.00",
                "guest_name": "Andrew",
                "listing_id": "16384756345",
                "listing_name": "Channex Listing",
                "nights": 1,
                "non_response_at": "2023-12-01T07:01:38.735Z",
                "number_of_adults": 3,
                "number_of_children": 0,
                "number_of_guests": 3,
                "number_of_infants": 0,
                "number_of_pets": 0,
                "property_id": "71d34923-a8be-4682-9625-e4a2f080df92",
                "room_type_id": "a9856c2b-f82f-42fc-8467-b10f4c6ffb74"
            }
        },
        "sender": "system",
        "inserted_at": "2023-11-30T07:01:49.492378",
        "updated_at": "2023-11-30T07:01:49.775842",
        "attachments": []
    },
    "id": "99b55a1c-305c-4b5d-b321-95d3684d1328",
    "type": "message",
    "relationships": {
        "message_thread": {
            "data": {
                "id": "b4153232-2e77-4ccf-8383-ae1119b01bc7",
                "type": "message_thread"
            }
        }
    }
}
```
