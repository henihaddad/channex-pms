<!-- https://docs.channex.io/api-v.1-documentation/bookings-collection.md -->
> For the complete documentation index, see [llms.txt](https://docs.channex.io/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://docs.channex.io/api-v.1-documentation/bookings-collection.md).

# Bookings Collection

API methods to work with bookings

At Channex we have several different methods to work with **Bookings**, such as List of Bookings, Booking Revision Feed and etc.

Each Booking at Channex is a representation of latest known Booking Revision, where Booking Revision is parsed and normalised message from OTA.

If you would like build a PMS integration, you should use the [Booking Revision Feed API](#booking-revisions-feed), to fetch booking messages and modify bookings at your side. For initial pull, you can use Booking List API or Booking Revision Feed.

## Message Structures

### Booking Revision

**id**\
Unique Booking Revision identification record at Channex internal system

**property\_id**\
ID of associated Property.

**booking\_id**\
ID of associated Booking.

**unique\_id**\
Unique Booking identification record combined from OTA Code and OTA Reservation Code. Usually this value is same for all booking revisions.

**system\_id**\
Unique message identification record at Booking Source platform, unique per revision. Used to detect have we that message or not.

**ota\_reservation\_code**\
Original Reservation Code at platform, where guest create booking. Usually same for all booking revisions. Unique per booking message.

**ota\_name**\
Name of OTA where booking was originally created

**status**\
Status of Booking Revision, can be one of three values: `new`, `modified`, `cancelled`.

**rooms**\
List of Booking Room objects.

**services**\
List of Booking Service objects.

**guarantee**\
Guarantee details object. Represent credit card provided with booking.

**customer**\
Object with information about Customer.

**occupancy**\
Object with information about total Booking Occupancy, provide three keys: `adults`, `children` and `infants`.

**arrival\_date**\
Arrival Date represented as string with date in ISO 8601 format by mask `YYYY-MM-DD`.

**departure\_date**\
Departure Date represented as string with date in ISO 8601 format by mask `YYYY-MM-DD`.

**arrival\_hour**\
Arrival Time represented as string with time in `HH:MM` format at 24h.

**amount**\
Total booking amount.

**currency**\
Booking currency code.

**notes**\
Customer notes for booking.

**payment\_collect**\
Information about ***who*** should collect Payment. Can be `property` if payment should be collected by property, `ota` if guest already pay at OTA and `null` if value is not specified. Usually `null` mean that property will collect payment.

**payment\_type**\
Information about ***how*** payment should be collected. Can be `credit_card` if booking have associated credit card for payment, `bank_transfer` if OTA will pass payment through Bank Transfer, and `null` if payment type is not specified.

**ota\_commission**\
Information about commission amount charged by OTA. Currently available for Booking.com and Airbnb channels.

**inserted\_at**\
Timestamp, when Booking Revision was received at Channex.io

### Booking Room

**checkin\_date**\
Checkin Date represented as string with date in ISO 8601 format by mask `YYYY-MM-DD`.

**checkout\_date**\
Checkout Date represented as string with date in ISO 8601 format by mask `YYYY-MM-DD`.

**rate\_plan\_id**\
Associated Rate Plan identification record. Null value if the room is not mapped.

**room\_type\_id**\
Associated Room Type identification record. Null if the room is not mapped.

**occupancy**\
Object with information about Booking Room Occupancy, provide three keys: `adults`, `children` and `infants`.\
If `children` count is not 0, `occupancy` object will contain list `ages` with information about children ages:

```
{
  "adults": 1,
  "children": 1,
  "infants": 0,
  "ages": [5]
}
```

**guests**\
List with objects of guests info. Will contain name and surname of guest if it is available for specific OTA.

**services**\
List with associated services (same as [Booking Service](https://docs.channex.io/api-v.1-documentation/bookings-collection#booking-service), but at Room level).

**taxes**\
List with information about associated taxes.

**collected\_taxes&#x20;**<mark style="color:$primary;">**\[NEW]**</mark>\
List with information about taxes what was already collected by OTA.\
Applicable only for Booking.com.

**amount**\
Total Booking Room amount

**days**\
Price breakdown per day of stay.\
Have next structure:

```javascript
"days": {
  "2019-05-09": "100.00"
}
```

**meta**\
Free form meta information associated with room in JSON format.\
Can contain `parent_rate_plan_id` which point to real rate plan ID when booking room associated with derived rate plan or Occupancy option.

**ota\_unique\_id**\
String. Unique room ID at OTA side.\
Available only for limited count of OTAs (right now only Booking.com supported).

### Booking Service

**name**\
String value with service name in English language

**type**\
String value with service type (e.g. `Breakfast`, `Internet`, `Parking`).

**nights**\
Integer value represents number of nights this customer has booked the service for.

**persons**\
Integer number represents number of persons this service is booked for

**price\_mode**\
String value with Price mode value (per stay, per night, per person per night).

**price\_per\_unit**\
Numeric value represented as String with unitary price for this service

**total\_price**\
Numeric value represented as String with total calculated price for this service.

### **Guarantee**

This object represent information about credit card provided as payment guarantee.

**Example:**

```javascript
{
  "card_number": "411111******1111",
  "card_type": "MC",
  "cardholder_name": "Bookingcom Agent",
  "cvv": "***",
  "expiration_date": "12/2021",
  "is_virtual": true,
  "meta": {
    "virtual_card_currency_code": "EUR",
    "virtual_card_current_balance": "6755",
    "virtual_card_decimal_places": "2",
    "virtual_card_effective_date": "2020-09-12",
    "virtual_card_expiration_date": "2021-09-12"
  }
}
```

**card\_number**\
Masked credit card number

**card\_type**\
Card type code.\
List of supported codes:

| Code    | Description                        |
| ------- | ---------------------------------- |
| unknown | Card code is not exists            |
| `AX`    | American Express                   |
| `BC`    | Bank Card                          |
| `BL`    | Carte Bancaire                     |
| `CU`    | Unionpay Credit Card               |
| `DN`    | Diners Club                        |
| `DS`    | Discover Card                      |
| `EL`    | Elo                                |
| `JC`    | Japanese Credit Bureau Credit Card |
| `MA`    | Maestro                            |
| `MC`    | Master Card                        |
| `MI`    | NSPK MIR                           |
| `VI`    | Visa                               |

**cardholder\_name**\
Cardholder name

**cvv**\
Masked CVV / CVC. For non-secure connections always equal to `***`

**expiration\_date**\
Credit card expiration date in `MM/YYYY` format

**is\_virtual**\
Boolean flag to represent virtual credit cards

**meta**\
Object with additional information about credit card.\
Please, keep in mind, this value available only for Booking.com bookings right now and some Expedia bookings.\
\- **virtual\_card\_currency\_code**\
Currency of virtual credit card\
\- **virtual\_card\_current\_balance**\
Information about initial balance on virtual credit card.\
Represented as String value.\
\- **virtual\_card\_decimal\_places**\
Count of decimal places at provided balance value\
\- **virtual\_card\_effective\_date**\
Date, when virtual credit card will be active for charges\
\- **virtual\_card\_expiration\_date**\
Virtual credit card expiration date

### Taxes

Information about Taxes associated with Booking Room.

**Example:**

```javascript
[
  {
    "is_inclusive": false,
    "name": "Additional Guest Fee",
    "total_price": "29.57",
    "type": "fee"
  }
]
```

**is\_inclusive**\
Boolean marker to show included tax into Room Price or not.

**name**\
Name of tax

**total\_price**\
Total price of tax

**type**\
Represent type of tax (`fee`, `tax`, `city_tax`).

### Collected Taxes

{% hint style="info" %}
Collected Taxes is also known as Withheld Taxes.\
This is Taxes what is collected by OTA side.

Right now this feature applicable only for Booking.com
{% endhint %}

**Example:**

```json
{
    "is_inclusive": false,
    "is_withheld": true,
    "name": "CITY_TAX (Withheld Tax) (7.20%)",
    "nights": 5,
    "persons": 3,
    "price_mode": "Per booking",
    "price_per_unit": "23.04",
    "total_price": "23.04",
    "type": "City Tax",
    "version": 2
}
```

## Notes about Guarantee details

{% hint style="danger" %}
Channex returns and receives information about Credit Card only to / from certified PCI DSS partners.
{% endhint %}

Following PCI DSS rules and security standards at industry, Channex pass PCI DSS certification and handle Credit Card information at secure mode.

If your application would like to receive information about Credit Cards you should change your target endpoint to receive bookings from `staging.channex.io` to `secure-staging.channex.io`. At production environment, you should use `secure.channex.io` endpoint.

Before you start use secure endpoint, please contact with us through <support@channex.io> and provide us list of your IP address that should be white-listed and your PCI DSS certificate.

## Bookings List

Retrieve list of Bookings associated with User Channels.

{% tabs %}
{% tab title="Request" %}
Request:

```
GET https://staging.channex.io/api/v1/bookings
```

{% endtab %}

{% tab title="Success Response" %}
**Success Response Example**

Status Code: `200 OK`

```javascript
{
  "data": [
    {
      "type": "booking",
      "id": "603e8e9e-cc67-4ca7-bd13-3c407c6c3bbd",
      "attributes": {
        "id": "603e8e9e-cc67-4ca7-bd13-3c407c6c3bbd",
        "property_id": "716305c4-561a-4561-a187-7f5b8aeb5920",
        "revision_id": "03dd7198-c5b7-493c-a889-74d0c2211de7",
        "unique_id": "BDC-1556013801",
        "ota_reservation_code": "1556013801",
        "ota_name": "Booking.com",
        "status": "new",
        "rooms": [
          {
            "amount": "200.00",
            "checkin_date": "2019-04-26",
            "checkout_date": "2019-04-27",
            "rate_plan_id": "445835fb-7956-42ac-9efc-3e6f331f0808",
            "room_type_id": "994d1375-dbbd-4072-8724-b2ab32ce781b",
            "ota_unique_id": "49",
            "days": {
              "2019-04-26": "200.00"
            },
            "occupancy": {
              "adults": 2,
              "children": 0,
              "infants": 0
            }
          }
        ],
        "services": [
          {
            "type": "Breakfast",
            "total_price": "20.00",
            "price_per_unit": "10.00",
            "price_mode": "Per person per night",
            "persons": 2,
            "nights": 1,
            "name": "Breakfast"
          }
        ],
        "guarantee": {
          "expiration_date": "10/2020",
          "cvv": "***",
          "cardholder_name": "Channex User",
          "card_type": "VI",
          "card_number": "411111******1111"
        },
        "customer": {
          "zip": "2031 BE",
          "surname": "Channex",
          "phone": "1234567890",
          "name": "User",
          "mail": "user@channex.io",
          "language": "en",
          "country": "NL",
          "city": "Haarlem",
          "address": "JW Lucasweg 35",
          "company": {
            "title": "Company Name",
            "number": "1123331",
            "number_type": "VAT",
            "type": "Registration Number"
          }
        },
        "occupancy": {
          "adults": 2,
          "children": 0,
          "infants": 0
        },
        "arrival_date": "2019-04-26",
        "departure_date": "2019-04-27",
        "arrival_hour": "10:00",
        "amount": "220.00",
        "ota_commission": "10.00",
        "currency": "GBP",
        "notes": "You have a booker that would like free parking. (based on availability)\nYou have a booker that would prefer a quiet room. (based on availability)",
        "inserted_at": "2019-04-23T10:03:29.335485"
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

### Pagination and Filters

By default, this method returns the first 10 element. To get more details, you should use [Pagination](https://docs.channex.io/api-v.1-documentation/api-reference#pagination) arguments.\
Information about the count of entities and current pagination position contained at `meta` section at response object.

#### Filter Examples

{% tabs %}
{% tab title="Filter By Arrival Date" %}

```
GET https://staging.channex.io/api/v1/bookings?filter[arrival_date][gte]=2021-01-01&filter[arrival_date][lte]=2021-02-01
```

{% endtab %}

{% tab title="Filter By Departure Date" %}

```
GET https://staging.channex.io/api/v1/bookings?filter[departure_date][gte]=2021-01-01&filter[departure_date][lte]=2021-02-01
```

{% endtab %}

{% tab title="Filter By Booking Date" %}

```
GET https://staging.channex.io/api/v1/bookings?filter[inserted_at][gte]=2021-01-01T00:00:00&filter[inserted_at][lte]=2021-02-01T00:00:00
```

{% endtab %}
{% endtabs %}

### Returns

**Success**\
Method can return a Success result with `200 OK` HTTP Code if operation is successful. Will contain a list of Booking objects in the answer.\
\
**Unauthorised Error**\
Method can return a Unauthorised Error result with `401 Unauthorized` HTTP Code if wrong API Key provided.

## Get Booking By ID

Retrieve specific Booking by ID. The response will be the latest booking revision details.

{% tabs %}
{% tab title="Request" %}
Request:

```
GET https://staging.channex.io/api/v1/bookings/:id
```

{% endtab %}

{% tab title="Success Response" %}
**Success Response Example**

Status Code: `200 OK`

```javascript
{
  "data": {
    "type": "booking",
    "id": "603e8e9e-cc67-4ca7-bd13-3c407c6c3bbd",
    "attributes": {
      "id": "603e8e9e-cc67-4ca7-bd13-3c407c6c3bbd",
      "revision_id": "03dd7198-c5b7-493c-a889-74d0c2211de7",
      "unique_id": "BDC-9996013801",
      "ota_reservation_code": "9996013801",
      "ota_name": "Booking.com",
      "status": "new",
      "rooms": [
        {
          "amount": "200.00",
          "checkin_date": "2019-04-26",
          "checkout_date": "2019-04-27",
          "rate_plan_id": "445835fb-7956-42ac-9efc-3e6f331f0808",
          "room_type_id": "994d1375-dbbd-4072-8724-b2ab32ce781b",
          "ota_unique_id": "49",
          "days": {
            "2019-04-26": "200.00"
          },
          "occupancy": {
            "adults": 2,
            "children": 0,
            "infants": 0
          }
        }
      ],
      "services": [
        {
          "type": "Breakfast",
          "total_price": "20.00",
          "price_per_unit": "10.00",
          "price_mode": "Per person per night",
          "persons": 2,
          "nights": 1,
          "name": "Breakfast"
        }
      ],
      "guarantee": {
        "expiration_date": "10/2020",
        "cvv": "***",
        "cardholder_name": "Channex User",
        "card_type": "VI",
        "card_number": "411111******1111"
      },
      "customer": {
        "zip": "2031 BE",
        "surname": "Channex",
        "phone": "1234567890",
        "name": "User",
        "mail": "user@channex.io",
        "language": "en",
        "country": "NL",
        "city": "Haarlem",
        "address": "JW Lucasweg 35",
        "company": {
          "title": "Company Name",
          "number": "1123331",
          "number_type": "VAT",
          "type": "Registration Number"
        }
      },
      "occupancy": {
        "adults": 2,
        "children": 0,
        "infants": 0
      },
      "arrival_date": "2019-04-26",
      "departure_date": "2019-04-27",
      "arrival_hour": "10:00",
      "amount": "220.00",
      "ota_commission": "10.00",
      "currency": "GBP",
      "notes": "You have a booker that would like free parking. (based on availability)\nYou have a booker that would prefer a quiet room. (based on availability)",
      "inserted_at": "2019-04-23T10:03:29.335485"
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
Method can return a Success result with `200 OK` HTTP Code if operation is successful. Will contain a Booking object in the answer.\
\
**Unauthorised Error**\
Method can return a Unauthorised Error result with `401 Unauthorized` HTTP Code if wrong API Key provided.

**Not Found Error**\
Method can return a Not Found Error result with `404 Not Found` HTTP Code if Booking with provided ID is not present at system.

## Booking Revisions List

Retrieve list of Booking Revisions associated with User Channels.

{% tabs %}
{% tab title="Request" %}
Request:

```
GET https://staging.channex.io/api/v1/booking_revisions
```

{% endtab %}

{% tab title="Success Response" %}
**Success Response Example**

Status Code: `200 OK`

```javascript
{
  "meta": {
    "total": 1,
    "page": 1,
    "limit": 10
  },
  "data": [
    {
      "type": "booking_revision",
      "id": "03dd7198-c5b7-493c-a889-74d0c2211de7",
      "attributes": {
        "id": "03dd7198-c5b7-493c-a889-74d0c2211de7",
        "property_id": "716305c4-561a-4561-a187-7f5b8aeb5920",
        "booking_id": "cfa33f3b-bd32-4b90-8ef9-bde2bfe986cd",
        "unique_id": "BDC-9996013801",
        "system_id": "12331233123",
        "ota_reservation_code": "9996013801",
        "ota_name": "Booking.com",
        "status": "new",
        "rooms": [
          {
            "amount": "200.00",
            "checkin_date": "2019-04-26",
            "checkout_date": "2019-04-27",
            "rate_plan_id": "445835fb-7956-42ac-9efc-3e6f331f0808",
            "room_type_id": "994d1375-dbbd-4072-8724-b2ab32ce781b",
            "ota_unique_id": "49",
            "days": {
              "2019-04-26": "200.00"
            },
            "occupancy": {
              "adults": 2,
              "children": 0,
              "infants": 0
            }
          }
        ],
        "services": [
          {
            "type": "Breakfast",
            "total_price": "20.00",
            "price_per_unit": "10.00",
            "price_mode": "Per person per night",
            "persons": 2,
            "nights": 1,
            "name": "Breakfast"
          }
        ],
        "guarantee": {
          "expiration_date": "10/2020",
          "cvv": "***",
          "cardholder_name": "Channex User",
          "card_type": "VI",
          "card_number": "411111******1111"
        },
        "customer": {
          "zip": "2031 BE",
          "surname": "Channex",
          "phone": "1234567890",
          "name": "User",
          "mail": "user@channex.io",
          "language": "en",
          "country": "NL",
          "city": "Haarlem",
          "address": "JW Lucasweg 35",
          "company": {
            "title": "Company Name",
            "number": "1123331",
            "number_type": "VAT",
            "type": "Registration Number"
          }
        },
        "occupancy": {
          "adults": 2,
          "children": 0,
          "infants": 0
        },
        "arrival_date": "2019-04-26",
        "departure_date": "2019-04-27",
        "arrival_hour": "10:00",
        "amount": "220.00",
        "ota_commission": "10.00",
        "currency": "GBP",
        "notes": "You have a booker that would like free parking. (based on availability)\nYou have a booker that would prefer a quiet room. (based on availability)",
        "inserted_at": "2019-04-23T10:03:29.335485"
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
Method can return a Success result with `200 OK` HTTP Code if operation is successful. Will contain a list of Booking Revision objects in the answer.\
\
**Unauthorised Error**\
Method can return a Unauthorised Error result with `401 Unauthorized` HTTP Code if wrong API Key provided.

## Booking Revisions Feed

Retrieve a list of not acknowledged booking revisions. This should be your primary way to get bookings from Channex.

{% hint style="info" %}
When you successfully get a booking via this method make sure you [acknowledge the booking](#acknowledge-booking-revision-receiving). Once you have acknowledged a booking this booking revision will not be provided in the feed again.
{% endhint %}

{% hint style="danger" %}
PMS is expected to Ack all bookings from Channex. To not ack bookings for any reason will mean the booking will be consistently provided for 30 minutes and then you will receive an email warning booking was not acknowledged.
{% endhint %}

{% tabs %}
{% tab title="Request" %}
Request:

```
GET https://staging.channex.io/api/v1/booking_revisions/feed
```

{% endtab %}

{% tab title="Success Response" %}
**Success Response Example**

Status Code: `200 OK`

```javascript
{
  "meta": {
    "total": 1,
    "page": 1,
    "limit": 10
  },
  "data": [
    {
      "type": "booking_revision",
      "id": "03dd7198-c5b7-493c-a889-74d0c2211de7",
      "attributes": {
        "id": "03dd7198-c5b7-493c-a889-74d0c2211de7",
        "property_id": "716305c4-561a-4561-a187-7f5b8aeb5920",
        "booking_id": "cfa33f3b-bd32-4b90-8ef9-bde2bfe986cd",
        "unique_id": "BDC-9996013801",
        "system_id": "12331233123",
        "ota_reservation_code": "9996013801",
        "ota_name": "Booking.com",
        "status": "new",
        "rooms": [
          {
            "amount": "200.00",
            "checkin_date": "2019-04-26",
            "checkout_date": "2019-04-27",
            "rate_plan_id": "445835fb-7956-42ac-9efc-3e6f331f0808",
            "room_type_id": "994d1375-dbbd-4072-8724-b2ab32ce781b",
            "ota_unique_id": "49",
            "days": {
              "2019-04-26": "200.00"
            },
            "occupancy": {
              "adults": 2,
              "children": 0,
              "infants": 0
            }
          }
        ],
        "services": [
          {
            "type": "Breakfast",
            "total_price": "20.00",
            "price_per_unit": "10.00",
            "price_mode": "Per person per night",
            "persons": 2,
            "nights": 1,
            "name": "Breakfast"
          }
        ],
        "guarantee": {
          "expiration_date": "10/2020",
          "cvv": "***",
          "cardholder_name": "Channex User",
          "card_type": "VI",
          "card_number": "411111******1111"
        },
        "customer": {
          "zip": "2031 BE",
          "surname": "Channex",
          "phone": "1234567890",
          "name": "User",
          "mail": "user@channex.io",
          "language": "en",
          "country": "NL",
          "city": "Haarlem",
          "address": "JW Lucasweg 35",
          "company": {
            "title": "Company Name",
            "number": "1123331",
            "number_type": "VAT",
            "type": "Registration Number"
          }
        },
        "occupancy": {
          "adults": 2,
          "children": 0,
          "infants": 0
        },
        "arrival_date": "2019-04-26",
        "departure_date": "2019-04-27",
        "arrival_hour": "10:00",
        "amount": "220.00",
        "currency": "GBP",
        "notes": "You have a booker that would like free parking. (based on availability)\nYou have a booker that would prefer a quiet room. (based on availability)",
        "inserted_at": "2019-04-23T10:03:29.335485"
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

### Note

If all Booking Revision is acknowledged this request will return an empty result.

{% hint style="info" %}
If you want to get feed for a certain property you can use a filter:

```
GET https://staging.channex.io/api/v1/booking_revisions/feed?filter[property_id]=PROPERTY_ID

```

{% endhint %}

{% hint style="info" %}
You can order the revisions received from feed endpoint by the oldest first.

`GET https://staging.channex.io/api/v1/booking_revisions/feed?order[inserted_at]=asc`
{% endhint %}

### Returns

**Success**\
Method can return a Success result with `200 OK` HTTP Code if operation is successful. Will contain a list of Booking Revision objects in the answer.\
\
**Unauthorised Error**\
Method can return a Unauthorised Error result with `401 Unauthorized` HTTP Code if wrong API Key provided.

## Get Booking Revision by ID

Retrieve specific Booking Revision by ID.

{% tabs %}
{% tab title="Request" %}
Request:

```
GET https://staging.channex.io/api/v1/booking_revisions/:id
```

{% endtab %}

{% tab title="Success Response" %}
**Success Response Example**

Status Code: `200 OK`

```javascript
{
  "data": {
    "type": "booking_revision",
    "id": "03dd7198-c5b7-493c-a889-74d0c2211de7",
    "attributes": {
      "id": "03dd7198-c5b7-493c-a889-74d0c2211de7",
      "property_id": "716305c4-561a-4561-a187-7f5b8aeb5920",
      "booking_id": "cfa33f3b-bd32-4b90-8ef9-bde2bfe986cd",
      "unique_id": "BDC-9996013801",
      "system_id": "12331233123",
      "ota_reservation_code": "9996013801",
      "ota_name": "Booking.com",
      "status": "new",
      "rooms": [
        {
          "amount": "200.00",
          "checkin_date": "2019-04-26",
          "checkout_date": "2019-04-27",
          "rate_plan_id": "445835fb-7956-42ac-9efc-3e6f331f0808",
          "room_type_id": "994d1375-dbbd-4072-8724-b2ab32ce781b",
          "ota_unique_id": "49",
          "days": {
            "2019-04-26": "200.00"
          },
          "occupancy": {
            "adults": 2,
            "children": 0,
            "infants": 0
          }
        }
      ],
      "services": [
        {
          "type": "Breakfast",
          "total_price": "20.00",
          "price_per_unit": "10.00",
          "price_mode": "Per person per night",
          "persons": 2,
          "nights": 1,
          "name": "Breakfast"
        }
      ],
      "guarantee": {
        "expiration_date": "10/2020",
        "cvv": "***",
        "cardholder_name": "Channex User",
        "card_type": "VI",
        "card_number": "411111******1111"
      },
      "customer": {
        "zip": "2031 BE",
        "surname": "Channex",
        "phone": "1234567890",
        "name": "User",
        "mail": "user@channex.io",
        "language": "en",
        "country": "NL",
        "city": "Haarlem",
        "address": "JW Lucasweg 35",
        "company": {
          "title": "Company Name",
          "number": "1123331",
          "number_type": "VAT",
          "type": "Registration Number"
        }
      },
      "occupancy": {
        "adults": 2,
        "children": 0,
        "infants": 0
      },
      "arrival_date": "2019-04-26",
      "departure_date": "2019-04-27",
      "arrival_hour": "10:00",
      "amount": "220.00",
      "ota_commission": "10.00",
      "currency": "GBP",
      "notes": "You have a booker that would like free parking. (based on availability)\nYou have a booker that would prefer a quiet room. (based on availability)",
      "inserted_at": "2019-04-23T10:03:29.335485"
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
Method can return a Success result with `200 OK` HTTP Code if operation is successful. Will contain a Booking Revision object in the answer.\
\
**Unauthorised Error**\
Method can return a Unauthorised Error result with `401 Unauthorized` HTTP Code if wrong API Key provided.

**Not Found Error**\
Method can return a Not Found Error result with `404 Not Found` HTTP Code if Booking Revision with provided ID is not present at system.

## Acknowledge Booking Revision receiving

Confirm receiving Booking Revision by creating an Acknowledge record.

{% tabs %}
{% tab title="Request" %}
Request:

```
POST https://staging.channex.io/api/v1/booking_revisions/:id/ack
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
Method can return a Success result with `200 OK` HTTP Code if operation is successful.\
\
**Unauthorised Error**\
Method can return a Unauthorised Error result with `401 Unauthorized` HTTP Code if wrong API Key provided.

**Not Found Error**\
Method can return a Not Found Error result with `404 Not Found` HTTP Code if Booking Revision with provided ID is not present at system.

## Booking Message Examples

### Booking.com examples

{% tabs %}
{% tab title="New Booking" %}

```javascript
{
  "data": {
    "attributes": {
      "amount": "153.00",
      "ota_commission": "10.00",
      "arrival_date": "2020-11-13",
      "arrival_hour": null,
      "currency": "GBP",
      "customer": {
        "address": null,
        "city": ".",
        "company": null,
        "country": "GB",
        "language": null,
        "mail": "customer_email@guest.booking.com",
        "meta": {
          "is_genius": false
        },
        "name": "Name",
        "phone": "Custom Phone",
        "surname": "Surname",
        "zip": null
      },
      "departure_date": "2020-11-15",
      "guarantee": {
        "card_number": "411111******1111",
        "card_type": "VI",
        "cardholder_name": "CARDHOLDER NAME",
        "cvv": "***",
        "expiration_date": "11/2021",
        "is_virtual": false
      },
      "id": "3e029821-d446-45e9-8394-42d78a3aa1b1",
      "inserted_at": "2020-11-12T11:39:50.111087",
      "notes": null,
      "occupancy": {
        "adults": 2,
        "children": 0,
        "infants": 0
      },
      "ota_name": "BookingCom",
      "ota_reservation_code": "3333333333",
      "payment_collect": null,
      "payment_type": null,
      "property_id": "57b92389-1878-4772-9f0d-47e31d22609f",
      "revision_id": "2399140e-4673-427a-bb40-0074d917d21f",
      "rooms": [
        {
          "amount": "153.00",
          "booking_room_id": "d0f5a93b-12ba-40b5-a134-48bbf1c77532",
          "checkin_date": "2020-11-13",
          "checkout_date": "2020-11-15",
          "ota_unique_id": "49",
          "days": {
            "2020-11-13": "76.50",
            "2020-11-14": "76.50"
          },
          "guests": [
            {
              "name": "Guest Name",
              "surname": "Guest Surname"
            }
          ],
          "meta": {
            "additional_details": [],
            "booking_com_room_index": 875,
            "cancel_penalties": [
              {
                "amount": "0.00",
                "currency": "GBP",
                "from": "2020-11-09T17:32:51"
              },
              {
                "amount": "76.50",
                "currency": "GBP",
                "from": "2020-11-12T00:00:00"
              }
            ],
            "days_breakdown": [
              {
                "amount": "76.50",
                "date": "2020-11-13",
                "promotion": {
                  "id": "71591484",
                  "title": "genius rate"
                },
                "rate_code": 117855,
                "rate_plan": "785360cd-6ddb-430b-b31e-be3a2e9662a1"
              },
              {
                "amount": "76.50",
                "date": "2020-11-14",
                "promotion": {
                  "id": "71591484",
                  "title": "genius rate"
                },
                "rate_code": 117855,
                "rate_plan": "785360cd-6ddb-430b-b31e-be3a2e9662a1"
              }
            ],
            "meal_plan": "Breakfast is included in the room rate.",
            "policies": "Children and Extra Bed Policy: All children are welcome. All children under 3 years stay free of charge when using existing beds. All children from 3 to 18 years are charged  GBP 10 per night when using existing beds. There is no capacity for extra beds in the room. The maximum number of total guests in a room is 2. There is no capacity for cots in the room.  Deposit Policy: No prepayment is needed.  Cancellation Policy: The guest can cancel free of charge until 1 day before arrival. The guest will be charged the cost of the first night if they cancel within 1 day before arrival.",
            "promotion": [
              {
                "from_code": "0",
                "from_name": "genius rate",
                "promotion_id": "71591484",
                "to_code": "117855"
              }
            ],
            "rate_plan_code": 117855,
            "room_remarks": [],
            "room_type_code": "3636404",
            "smoking_preferences": null
          },
          "occupancy": {
            "adults": 2,
            "children": 0,
            "infants": 0
          },
          "rate_plan_id": "785360cd-6ddb-430b-b31e-be3a2e9662a1",
          "room_type_id": "e2a15383-7843-4240-adda-736608d72eca",
          "services": [],
          "taxes": [
            {
              "is_inclusive": true,
              "name": "VAT (5%)",
              "nights": 2,
              "persons": 2,
              "price_mode": "Per booking",
              "price_per_unit": "7.29",
              "total_price": "7.29",
              "type": "Value Added Tax (VAT)"
            }
          ]
        }
      ],
      "services": [],
      "status": "new",
      "unique_id": "BDC-3333333333"
    },
    "id": "3e029821-d446-45e9-8394-42d78a3aa1b1",
    "type": "booking"
  }
}
```

{% endtab %}

{% tab title="Booking Modification" %}

```javascript
{
  "data": {
    "attributes": {
      "amount": "153.00",
      "ota_commission": "10.00",
      "arrival_date": "2020-11-13",
      "arrival_hour": null,
      "currency": "GBP",
      "customer": {
        "address": null,
        "city": ".",
        "company": null,
        "country": "GB",
        "language": null,
        "mail": "customer_email@guest.booking.com",
        "meta": {
          "is_genius": false
        },
        "name": "New Customer Name",
        "phone": "Custom Phone",
        "surname": "New Customer Surname",
        "zip": null
      },
      "departure_date": "2020-11-15",
      "guarantee": {
        "card_number": "411111******1111",
        "card_type": "VI",
        "cardholder_name": "CARDHOLDER NAME",
        "cvv": "***",
        "expiration_date": "11/2021",
        "is_virtual": false
      },
      "id": "3e029821-d446-45e9-8394-42d78a3aa1b1",
      "inserted_at": "2020-11-12T11:39:50.111087",
      "notes": null,
      "occupancy": {
        "adults": 2,
        "children": 0,
        "infants": 0
      },
      "ota_name": "BookingCom",
      "ota_reservation_code": "3333333333",
      "payment_collect": null,
      "payment_type": null,
      "property_id": "57b92389-1878-4772-9f0d-47e31d22609f",
      "revision_id": "2399140e-4673-427a-bb40-0074d917d21f",
      "rooms": [
        {
          "amount": "153.00",
          "booking_room_id": "5c0a93d1-10f8-4871-bd30-a850c3d98e9b",
          "checkin_date": "2020-11-13",
          "checkout_date": "2020-11-15",
          "ota_unique_id": "49",
          "days": {
            "2020-11-13": "76.50",
            "2020-11-14": "76.50"
          },
          "guests": [
            {
              "name": "Guest Name",
              "surname": "Guest Surname"
            }
          ],
          "meta": {
            "additional_details": [],
            "booking_com_room_index": 875,
            "cancel_penalties": [
              {
                "amount": "0.00",
                "currency": "GBP",
                "from": "2020-11-09T17:32:51"
              },
              {
                "amount": "76.50",
                "currency": "GBP",
                "from": "2020-11-12T00:00:00"
              }
            ],
            "days_breakdown": [
              {
                "amount": "76.50",
                "date": "2020-11-13",
                "promotion": {
                  "id": "71591484",
                  "title": "genius rate"
                },
                "rate_code": 117855,
                "rate_plan": "785360cd-6ddb-430b-b31e-be3a2e9662a1"
              },
              {
                "amount": "76.50",
                "date": "2020-11-14",
                "promotion": {
                  "id": "71591484",
                  "title": "genius rate"
                },
                "rate_code": 117855,
                "rate_plan": "785360cd-6ddb-430b-b31e-be3a2e9662a1"
              }
            ],
            "meal_plan": "Breakfast is included in the room rate.",
            "policies": "Children and Extra Bed Policy: All children are welcome. All children under 3 years stay free of charge when using existing beds. All children from 3 to 18 years are charged  GBP 10 per night when using existing beds. There is no capacity for extra beds in the room. The maximum number of total guests in a room is 2. There is no capacity for cots in the room.  Deposit Policy: No prepayment is needed.  Cancellation Policy: The guest can cancel free of charge until 1 day before arrival. The guest will be charged the cost of the first night if they cancel within 1 day before arrival.",
            "promotion": [
              {
                "from_code": "0",
                "from_name": "genius rate",
                "promotion_id": "71591484",
                "to_code": "117855"
              }
            ],
            "rate_plan_code": 117855,
            "room_remarks": [],
            "room_type_code": "3636404",
            "smoking_preferences": null
          },
          "occupancy": {
            "adults": 2,
            "children": 0,
            "infants": 0
          },
          "rate_plan_id": "785360cd-6ddb-430b-b31e-be3a2e9662a1",
          "room_type_id": "e2a15383-7843-4240-adda-736608d72eca",
          "services": [],
          "taxes": [
            {
              "is_inclusive": true,
              "name": "VAT (5%)",
              "nights": 2,
              "persons": 2,
              "price_mode": "Per booking",
              "price_per_unit": "7.29",
              "total_price": "7.29",
              "type": "Value Added Tax (VAT)"
            }
          ]
        }
      ],
      "services": [],
      "status": "modified",
      "unique_id": "BDC-3333333333"
    },
    "id": "3e029821-d446-45e9-8394-42d78a3aa1b1",
    "type": "booking"
  }
}
```

{% endtab %}

{% tab title="Booking Cancellation" %}

```javascript
{
  "data": {
    "attributes": {
      "amount": "76.50",
      "ota_commission": "1.00",
      "arrival_date": "2020-11-13",
      "arrival_hour": null,
      "currency": "GBP",
      "customer": {
        "address": null,
        "city": ".",
        "company": null,
        "country": "GB",
        "language": null,
        "mail": "customer_email@guest.booking.com",
        "meta": {
          "is_genius": false
        },
        "name": "Name",
        "phone": "Custom Phone",
        "surname": "Surname",
        "zip": null
      },
      "departure_date": "2020-11-15",
      "guarantee": {
        "card_number": "411111******1111",
        "card_type": "VI",
        "cardholder_name": "CARDHOLDER NAME",
        "cvv": "***",
        "expiration_date": "11/2021",
        "is_virtual": false
      },
      "id": "3e029821-d446-45e9-8394-42d78a3aa1b1",
      "inserted_at": "2020-11-12T11:39:50.111087",
      "notes": null,
      "occupancy": {
        "adults": 2,
        "children": 0,
        "infants": 0
      },
      "ota_name": "BookingCom",
      "ota_reservation_code": "3333333333",
      "payment_collect": null,
      "payment_type": null,
      "property_id": "57b92389-1878-4772-9f0d-47e31d22609f",
      "revision_id": "2399140e-4673-427a-bb40-0074d917d21f",
      "rooms": [
        {
          "amount": "153.00",
          "booking_room_id": "5c0a93d1-10f8-4871-bd30-a850c3d98e9b",
          "checkin_date": "2020-11-13",
          "checkout_date": "2020-11-15",
          "ota_unique_id": "49",
          "days": {
            "2020-11-13": "76.50",
            "2020-11-14": "76.50"
          },
          "guests": [
            {
              "name": "Guest Name",
              "surname": "Guest Surname"
            }
          ],
          "meta": {
            "additional_details": [],
            "booking_com_room_index": 875,
            "cancel_penalties": [
              {
                "amount": "0.00",
                "currency": "GBP",
                "from": "2020-11-09T17:32:51"
              },
              {
                "amount": "76.50",
                "currency": "GBP",
                "from": "2020-11-12T00:00:00"
              }
            ],
            "days_breakdown": [
              {
                "amount": "76.50",
                "date": "2020-11-13",
                "promotion": {
                  "id": "71591484",
                  "title": "genius rate"
                },
                "rate_code": 117855,
                "rate_plan": "785360cd-6ddb-430b-b31e-be3a2e9662a1"
              },
              {
                "amount": "76.50",
                "date": "2020-11-14",
                "promotion": {
                  "id": "71591484",
                  "title": "genius rate"
                },
                "rate_code": 117855,
                "rate_plan": "785360cd-6ddb-430b-b31e-be3a2e9662a1"
              }
            ],
            "meal_plan": "Breakfast is included in the room rate.",
            "policies": "Children and Extra Bed Policy: All children are welcome. All children under 3 years stay free of charge when using existing beds. All children from 3 to 18 years are charged  GBP 10 per night when using existing beds. There is no capacity for extra beds in the room. The maximum number of total guests in a room is 2. There is no capacity for cots in the room.  Deposit Policy: No prepayment is needed.  Cancellation Policy: The guest can cancel free of charge until 1 day before arrival. The guest will be charged the cost of the first night if they cancel within 1 day before arrival.",
            "promotion": [
              {
                "from_code": "0",
                "from_name": "genius rate",
                "promotion_id": "71591484",
                "to_code": "117855"
              }
            ],
            "rate_plan_code": 117855,
            "room_remarks": [],
            "room_type_code": "3636404",
            "smoking_preferences": null
          },
          "occupancy": {
            "adults": 2,
            "children": 0,
            "infants": 0
          },
          "rate_plan_id": "785360cd-6ddb-430b-b31e-be3a2e9662a1",
          "room_type_id": "e2a15383-7843-4240-adda-736608d72eca",
          "services": [],
          "taxes": [
            {
              "is_inclusive": true,
              "name": "VAT (5%)",
              "nights": 2,
              "persons": 2,
              "price_mode": "Per booking",
              "price_per_unit": "7.29",
              "total_price": "7.29",
              "type": "Value Added Tax (VAT)"
            }
          ]
        }
      ],
      "services": [
        {
          "name": "Cancellation Fee",
          "nights": 0,
          "persons": 0,
          "price_mode": "Per stay",
          "price_per_unit": "76.50",
          "service_rph": null,
          "total_price": "76.50",
          "type": "Cancellation Fee"
        }
      ],
      "status": "cancelled",
      "unique_id": "BDC-3333333333"
    },
    "id": "3e029821-d446-45e9-8394-42d78a3aa1b1",
    "type": "booking"
  }
}
```

{% endtab %}
{% endtabs %}

### Airbnb examples

{% tabs %}
{% tab title="New Booking" %}

```javascript
{
  "data": {
    "attributes": {
      "amount": "249.60",
      "ota_commission": "10.00",
      "arrival_date": "2020-09-08",
      "arrival_hour": null,
      "currency": "GBP",
      "customer": {
        "address": null,
        "city": null,
        "country": null,
        "mail": "customer_email@guest.airbnb.com",
        "name": "Name",
        "phone": "CUSTOMER PHONE",
        "surname": "Surname",
        "zip": null
      },
      "departure_date": "2020-09-11",
      "guarantee": null,
      "id": "c1620561-4a91-4a0a-8c22-7882095e3525",
      "inserted_at": "2020-08-26T20:09:28.724828",
      "notes": "Listing Base Price: 300.00\nTotal Paid Amount: 0.00\nTransient Occupancy Tax Paid Amount: 0.00\nListing Security Price: 100.00\nListing Cancellation Payout: 249.60\nListing Cancellation Host Fee: 50.40\nOccupancy Tax Amount Paid To Host: 0.00\n",
      "occupancy": {
        "adults": 1,
        "children": 0,
        "infants": 0
      },
      "ota_name": "Airbnb",
      "ota_reservation_code": "HM5MBZ1AVA",
      "payment_collect": null,
      "payment_type": null,
      "property_id": "c1620561-4a91-4c0a-8c22-7882095a4522",
      "revision_id": "54ca42b4-c4a0-4281-b6cf-c63798277dfb",
      "rooms": [
        {
          "amount": "249.60",
          "booking_room_id": "a1cce439-0e47-432a-a18a-128a16cd24f6",
          "checkin_date": "2020-09-08",
          "checkout_date": "2020-09-11",
          "days": {
            "2020-09-08": "83.20",
            "2020-09-09": "83.20",
            "2020-09-10": "83.20"
          },
          "guests": null,
          "meta": null,
          "occupancy": {
            "adults": 1,
            "children": 0,
            "infants": 0
          },
          "rate_plan_id": "c6b9777d-58b5-430d-96ea-1e5c033c3b7a",
          "room_type_id": "d8100037-fe37-452a-b4d3-a1b79ce3b049",
          "services": [],
          "taxes": []
        }
      ],
      "services": [],
      "status": "new",
      "unique_id": "ABB-HM5MBZ1AVA"
    },
    "id": "c1620561-4a91-4a0a-8c22-7882095e3525",
    "type": "booking"
  }
}
```

{% endtab %}

{% tab title="Cancelled Booking" %}

```javascript
{
  "data": {
    "attributes": {
      "amount": "249.60",
      "ota_commission": "10.00",
      "arrival_date": "2020-09-08",
      "arrival_hour": null,
      "currency": "GBP",
      "customer": {
        "address": null,
        "city": null,
        "country": null,
        "mail": "customer_email@guest.airbnb.com",
        "name": "Name",
        "phone": "CUSTOMER PHONE",
        "surname": "Surname",
        "zip": null
      },
      "departure_date": "2020-09-11",
      "guarantee": null,
      "id": "c1620561-4a91-4a0a-8c22-7882095e3525",
      "inserted_at": "2020-08-26T20:09:28.724828",
      "notes": "Listing Base Price: 300.00\nTotal Paid Amount: 0.00\nTransient Occupancy Tax Paid Amount: 0.00\nListing Security Price: 100.00\nListing Cancellation Payout: 249.60\nListing Cancellation Host Fee: 50.40\nOccupancy Tax Amount Paid To Host: 0.00\n",
      "occupancy": {
        "adults": 1,
        "children": 0,
        "infants": 0
      },
      "ota_name": "Airbnb",
      "ota_reservation_code": "HM5MBZ1AVA",
      "payment_collect": null,
      "payment_type": null,
      "property_id": "c1620561-4a91-4c0a-8c22-7882095a4522",
      "revision_id": "54ca42b4-c4a0-4281-b6cf-c63798277dfb",
      "rooms": [
        {
          "amount": "249.60",
          "booking_room_id": "a1cce439-0e47-432a-a18a-128a16cd24f6",
          "checkin_date": "2020-09-08",
          "checkout_date": "2020-09-11",
          "days": {
            "2020-09-08": "83.20",
            "2020-09-09": "83.20",
            "2020-09-10": "83.20"
          },
          "guests": null,
          "meta": null,
          "occupancy": {
            "adults": 1,
            "children": 0,
            "infants": 0
          },
          "rate_plan_id": "c6b9777d-58b5-430d-96ea-1e5c033c3b7a",
          "room_type_id": "d8100037-fe37-452a-b4d3-a1b79ce3b049",
          "services": [],
          "taxes": []
        }
      ],
      "services": [],
      "status": "cancelled",
      "unique_id": "ABB-HM5MBZ1AVA"
    },
    "id": "c1620561-4a91-4a0a-8c22-7882095e3525",
    "type": "booking"
  }
}
```

{% endtab %}
{% endtabs %}

### Expedia examples

{% tabs %}
{% tab title="New Booking" %}

```javascript
{
  "data": {
    "attributes": {
      "amount": "85.00",
      "ota_commission": null,
      "arrival_date": "2021-11-10",
      "arrival_hour": null,
      "currency": "GBP",
      "customer": {
        "name": "NAME",
        "surname": "SURNAME"
      },
      "departure_date": "2021-11-11",
      "guarantee": {
        "card_number": "411111******1111",
        "card_type": "MC",
        "cardholder_name": "Expedia VirtualCard",
        "cvv": "***",
        "expiration_date": "08/2025",
        "is_virtual": true
      },
      "id": "cbb79768-3cde-4f3f-b580-86630ff04231",
      "inserted_at": "2020-09-02T10:02:32.352598",
      "notes": "Room with View please",
      "occupancy": {
        "adults": 2,
        "children": 0,
        "infants": 0
      },
      "ota_name": "A-Expedia",
      "ota_reservation_code": "1695093244",
      "payment_collect": null,
      "payment_type": null,
      "property_id": "57b12389-4878-4773-9f0d-47e31d22612a",
      "revision_id": "41913311-ac59-47e8-95e2-27cf38e7ca1b",
      "rooms": [
        {
          "amount": "85.00",
          "booking_room_id": "17334099-be2f-4c78-8692-9bd7ffd7ad32",
          "checkin_date": "2021-11-10",
          "checkout_date": "2021-11-11",
          "days": {
            "2021-11-10": "85.00"
          },
          "guests": null,
          "meta": {
            "bed_preferences": "1 Double Bed",
            "cancel_penalties": [],
            "days_breakdown": [],
            "free_text": "Room with View please",
            "payment_instruction": "Collect payment from traveler upon arrival. This Expedia virtual card can only be used in the case of a no-show or cancellation, after the booking has been reconciled. You cannot charge this card prior to reconciliation.",
            "smoking_preferences": "Non-Smoking"
          },
          "occupancy": {
            "adults": 2,
            "children": 0,
            "infants": 0
          },
          "rate_plan_id": "b835066b-233d-4c8f-a134-f291662fa34a",
          "room_type_id": "e2b23183-7843-4240-adda-736608d7becb",
          "services": [],
          "taxes": []
        }
      ],
      "services": [],
      "status": "new",
      "unique_id": "EXP-1695093244"
    },
    "id": "cbb79768-3cde-4f3f-b580-86630ff04231",
    "type": "booking"
  }
}
```

{% endtab %}

{% tab title="Cancelled Booking" %}

```javascript
{
  "data": {
    "attributes": {
      "amount": "85.00",
      "ota_commission": null,
      "arrival_date": "2021-11-10",
      "arrival_hour": null,
      "currency": "GBP",
      "customer": {
        "name": "NAME",
        "surname": "SURNAME"
      },
      "departure_date": "2021-11-11",
      "guarantee": {
        "card_number": "411111******1111",
        "card_type": "MC",
        "cardholder_name": "Expedia VirtualCard",
        "cvv": "***",
        "expiration_date": "08/2025",
        "is_virtual": true
      },
      "id": "cbb79768-3cde-4f3f-b580-86630ff04231",
      "inserted_at": "2020-09-02T10:02:32.352598",
      "notes": "Room with View please",
      "occupancy": {
        "adults": 2,
        "children": 0,
        "infants": 0
      },
      "ota_name": "A-Expedia",
      "ota_reservation_code": "1695093244",
      "payment_collect": null,
      "payment_type": null,
      "property_id": "57b12389-4878-4773-9f0d-47e31d22612a",
      "revision_id": "41913311-ac59-47e8-95e2-27cf38e7ca1b",
      "rooms": [
        {
          "amount": "85.00",
          "booking_room_id": "17334099-be2f-4c78-8692-9bd7ffd7ad32",
          "checkin_date": "2021-11-10",
          "checkout_date": "2021-11-11",
          "days": {
            "2021-11-10": "85.00"
          },
          "guests": null,
          "meta": {
            "bed_preferences": "1 Double Bed",
            "cancel_penalties": [],
            "days_breakdown": [],
            "free_text": "Room with View please",
            "payment_instruction": "Collect payment from traveler upon arrival. This Expedia virtual card can only be used in the case of a no-show or cancellation, after the booking has been reconciled. You cannot charge this card prior to reconciliation.",
            "smoking_preferences": "Non-Smoking"
          },
          "occupancy": {
            "adults": 2,
            "children": 0,
            "infants": 0
          },
          "rate_plan_id": "b835066b-233d-4c8f-a134-f291662fa34a",
          "room_type_id": "e2b23183-7843-4240-adda-736608d7becb",
          "services": [],
          "taxes": []
        }
      ],
      "services": [],
      "status": "cancelled",
      "unique_id": "EXP-1695093244"
    },
    "id": "cbb79768-3cde-4f3f-b580-86630ff04231",
    "type": "booking"
  }
}
```

{% endtab %}
{% endtabs %}

### Make My Trip / Goibibo examples

```json
{
    "data": {
        "attributes": {
            "id": "8a362bbf-5a67-49ad-87a0-70ad7d26cd8d",
            "meta": {
                "booking_id": "0123936109",
                "cancellation_policy": [
                    {
                        "charge": "0",
                        "charge_type": "percent",
                        "end_day": "365",
                        "policy_text": "Free cancellation if cancelled between 365 days prior to checkin and 1 days prior to checkin",
                        "start_day": "1"
                    },
                    {
                        "charge": "100",
                        "charge_type": "percent",
                        "end_day": "1",
                        "policy_text": "Non-Refundable between 1 days prior to checkin or in case of NO SHOW",
                        "start_day": "-1"
                    }
                ],
                "created_time": "2025-03-20 16:23:58",
                "last_modified_time": "2025-03-20 16:24:03"
            },
            "status": "new",
            "services": [],
            "currency": "THB",
            "amount": "9100.00",
            "agent": null,
            "inserted_at": "2025-03-20T10:55:00.218175",
            "unique_id": "GMT-0123936109",
            "property_id": "2924ab73-14fb-4b47-bf0b-680118e98bef",
            "channel_id": "85016ebd-a1aa-2b9f-abb9-4ad3a0857835",
            "ota_name": "Goibibo",
            "booking_id": "8a362bbf-5a67-49ad-87a0-70ad7d26cd8d",
            "arrival_date": "2025-04-14",
            "arrival_hour": null,
            "customer": {
                "name": "Name",
                "mail": "",
                "phone": "",
                "surname": "Surname"
            },
            "departure_date": "2025-04-19",
            "deposits": [],
            "notes": null,
            "ota_commission": null,
            "ota_reservation_code": "0123936109",
            "payment_collect": "ota",
            "payment_type": "bank_transfer",
            "rooms": [
                {
                    "meta": {
                        "number": 1,
                        "hotel_code": "1000113081",
                        "rate_plan_code": "910020446642",
                        "room_type_code": "15200264119",
                        "cancel_penalties": [],
                        "days_breakdown": []
                    },
                    "taxes": [],
                    "services": [],
                    "amount": "9100.00",
                    "days": {
                        "2025-04-15": "2093.00",
                        "2025-04-16": "1638.00",
                        "2025-04-17": "1638.00",
                        "2025-04-18": "1638.00",
                        "2025-04-14": "2093.00"
                    },
                    "ota_commission": null,
                    "guests": [],
                    "occupancy": {
                        "children": 0,
                        "adults": 2,
                        "ages": null,
                        "infants": 0
                    },
                    "rate_plan_id": "12b1419c-6ee6-4032-9d2b-7521fb59c87d",
                    "room_type_id": "2219cf5c-ddbc-4162-bb14-6aa7581f78b9",
                    "booking_room_id": "f933192b-17d3-411a-9906-7c82844afee1",
                    "checkin_date": "2025-04-14",
                    "checkout_date": "2025-04-19",
                    "is_cancelled": false,
                    "ota_unique_id": null
                }
            ],
            "occupancy": {
                "children": 0,
                "adults": 2,
                "ages": null,
                "infants": 0
            },
            "guarantee": null,
            "secondary_ota": "MakeMyTrip",
            "acknowledge_status": "acknowledged",
            "has_unacked_revisions": false,
            "raw_message": "...",
            "is_crs_revision": false,
            "revision_id": "cd82f770-7c1e-4053-b834-93e0483305a0"
        },
        "id": "8a362bbf-5a67-49ad-87a0-70ad7d26cd8d",
        "type": "booking"
    }
}
```

## Reporting API

Reporting API can be used to notify OTA about some problems with current booking. At this time, we support Booking.com Reporting API (No Show, Invalid Card, Cancel Due Invalid Card).

### No Show Report API

You can mark a reservation as a no-show from 00:00 (midnight, in property's local time) on the planned check-in date, up to 48 hours later, provided that:

* the status of the reservation allows modifications;
* the reservation isn't overbooked.

{% tabs %}
{% tab title="Booking.com Request" %}
Request:

```
POST https://staging.channex.io/api/v1/bookings/:booking_id/no_show
```

Payload:

```
{
  "no_show_report": {
    "waived_fees": boolean
  }
}
```

`waived_fees` specifies whether the property will waive the [no-show](https://connect.booking.com/user_guide/site/en-US/reporting-api/b_xml-reporting/#report-guest-no-show) fees. Can be `true` or `false`
{% endtab %}

{% tab title="Success Response" %}
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

**Method Not Supported**

Status Code: `422 Unprocessable Entity`

```javascript
{
  "errors": {
    "code": "method_not_supported",
    "title": "Method Not Supported"
  }
}
```

{% endtab %}
{% endtabs %}

### Invalid Card Report API

An invalid credit card can be reported immediately after the reservation is made, up until midnight (00:00) on the day of check-in, in the property's local timezone.

{% tabs %}
{% tab title="Request" %}
Request:

```
POST https://staging.channex.io/api/v1/bookings/:booking_id/invalid_card
```

Payload should be empty.
{% endtab %}

{% tab title="Success Response" %}
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

**Method Not Supported**

Status Code: `422 Unprocessable Entity`

```javascript
{
  "errors": {
    "code": "method_not_supported",
    "title": "Method Not Supported"
  }
}
```

{% endtab %}
{% endtabs %}

### Cancel Due Invalid Card Report API

A property may cancel a reservation if the guest's credit card details are invalid and certain conditions are met:

**- If you don’t receive updated credit card details** within 24 hours, or the guest provides invalid credit card details again.

**- For bookings made within 48 hours of check-in**, if the card is invalid, the customer will have 12 hours (or until 3 pm – whichever is earlier) to update these details (instead of the usual 24 hours).

**- The customer is always given at least 2 hours to update these details** (i.e. if the booking is made after 2 pm on the day of arrival).

**- For last-minute bookings of 10 or more room nights,** partners can cancel 2 hours after marking the credit as invalid.

{% tabs %}
{% tab title="Request" %}
Request:

```
POST https://staging.channex.io/api/v1/bookings/:booking_id/cancel_due_invalid_card
```

Payload should be empty.
{% endtab %}

{% tab title="Success Response" %}
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

**Method Not Supported**

Status Code: `422 Unprocessable Entity`

```javascript
{
  "errors": {
    "code": "method_not_supported",
    "title": "Method Not Supported"
  }
}
```

{% endtab %}
{% endtabs %}
