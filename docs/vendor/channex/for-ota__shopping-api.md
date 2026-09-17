<!-- https://docs.channex.io/for-ota/shopping-api.md -->
> For the complete documentation index, see [llms.txt](https://docs.channex.io/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://docs.channex.io/for-ota/shopping-api.md).

# Channex Shopping API

API Methods to get real time rates, availability and content from Channex.

{% hint style="info" %}
Cost: $500 per year. Payable in advance before certification
{% endhint %}

These are API methods for META-like channel connections. If your application does not cache any information on your side about Properties, Availability and Restrictions, you can implement support for our Shopping API and use it to build your own Booking Engine.

{% hint style="success" %}
This API is for real time shopping of Channex API for all required details. Perfect for many applications as you don't need to cache anything on your side.
{% endhint %}

## Create Open Shopping Channel

Please sign up for a user at: [staging.channex.io](https://staging.channex.io) to make an account and then you should create a test property with rooms and rates.

Then go to channels page and create a channel "Open Shopping Channel"

Please map some rooms and rates.

In our staging environment there will be a few properties on this channel so you will get results of many properties if you use property list API.

{% hint style="warning" %}
`{{CHANNEL_NAME}}` will be "*OpenShopping*" for your API integration. This will be replaced with your own name once you certify officially.
{% endhint %}

## Properties List

Method to get a list of connected Properties.

```json
GET https://staging.channex.io/api/v1/meta/{{CHANNEL_NAME}}/property_list

{
  "data": [
    {
      "attributes": {
        "address": "220125, RU, Moscow, Moscow, Zubovskaya 5",
        "city": "Moscow",
        "country": "RU",
        "description": "Excellent Hotel and Old City Centre",
        "id": "c1595b90-75f3-4b7e-b3c4-cf6a70f0d81d",
        "latitude": "11.001323",
        "longitude": "33.023321",
        "best_offer": "23.12",
        "photos": [],
        "state": "Moscow",
        "title": "Old City Centre",
        "zip_code": "220125"
      },
      "id": "c1595b90-75f3-4b7e-b3c4-cf6a70f0d81d",
      "type": "property"
    },
    {
      "attributes": {
        "address": "SW1W 0AD, GB, London, 10 Chester Square",
        "city": "London",
        "country": "GB",
        "description": "Quiet hotel at heart of British capital",
        "id": "37d1c98a-bb20-4ca4-a8ce-bc1ee78d9455",
        "latitude": "51.4966440",
        "longitude": "-0.1476140",
        "best_offer": "18.47",
        "photos": [
          {
            "url": "https://img.channex.io/ec4f261a-1e21-4070-922b-86e0c46abd26/",
            "description": null,
            "author": null
          }
        ],
        "state": null,
        "title": "Royal Hotel tbf",
        "zip_code": "SW1W 0AD"
      },
      "id": "37d1c98a-bb20-4ca4-a8ce-bc1ee78d9455",
      "type": "property"
    }
  ],
  "meta": {}
}
```

This endpoint supports filters by `title`, `city`, `latitude`, `longitude`, `country` , `zip_code`, `state` and `address`.\
To apply filter pass it as query argument:\
`/property_list?filter[city]=Moscow`

To get `best_offer`, please define `checkin_date` and `checkout_date` arguments:

{% code overflow="wrap" %}

```
GET https://staging.channex.io/api/v1/meta/{{CHANNEL_NAME}}/property_list?checkin_date=2021-03-22&checkout_date=2021-03-23
```

{% endcode %}

To get only Available Properties, please use `is_available` argument. It will work only with `checkin_date` and `checkout_date` arguments and will return only Properties, available for bookings at provided time frame.

{% code overflow="wrap" %}

```
GET https://staging.channex.io/api/v1/meta/{{CHANNEL_NAME}}/property_list?checkin_date=2021-03-22&checkout_date=2021-03-23&is_available=true
```

{% endcode %}

Filter can be combined with `eq`, `gt`, `lt`, `gte`, `lte` and `has` [filtration arguments](https://docs.channex.io/api-v.1-documentation/api-reference#filtering-data-arguments).

**Example:** Get all properties where title contain `TIT`

{% code overflow="wrap" %}

```
GET https://staging.channex.io/api/v1/meta/{{CHANNEL_NAME}}/property_list?filter[title][has]=TIT
```

{% endcode %}

{% hint style="success" %}
You can use our [Photos API](https://docs.channex.io/api-v.1-documentation/photos-collection) to get photos fit to your design.
{% endhint %}

## Get Property Info

Method to get Property Info by ID

```json
GET https://staging.channex.io/api/v1/meta/{{CHANNEL_NAME}}/{{PROPERTY_ID}}/property_info

{
  "data": {
    "attributes": {
      "address": "SW1W 0AD, GB, London, 10 Chester Square",
      "city": "London",
      "country": "GB",
      "description": "Quiet hotel at heart of British capital",
      "id": "37d1c98a-bb20-4ca4-a8ce-bc1ee78d9455",
      "location": {
        "latitude": "51.4966440",
        "longitude": "-0.1476140"
      },
      "facilities": [
        "Swimming Pool", "GYM"
      ],
      "photos": [
        {
          "url": "https://img.channex.io/ec4f261a-1e21-4070-922b-86e0c46abd26/",
          "description": null,
          "author": null
        }
      ],
      "state": null,
      "title": "Royal Hotel tbf",
      "zip_code": "SW1W 0AD",
      "hotel_policy": {
        "checkin_from_time": "14:00",
        "checkin_to_time": "23:00",
        "checkout_from_time": "07:00",
        "checkout_to_time": "11:00",
        "children_max_age": null,
        "currency": "GBP",
        "infant_max_age": null,
        "internet_access_cost": null,
        "internet_access_coverage": "entire_property",
        "internet_access_type": "wifi",
        "is_adults_only": false,
        "max_count_of_guests": 4,
        "parking_is_private": true,
        "parking_reservation": "not_needed",
        "parking_type": "on_site",
        "pets_non_refundable_fee": null,
        "pets_policy": "not_allowed",
        "pets_refundable_deposit": null,
        "smoking_policy": "no_smoking",
        "title": "Default"
      }
    },
    "id": "37d1c98a-bb20-4ca4-a8ce-bc1ee78d9455",
    "type": "property_info"
  }
}
```

## Get Closed Dates

Method to get unavailable dates, dates closed to arrival and departure, min stay arrival and min stay through values.

```json
GET https://staging.channex.io/api/v1/meta/{{CHANNEL_NAME}}/{{PROPERTY_ID}}/closed_dates

{
  "data": {
    "attributes": {
      "closed": [
        "2020-09-17"
      ],
      "closed_to_arrival": [
        "2020-09-19"
      ],
      "closed_to_departure": [
        "2020-09-15"
      ],
      "min_stay_arrival": {
        "2020-09-15": 2
      },
      "min_stay_through": {
        "2020-09-16": 3
      }
    },
    "type": "closed_dates_list"
  }
}
```

`min_stay_arrival` and `min_stay_through` will contain only dates where min stay value is greater than 1.

## Get Rooms List

Method to get Rooms and Rates list

```json
GET https://staging.channex.io/api/v1/meta/{{CHANNEL_NAME}}/{{PROPERTY_ID}}/rooms?checkin_date=YYYY-MM-DD&checkout_date=YYYY-MM-DD

{
  "data": [
    {
      "type": "room_with_rates",
      "id": "ROOM_ID",
      "attributes": {
        "id": "ROOM_ID",
        "title": "Room Title",
        "description": "Description",
        "bed_options": [
          {
            "title": "Olympic Queen",
            "count": 2,
            "size": "90x200 CM"
          }
        ],
        "facilities": ["facility 1", "facility 2"],
        "photos": [
          {
            "url": "PHOTO_URL",
            "title": "title",
            "author": "author"
          }
        ],
        "rate_plans": [
          {
            "id": "RATE_PLAN_ID",
            "title": "Title",
            "occupancy": {
              "adults": 1,
              "children": 0,
              "infants": 0
            },
            "meal_plan": "Bed & Breakfast",
            "price": "100.00",
            "cancellation_policy": {
              "cancellation_policy_deadline": 24,
              "cancellation_policy_deadline_type": "hours",
              "cancellation_policy_logic": "deadline",
              "cancellation_policy_mode": "nights",
              "cancellation_policy_penalty": "1",
              "currency": "GBP",
              "guarantee_payment_amount": null,
              "guarantee_payment_policy": "none",
              "non_show_policy": "default",
              "title": "24 Hours"
            },
            "taxes": [
              {
                "title": "Tax Title",
                "amount": "10.00",
                "inclusive": false,
                "rate": "10.00",
                "mode": "percent"
              }
            ]
          }
        ]
      }
    }
  ]
}
```

This method will return list of Rooms and Rate Plans. This method supports filter arguments:

* checkin\_date (Date at ISO format YYYY-MM-DD)
* checkout\_date (Date at ISO format YYYY-MM-DD)
* length\_of\_stay (Integer)

Checkout\_date is optional if you use length\_of\_stay and vice versa.

If the method is called without dates, it will return Rooms list without Rate Plans.

## Create Booking

Method to create Bookings

```json
POST https://secure-staging.channex.io/api/v1/meta/{{CHANNEL_NAME}}/{{PROPERTY_ID}}/push_booking

{
  "booking": {
    "status": "new",

    "reservation_id": "{{UNIQUE_ID_FROM_OTA}}",

    "arrival_date": "2019-05-09",
    "departure_date": "2019-05-10",
    "arrival_hour": "10:00",

    "currency": "GBP",
    
    "payment_collect": "property",
    "payment_type": "credit_card",

    "customer": {
      "name": "User",
      "surname": "Channex",
      "country": "GB",
      "city": "London",
      "address": "101 Finsbury Pavement",
      "zip": "ec2a 1rs",
      "mail": "support@channex.io",
      "phone": "+44 444 4444 44 44",
      "language": "en",
      "company": {
        "title": "Channex.io",
        "number": "TAX NUMBER",
        "number_type": "VAT"
      },
      "meta": {}
    },

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
        "room_type_code": "{{ROOM_TYPE_ID}}",
        "rate_plan_code": "{{RATE_PLAN_ID}}",
        "occupancy": {
          "adults": 1,
          "children": 0,
          "infants": 0
        },
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
        "room_index": null
      }
    ],
    
    "agent": {
      "name": "Seller Agent Name",
      "code": "XXX",
      "code_context": "IATA",
      "phone": "+44444444444",
      "email": "agent@test.com",
      "address": {
        "address_line": "Some cool street",
        "city": "Valletta",
        "country_code": "MT",
        "state_code": null,
        "post_code": "VLT 1234"
      }
    },
    
    "meta": {}
  }
}
```

Please, keep in mind, if you pass Credit Card Information, you MUST use the secure endpoint: `secure-staging.channex.io`

### Field description

**status `[required]`**\
String. Status of Booking, can be one of three values: `new`, `modified`, `cancelled`.

**reservation\_id `[optional]`**\
String. Booking unique ID. For messages with status `new` can be empty, in that case Channex will generate unique UUID for booking.

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

**meta `[optional]`**\
Object. Free-form JSON object with additional information about booking.

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

Booking rooms should be passed as Array of Objects. Each room object should contain information about `room_type_code` and `occupancy`.

**index `[optional]`**\
Integer. Room Index to associate Services at Room level. Incremented value, start from 0.

**room\_type\_code `[required]`**\
String. Code of Room Type received at Get Rooms List operation.

**rate\_plan\_code `[required]`**\
String. Rate Plan Code received at Get Rooms List operation.

**occupancy `[required]`**\
Object with information about occupancy. Should contain next fields:

* **adults `[required]`**\
  Integer. Count of adults (persons older then 16 years old)
* **children `[required]`**\
  Integer. Count of children (persons between 2 and 16 years old)
* **infants `[required]`**\
  Integer. Count of infants (persons younger then 2 years old)

**meta `[optional]`**\
Object. Free-form JSON object with additional information about booking room.

### Booking Services (Extras)

Services is Array of Objects to represent additional service or fees sold with bookings. Also, this field can contain Cancellation Fee when booking is cancelled with payment.\
Each object should contain next fields:

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

### Agent Info

Agent section will contain information about sales agent for current booking. Field is optional.

**name `[required]`**\
String. Sales agent company name.

**code `[optional]`**\
String. Sales agent code.

**code\_context `[optional]`**\
String. Sales agent code context (IATA or else)

**phone `[optional]`**\
String. Sales agent phone number.

**email `[optional]`**\
String. Sales agent email address.

**address `[optional]`**\
**Object. Sales agent address.**

* **address\_line**\
  String. Address.
* **city**\
  String. City name.
* **country\_code**\
  String. 2 symbols country code by ISO.
* **state\_code**\
  String. Optional. State code.
* **post\_code**\
  String. Optional. Post code.

## Modify or Cancel Booking

Method to modify or cancel Bookings.

When you call create Booking API, in response you will get `unique_id`for your reservation. This Unique ID can looks like: `OSA-99CAEF8F4E`. To apply modification or Cancellation for existed booking you should get `reservation_id`which is part after `-`symbol from `unique_id`.

To modify booking, please use status `modified`.\
To cancel booking, please use status `cancelled`.

```json
POST https://secure-staging.channex.io/api/v1/meta/{{CHANNEL_NAME}}/{{PROPERTY_ID}}/push_booking

{
  "booking": {
    "status": "modified | cancelled",

    "reservation_id": "{{RESERVATION_ID}}",

    "arrival_date": "2019-05-09",
    "departure_date": "2019-05-10",
    "arrival_hour": "10:00",

    "currency": "GBP",
    
    "payment_collect": "property",
    "payment_type": "credit_card",

    "customer": {
      "name": "User",
      "surname": "Channex",
      "country": "GB",
      "city": "London",
      "address": "101 Finsbury Pavement",
      "zip": "ec2a 1rs",
      "mail": "support@channex.io",
      "phone": "+44 444 4444 44 44",
      "language": "en",
      "company": {
        "title": "Channex.io",
        "number": "TAX NUMBER",
        "number_type": "VAT"
      },
      "meta": {}
    },

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
        "room_type_code": "{{ROOM_TYPE_ID}}",
        "rate_plan_code": "{{RATE_PLAN_ID}}",
        "occupancy": {
          "adults": 1,
          "children": 0,
          "infants": 0
        },
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
        "room_index": null
      }
    ],
    
    "agent": {
      "name": "Seller Agent Name",
      "code": "XXX",
      "code_context": "IATA",
      "phone": "+44444444444",
      "email": "agent@test.com",
      "address": {
        "address_line": "Some cool street",
        "city": "Valletta",
        "country_code": "MT",
        "state_code": null,
        "post_code": "VLT 1234"
      }
    },
    
    "meta": {}
  }
}
```

Please, keep in mind, if you pass Credit Card Information, you MUST use the secure endpoint: `secure-staging.channex.io`
