<!-- https://docs.channex.io/for-ota/open-channel-api.md -->
> For the complete documentation index, see [llms.txt](https://docs.channex.io/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://docs.channex.io/for-ota/open-channel-api.md).

# Open Channel API

Details on how to connect your OTA, booking engine or channel manager as a channel on Channex.

{% hint style="info" %}

## Cost: $300 per year payable in advance before certification.

{% endhint %}

## Introduction

To connect your platform to [Channex](http://channex.io/) we have provided a Push API so you can get real time changes of Availability, Prices and Restrictions and push bookings to Channex. Please see the information below on how to integrate. As always we offer full developer support, just email <support@channex.io> if you have any questions.

We will cover the next key points:

* Endpoint to test connection between your side and Channex
* Endpoint to expose mapping details from your side to Channex
* Endpoint to receive inventory changes from Channex at your side
* How to push bookings from your side to Channex
* Endpoint to request Full Sync from Channex to your side

### Create a Staging Server Account

To get started you need to sign up to the Channex staging server and create a test property at staging.channex.io

{% embed url="<https://staging.channex.io>" %}

Once you have made your account you just need to make a test property, with some rooms and rates. You can find some help files on creating that here:

{% embed url="<https://docs.channex.io/application-documentation/properties-and-groups-management#add-a-new-property>" %}

{% embed url="<https://docs.channex.io/application-documentation/rooms-management#create-a-room>" %}

### Channel / OTA Eligibility and Process

At Channex we allow any channel to connect, be assured if you want to be a Channex Channel you will be certified if your technical integration passes all our testing.

You just need to create a test property with some rooms and rates, then create a "Open Channel" so you can self integrate.

If you want to get in touch with us to make sure please send an email to <evan@channex.io>

### Create the Open Channel

Once you have created your test property go to channels and click **Add New** button

![](https://2514252617-files.gitbook.io/~/files/v0/b/gitbook-legacy-files/o/assets%2F-LWLG7_BCMgWd3mn6DYg%2F-MKhyf4_4hughdbqhFhp%2F-MKi0BkD6t9O1QYF_eCU%2FScreenshot%202020-10-28%20at%2008.03.07.png?alt=media\&token=61b6de75-9f42-42fa-82da-6b14ce9cf347)

The "Open Channel" is our way to let you self connect as a channel instead of requiring any manual assistance from Channex. It's also flexible allowing you to integrate from any domain or test server before you certify.

**Channel**: This should be set to "Open Channel"

**Group**: What property group you want to use, if test account only one should show here

**Title**: This is just a text description of your connection, either property name or some other text is acceptable and not used apart from the UI

**Property**: Select your test property you have created

### **Connection Settings**

**Endpoint**: Enter the endpoint where you will receive our api calls.

**API Key**: Your API key to identify Channex api push. By default we will send this API Key as a header `api-key`. Can be empty.

**Hotel Code**: Your hotel code to identify which property on your side. This will be your property ID.

## API Endpoints

### Requirements

To implement the connection between your service and Channex you should implement several API endpoints, these will provide information about the connected property from your side and / or receive changes that has happened at the property state.

All API endpoints should be placed at same level and should have predefined names:\
\*\*<https://your-website.com/api/**&#x6D;apping\\_details/>

At this example, the part written in bold (**<https://your-website.com/api/>)**, can be custom and we expect to get this value as endpoint in the Open Channel configuration.

`mapping_details/` part is predefined by Channex. Endpoint should end with a `/` symbol.

As result, we expect to see the next API endpoints:

* test\_connection
* mapping\_details
* changes

Example:

* \*\*<https://your-website.com/api/**&#x6D;apping\\_details/>
* \*\*<https://your-website.com/api/**&#x74;est\\_connection/>
* \*\*<https://your-website.com/api/**&#x63;hanges/>

API Endpoints can be protected by an API Key authorisation. If you choose this way, we will use a header with name api-key.

Please check the header for authorisation at your server side to make sure the request comes from Channex.

### Test Connection endpoint

This endpoint will be used to check the connection, using a hotel code which is provided by the user (hotel\_code). Channex will send GET request to this endpoint and expect to receive a successful result.

We expect to see GET endpoint protected by API Key authentication. Endpoint should allow a GET argument with hotel\_code

**Query**

```
GET your_site.com/api/test_connection/?hotel_code={HOTEL_CODE}
```

**Expected Response**

```json
{
  "success": true
}  
```

**Expected Response Status Code:** `200 OK`

### Mapping details endpoint <a href="#mapping-details-endpoint" id="mapping-details-endpoint"></a>

This endpoint will be used to get information about Room Types and Rate Plans from your side. This will allow the user to map in the Channex interface.

![Mapping Screen at Channex.io](https://2514252617-files.gitbook.io/~/files/v0/b/gitbook-legacy-files/o/assets%2F-LWLG7_BCMgWd3mn6DYg%2F-MKhcISnpP-xCKs6Mwn8%2F-MKhe2dUr2rdxlFPr3wo%2Fimage-20200513-103906.png?alt=media\&token=de0f2897-31b5-4d15-be63-070c59cd5c64)

We expect to see the GET endpoint protected by API Key authentication. Endpoint should allow a GET argument with a `hotel_code` and return room and rate details for mapping.

**Query**

```
GET your_site.com/api/mapping_details/?hotel_code={HOTEL_CODE}
```

**Expected Response**

```json
{
  "data": {
    "type": "mapping_details",
    "attributes": {
      "room_types": [
        {
          "id": "{ROOM_ID}",
          "title": "{ROOM_TITLE}",
          "rate_plans": [
            {
              "id": "{RATE_PLAN_ID}",
              "title": "{RATE_PLAN_TITLE}",
              "sell_mode": "{per_room | per_person}",
              "max_persons": {OCCUPANCY},
              "currency": "{CURRENCY_ISO_CODE}",
              "read_only": false
            }
          ]
        }
      ]
    }
  }
}
```

**Expected Response Status Code:** `200 OK`

#### Field Description

**`room_types`**\
List of room types available at your side for mapping. Should contain id, title and rate\_plans

**`rate_plans`**\
List of rate plans associated with room type available at your side for mapping. Should contain id, title, sell\_mode, max\_persons, currency, read\_only.

**`sell_mode`**\
Flag to show how room is sell at your side. Can have one of 2 options: per\_room or per\_person. If rate plan is set as per\_room Channex.io will provide updates only for max\_persons occupancy. If rate plan is set as per\_person [channex.io](http://channex.io/) will provide updates for each mapped occupancy (from 1 to max\_persons).

**`max_persons`**\
Max count of guests allowed by rate plan. Integer value greater than 0.

**`currency`**\
ISO 4217 3-alpha currency code of rate plan.

**`read_only`**\
If your rate plan does not allow updates, but can be sold at 3rd party side, you can pass it with flag read\_only equal to true. In that case, we will allow user to map this rate plan but not provide updates for this rate plan.

### Changes API

Each time Channex catches any changes at the property state associated with Rate Plans or Room Types mapped to your system, we will generate a changes message and send it to changes endpoint at your side via POST request.

{% hint style="danger" %}
Min Stay Requirements

Does your system accept Min Stay Arrival & Min Stay Through? If you only support one please get in touch with us for workaround.

If you support only 1 type of min stay, the field will be `min_stay` instead of `min_stay_arrival` or `min_stay_through`.
{% endhint %}

We expect to see the POST endpoint protected by API Key authentication. Query will contain JSON message with changes.

**Query:**

```json
POST your_site.com/api/changes/

{
  "data": [
    {
      "type": "changes_notification",
      "attributes": {
        "request_id": "{UUID}",
        "hotel_code": "{HOTEL_CODE}",
        "changes": [
          {
            "type": "availability_changes",
            "attributes": {
              "room_type_id": "{ROOM_TYPE_ID}",
              "rate_plan_id": "{RATE_PLAN_ID}",
              "date_from": "2020-02-02",
              "date_to": "2020-02-04",
              "availability": 10
            }
          },
          {
            "type": "restriction_changes",
            "attributes": {
              "rate_plan_id": "{RATE_PLAN_ID}",
              "room_type_id": "{ROOM_TYPE_ID}",
              "date_from": "2020-02-02",
              "date_to": "2020-02-04",
              "rates": [
                {
                  "rate": "200.00",
                  "currency": "GBP",
                  "fraction_size": 2
                }
              ],
              "stop_sell": true,
              "closed_to_arrival": false,
              "closed_to_departure": false,
              "min_stay_arrival": 1,
              "min_stay_through": 1,
              "max_stay": 0
            }
          }
        ]
      }
    }
  ]
}
```

**Expected response:**

```json
{
  "success": true,
  "unique_id": "KEY"
}
```

Where `unique_id` is a unique key, which can be used to identify the query at an incident review process.

#### Multi Occupancy example

```json
{
  "data": [
    {
      "type": "changes_notification",
      "attributes": {
        "request_id": "{UUID}",
        "hotel_code": "{HOTEL_CODE}",
        "changes": [
          {
            "type": "restriction_changes",
            "attributes": {
              "rate_plan_id": "{RATE_PLAN_ID}",
              "room_type_id": "{ROOM_TYPE_ID}",
              "date_from": "2020-02-02",
              "date_to": "2020-02-04",
              "rates": [
                {
                  "rate": "250.00",
                  "currency": "GBP",
                  "fraction_size": 2,
                  "occupancy": 3
                },
                {
                  "rate": "200.00",
                  "currency": "GBP",
                  "fraction_size": 2,
                  "occupancy": 2
                },
                {
                  "rate": "150.00",
                  "currency": "GBP",
                  "fraction_size": 2,
                  "occupancy": 1
                }
              ],
              "stop_sell": true,
              "closed_to_arrival": false,
              "closed_to_departure": false,
              "min_stay_arrival": 1,
              "min_stay_through": 1,
              "max_stay": 0
            }
          }
        ]
      }
    }
  ]
}
```

### Changes Notification <a href="#changes-notification" id="changes-notification"></a>

Changes Notification node contain unique request identifier (UUID v4) represented at field `request_id` and `changes` list.

Changes can be 2 types:

* `availability changes`
* `restriction_changes`

Availability Changes represented as type `availability_changes` and contains information about:

* Room Type (`room_type_id` at your system)
* Rate Plan (`rate_plan_id` at your system)
* Date From (`date_from`) represented as Date at ISO 8601 (YYYY-MM-DD) format
* Date To (`date_to`) represented as Date at ISO 8601 (YYYY-MM-DD) format
* Availability (`availability`) integer value with count of available rooms

Restriction Changes represented as type `restriction_changes` and contain information about:

* Rate Plan (`rate_plan_id` at your system)
* Date From (`date_from`) represented as Date at ISO 8601 (`YYYY-MM-DD`) format
* Date To (`date_to`) represented as Date at ISO 8601 (`YYYY-MM-DD`) format
* Stop Sell (`stop_sell`) represented as Boolean value
* Closed To Arrival (`closed_to_arrival`) represented as Boolean value
* Closed To Departure (`closed_to_departure`) represented as Boolean value
* Min Stay Arrival (`min_stay_arrival`) represented as positive Integer value
* Min Stay Through (`min_stay_through`) represented as positive Integer value
* Max Stay (`max_stay`) represented as non-negative Integer value, where 0 mean restriction is not applicable
* Prices (`rates`)

If your system does not support both types of minimum stay please work with `min_stay_arrival`. And then let us know this limitation when we work with you in production. We will create an extra option for your channel to send the correct min stay the customer uses.

Prices can be represented at different ways depending on your pricing model (`sell_mode`).\
For Rate Plans with `sell_mode` equal to `per_room` we will provide prices like the next message:

```json
"rates": [
  {
    "rate": "200.00",
    "currency": "GBP",
    "fraction_size": 2,
    "occupancy": 2
  }
]
```

For Rate Plans with `sell_mode` equal to `per_person` we will provide prices like the next message:

```json
"rates": [
  {
    "rate": "200.00",
    "currency": "GBP",
    "fraction_size": 2,
    "occupancy": 2
  },{
    "rate": "190.00",
    "currency": "GBP",
    "fraction_size": 2,
    "occupancy": 1
  }
]
```

## Push Booking API

To provide bookings from your side, you should send a POST request to the endpoint <https://secure-staging.channex.io/api/v1/channel_webhooks/open_channel/new_booking> signed by API key header:

```
# headers
api-key: open_channel_api_key
```

{% hint style="info" %}
Our Open Channel use API Key `open_channel_api_key`, when you finish your implementation, we will provide API Key specific for your channel connection.
{% endhint %}

{% hint style="warning" %}
Keep in mind, you should use `secure` domain name to push bookings to keep provided credit cards at our PCI Storage.
{% endhint %}

With next message structure:

```json
{
  "booking": {
    "status": "new",
    
    "provider_code": "YOUR_PROVIDER_CODE",
    "hotel_code": "YOUR_HOTEL_CODE",

    "ota_name": "{SOURCE_OTA_NAME}",
    "reservation_id": "{UNIQUE_ID_FROM_OTA}",

    "arrival_date": "2019-05-09",
    "departure_date": "2019-05-10",
    "arrival_hour": "10:00",

    "currency": "GBP",
    
    "payment_collect": "property",
    "payment_type": "credit_card",

    "customer": {
      "name": "User",
      "surname": "Channex",
      "country": "EN",
      "city": "London",
      "address": "101 Finsbury Pavement",
      "zip": "ec2a 1rs",
      "mail": "support@channex.io",
      "phone": "+44 444 4444 44 44",
      "language": "EB",
      "company": {
        "title": "Channex.io",
        "number": "TAX NUMBER",
        "number_type": "VAT"
      },
      "meta": {}
    },
    
    "notes": "Guest notes or special request",

    "guarantee": {
      "expiration_date": "10/2020",
      "cvv": "123",
      "cardholder_name": "Channex User",
      "card_type": "visa",
      "card_number": "4111111111111111",
      "meta": {
        "virtual_card_currency_code": "GBP",
        "virtual_card_current_balance": 10000,
        "virtual_card_decimal_places": 2,
        "virtual_card_effective_date": "2020-02-02",
        "virtual_card_expiration_date": "2021-02-02"
      }
    },

    "rooms": [
      {
        "index": 0,
        "room_type_code": "{ROOM_TYPE_CODE_AT_YOUR_SIDE}",
        "occupancy": {
          "adults": 1,
          "children": 0,
          "infants": 0
        },
        "guests": [
          {"name": "John", "surname": "Doe"}
        ],
        "days": [
          {
            "date": "2019-05-09",
            "price": "100.00",
            "rate_plan_code": "{RATE_PLAN_CODE_AT_YOUR_SIDE}"
          }
        ],
        "meta": {}
      }
    ],

    "services": [
      {
        "type": "Fee",
        "total_price": "100.00",
        "price_per_unit": "100.00",
        "price_mode": "Per stay",
        "persons": 0,
        "nights": 0,
        "name": "Cancellation Fee",
        "room_index": 0,
        "applicable_date": "2019-05-10"
      }
    ],
    
    "deposits": [
      {
        "amount": "100.00",
        "currency": "GBP",
        "charged_at": "2019-05-05 19:20:32.001023",
        "type": "credit_card",
        "notes": "Card ending 1234",
        "provider_meta": null
      }
    ],
    
    "meta": {}
  }
}
```

### Field description

**status `[required]`**\
String. Status of Booking, can be one of three values: `new`, `modified`, `cancelled`.

**provider\_code `[required]`**\
String. Your unique provider\_code. Under test, you should use value `OpenChannel`.

**hotel\_code `[required]`**\
String. Hotel Code used at Mapping details.

**ota\_name \[optional]**\
String. OTA Unique Code. Full list of codes is here - <https://docs.channex.io/api-v.1-documentation/channel-codes>.\
If your system passes bookings from 3rd party OTA, field is required.\
If your system provides bookings created by your own platform, you can ignore this field.

**reservation\_id `[optional]`**\
String. Booking unique ID. For messages with status `new` can be empty, in that case Channex will generate unique UUID for booking. If your system passes bookings from 3rd party OTA, you should provide original reservation ID.

**arrival\_date `[required]`**\
String. Arrival Date represented as string with date in ISO 8601 format by mask `YYYY-MM-DD`.

**departure\_date `[required]`**\
String. Departure Date represented as string with date in ISO 8601 format by mask `YYYY-MM-DD`.

**arrival\_hour `[optional]`**\
String. Arrival Time represented as string with time in `HH:MM` format at 24h.

**currency `[required]`**\
String. Booking currency code. 3 symbols long string with Currency Alphabetic code based at [ISO 4217](https://www.iso.org/iso-4217-currency-codes.html).

**payment\_collect `[optional]`**\
String. Information about payment collect point. If payment collected via OTA, it should be `ota`, in other case it should be `property`. Default value is `property`.

**payment\_type `[optional]`**\
String. Information about how payment should be collected. Support `bank_transfer` or `credit_card`. Can be `null` if not specified. `bank_transfer` value suitable for OTA collect case.

**notes `[optional]`**\
String. Guest notes or special request.

**meta `[optional]`**\
Object. Valid JSON object with free-form meta information. This field can be used to pass some additional information about booking.

### **Customer Fields**

Information about the Customer (Who made the booking)

**name `[optional]`**\
String with maximum length of 255 symbols. Name of Customer.

**surname `[required]`**\
String with maximum length of 255 symbols. Surname of Customer.

**country `[optional]`**\
String. 2 symbols long string with Country Alpha-2 code based at [ISO-3166-1](https://www.iso.org/iso-3166-country-codes.html).

**city `[optional]`**\
String with maximum length of 255 symbols. Customer City name.

**address `[optional]`**\
String with maximum length of 255 symbols. Customer Address.

**zip `[optional]`**\
String with maximum length of 32 symbols. Customer ZIP Code.

**mail `[optional]`**\
String with a valid email address. Customer Email address.

**phone `[optional]`**\
String with maximum length of 32 symbols. Can contain digits, spaces, brackets and special characters. Customer Phone number.

Please if possible pass in friendly format with country code like this example: +447749617211

This can be simple for the property to contact the guest.

**language `[optional]`**\
String. 2 symbols long string with language locale code.

**company `[optional]`**\
Object with information about Customer Company (if customer is Business). Can contain next fields:

* **title `[optional]`**\
  String with maximum length of 255 symbols.
* **number `[optional]`**\
  String with maximum length of 255 symbols. Tax Number.
* **number\_type `[optional]`**\
  String with maximum length of 255 symbols. Tax Name (eg: VAT)

**meta `[optional]`**\
Object without any specific structure where you can pass any additional information about Customer.

### Guarantee Fields

Information about the Credit Card.

{% hint style="warning" %}
If you'd like to pass information about the credit card you must use `secure-staging.channex.io` or `secure.channex.io` (for production environment) endpoints. Otherwise the credit card will be masked without ability to restore the original card.
{% endhint %}

**expiration\_date `[required]`**\
String with Card Expiration date in `MM/YYYY` format.

**cvv `[required]`**\
String with 3 or 4 numbers. Service code for payment systems.

**cardholder\_name `[required]`**\
String. Cardholder name from Card front.

**card\_type `[required]`**\
String. Card type name.

**card\_number `[required]`**\
String. Card number.

**meta `[optional]`**\
Object. Can contain any additional information for booking recipient. Also, if you work with Virtual Credit Cards, you can use next fields:

* **virtual\_card\_currency\_code**\
  Currency of virtual card
* **virtual\_card\_current\_balance**\
  Current balance of virtual card as Integer value
* **virtual\_card\_decimal\_places**\
  Info about decimal places at provided current\_balance field
* **virtual\_card\_effective\_date**\
  Date when card will be available to charge
* **virtual\_card\_expiration\_date**\
  Date when card is expired

### Booking Rooms

Booking rooms should be passed as Array of Objects. Each room object should contain information about `room_type_code`, `occupancy`, and days breakdown.

**index `[optional]`**\
Integer. Room Index to associate Services at Room level. Incremented value, start from 0.

**room\_type\_code `[required]`**\
String. Code of Room Type received at Get Rooms List operation.

**occupancy `[required]`**\
Object with information about occupancy. Should contain next fields:

* **adults `[required]`**\
  Integer. Count of adults (persons older then 16 years old)
* **children `[required]`**\
  Integer. Count of children (persons between 2 and 16 years old)
* **infants `[required]`**\
  Integer. Count of infants (persons younger then 2 years old)

**guests `[optional]`**\
Array with objects. Information about guest names.

**days `[required]`**\
Array with objects. Information about daily prices and rate plans. Keep in mind, our Open Channel API supports Mixed Rate Plans. Each object should contain next fields:

* **date `[required]`**\
  Date represented as string with date in ISO 8601 format by mask `YYYY-MM-DD`.
* **price `[required]`**\
  String or Integer. Price of room at specific date.
* **rate\_plan\_code `[required]`**\
  String. Rate Plan Code received at Get Rooms List operation.

**meta `[optional]`**\
Object without any specific structure where you can pass any additional information about Booking Room.

### Booking Services (Extras)

Services is Array of Objects to represent additional service or fees sold with bookings. Also, this field can contain Cancellation Fee when booking is cancelled with payment.\
Each object should contain next fields:

**excluded `[optional]`**\
Boolean. Is the service **not** included into the price of the room

true - We will add the fees from this service to the total of the booking

false - Booking total will be unaffected (Default)

**type `[required]`**\
String. Type of Service. One of possible values: `Meal, Fee, Extra`

**total\_price `[required]`**\
String. Total Service price.

**price\_per\_unit `[required]`**\
String. Price per one unit of Service.

**price\_mode `[required]`**\
String. Service calculation price logic. One of possible values: `Per stay, Per night, Per person, Per person per night`

**persons `[required]`**\
Integer. Count of persons associated with Service.

**nights `[required]`**\
Integer. Count of nights associated with Service.

**name `[required]`**\
String. Name of service.

**room\_index `[optional]`**\
Integer. Index of room which is associated with Service. Keep in mind, Room should have `index`.

**applicable\_date `[optional]`**\
ISO Date. Date when extra is applicable or should be served. Useful for meal extras or some rent-based extras.

### Deposits

Deposits is Array of Objects to represent charges for bookings.\
Each object should contain next fields:

**amount `[required]`**\
String or Positive Integer.

**currency `[required]`**\
String. Currency code.

**charged\_at `[optional]`**\
Timestamp to represent when charge was processed.

**type `[required]`**\
String. Free form type of payment. Example: `credit_card`, `cash`, `bank_transfer`.

**notes `[optional]`**\
String. Free form notes about deposit.

**provider\_meta `[optional]`**\
JSON. Meta field for information from Payment processor. Example: transaction object from Stripe.

### Booking Availability Check API

Before pushing a booking you can ask whether the stay is bookable. Send a POST request to the endpoint `/api/v1/channel_webhooks/open_channel/booking_availability_check` signed by the same API key header as Push Booking:

```
# headers
api-key: open_channel_api_key
```

The endpoint accepts **exactly the same message structure as Push Booking** — you can send the booking object you are about to push, verbatim, both as a single booking and as a batch (a list of bookings). Nothing is created: no booking, no side effects. The endpoint only answers whether the requested rooms could be booked at this moment.

```json
{
  "booking": {
    "status": "new",
    "provider_code": "YOUR_PROVIDER_CODE",
    "hotel_code": "YOUR_HOTEL_CODE",
    "arrival_date": "2026-09-01",
    "departure_date": "2026-09-03",
    "currency": "GBP",
    "customer": {...},
    "rooms": [
      {
        "room_type_code": "{ROOM_TYPE_CODE_AT_YOUR_SIDE}",
        "occupancy": {"adults": 2, "children": 0, "infants": 0},
        "days": [
          {"date": "2026-09-01", "price": "100.00", "rate_plan_code": "{RATE_PLAN_CODE_AT_YOUR_SIDE}"},
          {"date": "2026-09-02", "price": "100.00", "rate_plan_code": "{RATE_PLAN_CODE_AT_YOUR_SIDE}"}
        ]
      }
    ]
  }
}
```

#### Field description

The payload is validated by the same rules as Push Booking, so a payload passing the availability check will also pass Push Booking validation and vice versa. Only the following fields are actually used by the check:

**provider\_code `[required]`**\
String. Your unique provider\_code, same as at Push Booking.

**hotel\_code `[required]`**\
String. Hotel Code used at Mapping details. Unknown codes are rejected with `404 not_found`.

**status `[required]`**\
String. Must be `new` or `commit`. A pre-flight check is meaningless for modifications and cancellations, so `modify`, `modified`, `cancel` and `cancelled` are rejected with `422 validation_error`.

**arrival\_date / departure\_date `[required]`**\
String. Dates in ISO 8601 format (`YYYY-MM-DD`), define the stay being checked.

**rooms `[required]`**\
Array. For each room the `room_type_code` and the `rate_plan_code` from `days` are resolved through your mapping; unknown combinations are rejected with `422 validation_error`. Rooms requesting the same rate plan are checked together against the remaining inventory.

All other fields (customer, guarantee, services, deposits, prices, meta and so on) are accepted and ignored, so you can reuse the Push Booking payload without changes. **Prices are not verified.**

{% hint style="warning" %}
`guarantee` should be `null` in availability check requests. Unlike Push Booking, this endpoint is not served through the `secure` domain and does not store credit cards at our PCI Storage, so never send credit card details here — strip the `guarantee` object from the payload before checking availability.
{% endhint %}

#### Response

A well-formed request is always answered with status `200`, whether the stay is bookable or not — availability is expressed by the `available` fields. The response carries one entry per requested room, in request order, each with its own `available` flag.

Bookable:

```json
{
  "success": true,
  "available": true,
  "rooms": [
    {"index": 0, "room_type_code": "DBL", "rate_plan_code": "BAR", "available": true}
  ]
}
```

Not bookable — `available: false` on the rooms that cannot be booked:

```json
{
  "success": true,
  "available": false,
  "rooms": [
    {"index": 0, "room_type_code": "DBL", "rate_plan_code": "BAR", "available": false},
    {"index": 1, "room_type_code": "TWN", "rate_plan_code": "BAR", "available": true}
  ]
}
```

Top level `available` is `true` only when every room is available. For a batch request the response contains a `bookings` array instead of `rooms`, one entry per booking in request order, each with its own `index`, `available` flag and `rooms` list.

A room is reported as not available when any restriction blocks the stay: no units left, stop sell, closed to arrival / departure, or a min / max stay violation. The response does not say which restriction fired.

#### Errors

Error statuses are reserved for malformed requests; "not available" is a successful `200` answer.

<table><thead><tr><th width="93.1796875">Status</th><th>Code</th><th>When</th></tr></thead><tbody><tr><td><code>400</code></td><td><code>argument_error</code></td><td>Payload fails booking validation (the same request would also fail Push Booking)</td></tr><tr><td><code>403</code></td><td><code>forbidden</code></td><td>Invalid <code>api-key</code> header</td></tr><tr><td><code>404</code></td><td><code>not_found</code></td><td>Unknown <code>hotel_code</code></td></tr><tr><td><code>422</code></td><td><code>validation_error</code></td><td>Malformed payload, unknown <code>provider_code</code>, unmapped <code>room_type_code</code>/<code>rate_plan_code</code>, or <code>status</code> not <code>new</code>/<code>commit</code></td></tr><tr><td><code>503</code></td><td><code>internal_error</code></td><td>Provider is not ready</td></tr><tr><td><code>503</code></td><td><code>service_unavailable</code></td><td>Temporary internal failure — retry later</td></tr></tbody></table>

{% hint style="warning" %}
The check is advisory only: nothing is put on hold between the availability check and a subsequent Push Booking, so a positive answer can go stale if someone else books the room in between.
{% endhint %}

{% hint style="info" %}
Bookability is evaluated per rate plan. Rooms requesting the same rate plan are checked together against the remaining inventory; rooms on different rate plans — even of the same room type — are checked independently. Prices are not verified. No dedicated rate limit applies to this endpoint beyond the general one.
{% endhint %}

## Request Full Sync

Sometimes, you would like to request Property to send full information about Restrictions and Availability. To trigger this action you can use our `request_full_sync` method.

```json
POST https://staging.channex.io/api/v1/channel_webhooks/open_channel/request_full_sync
# headers
api-key: open_channel_api_key

# body
{
  "provider_code": "YOUR_PROVIDER_CODE",
  "hotel_code": "HOTEL_CODE"
}
```
