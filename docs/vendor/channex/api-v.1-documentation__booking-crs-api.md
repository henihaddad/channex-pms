<!-- https://docs.channex.io/api-v.1-documentation/booking-crs-api.md -->
> For the complete documentation index, see [llms.txt](https://docs.channex.io/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://docs.channex.io/api-v.1-documentation/booking-crs-api.md).

# Booking CRS API

API Methods to work with Booking CRS feature

{% hint style="warning" %}
This feature is still in Beta and you should be careful to modify OTA bookings with any changes.

API is Experimental and can be changed.
{% endhint %}

## Intro

Booking CRS is an API and UI which allows the user to create, modify and cancel bookings at Channex.io.

This API is designed to cover few use cases such as:

* keep information about Booking up to date if some changes is applied to Booking at PMS side
* push information about Bookings created via Offline sources to be able process it over regular pipeline

By using those API you are able to:

* create a new Bookings
* modify existing Bookings (even if it came over OTA)
* cancel existing Bookings (even if it came over OTA)
* enrich existing Bookings by custom meta-information to exchange it with integrated partners such as Smart Lock service, Housekeeping Apps and etc.

Custom Information

Booking CRS API allow you to put custom information through `meta` field at next objects:

* `booking`
* `customer`
* `room`

You are able to put any information inside this fields in format what is suitable for your use-case.

## Overrides Logic <a href="#overrides-logic" id="overrides-logic"></a>

The Booking CRS API allows you to update bookings that originate from OTAs (Online Travel Agencies). This feature helps keep bookings up to date when modifications are made on the property side. However, it's essential to understand the logic behind this functionality.

Channex operates using Booking Revisions, which act as snapshots of a booking at a given time. Each time an OTA provides an update, a new revision is created, and the existing booking is updated. These snapshots do not inherit data from previous revisions.

However, when you start using the Booking CRS API to modify OTA bookings, the system shifts to a **diff-based logic** for those bookings.

Each time we receive a new revision from an OTA and the affected booking has any revisions from the CRS API, we update the incoming data by calculating the difference between the **previous OTA revision** and the **current revision**.

### Example <a href="#example" id="example"></a>

1. An OTA sends a booking for **August 25, 2025**, for a **Double Room**, under the name **John Doe**.
2. The **PMS (Property Management System)** moves the booking from a **Double Room** to a **Single Room** and updates the customer name to **Hanna Doe**.
3. The OTA later sends a modification where the customer changes their name to **Alice Cooper**, but the date remains **August 25, 2025**, and the room type remains **Double Room**.

**How the system processes this:**

* When we receive the OTA modification, we compare it with the original booking and calculate the differences.
* In this case, the only change from the OTA is the **customer name**.
* As a result, we take the **latest CRS revision** (which has the Single Room) and apply the new customer name from the OTA update.

**Final outcome:** The booking will be for **August 25, 2025**, in a **Single Room**, under the name **Alice Cooper**.

### Edge Cases <a href="#edge-cases" id="edge-cases"></a>

1. **OTA Overrides Your Changes**
   * If you change the room type from **Double** to **Single** via CRS and then receive an OTA modification that sets the room type to **Triple**, the final booking will reflect the **Triple Room** as per the OTA update.
2. **Date Changes from OTA**
   * If the guest modifies their booking dates via the OTA (e.g., changes the arrival date or extends their stay), the system will reset the selected room type to the **original room type** from the latest OTA revision.

## FAQ <a href="#faq" id="faq"></a>

**What happens after you make any edits to a booking?**

We will create a modification and the booking will be sent to the PMS as usual

**What happens if the OTA will send a modification after you have modified it?**

We will check the last OTA booking vs the new version and only save the changes, it will not revert your changes that you made. More details below

**Why use this feature?**

If you would like Channex to have the same booking data as your PMS, it will be possible to connect applications in the future that need to read and edit bookings. Example: check-in apps, door locks, Revenue Management, Upselling etc.

## API Methods

### Create Booking

{% hint style="info" %}
Property should have Booking CRS App installed to have access for Booking CRS API
{% endhint %}

{% tabs %}
{% tab title="Request" %}
`POST /api/v1/bookings`

Payload:

```json
{
  "booking": {
    "property_id": "60c85c87-4119-4129-ba33-f63a5d617479",
    "ota_reservation_code": "113",
    "ota_name": "Offline",
    "arrival_date": "2025-10-10",
    "departure_date": "2025-10-11",
    "arrival_hour": "18:00",
    "services": [
      {
        "is_inclusive": true,
        "name": "Cancellation Fee",
        "nights": 0,
        "persons": 0,
        "price_mode": "Per stay",
        "price_per_unit": "6.75",
        "total_price": "6.75",
        "type": "Cancellation Fee"
      }
    ],
    "deposits": [
      {
        "amount": "100.00",
        "currency": "GBP",
        "charged_at": "2019-05-05T19:20:32.001023",
        "type": "credit_card",
        "notes": "Card ending 1234",
        "meta": {}
      }
    ],
    "payment_collect": "ota",
    "payment_type": "bank_transfer",
    "currency": "GBP",
    "ota_commission": "2.00",
    "notes": "guest notes",
    "meta": null,
    "customer": {
      "name": "John",
      "zip": "ZIP123456",
      "address": "Sonner str. 38",
      "mail": "john@doe.com",
      "country": "GB",
      "city": "London",
      "phone": "+44 123 123456",
      "surname": "Doe"
    },
    "rooms": [
      {
        "room_type_id": "6db77022-a078-49be-9270-cdb01d731730",
        "rate_plan_id": "6b27f60c-e0ef-4600-aeb5-3fcb6ff2a54e",
        "days": {
          "2025-10-10": "100.00"
        },
        "services": [],
        "taxes": [
          {
            "is_inclusive": true,
            "name": "VAT (20%)",
            "nights": 1,
            "persons": 2,
            "price_mode": "Per booking",
            "price_per_unit": "13.33",
            "total_price": "13.33",
            "type": "Value Added Tax (VAT)",
            "version": null
          }
        ],
        "guests": [
          {
            "name": "John",
            "surname": "Doe"
          }
        ],
        "occupancy": {
          "adults": 1,
          "children": 0,
          "infants": 0,
          "ages": []
        }
      }
    ]
  }
}
```

{% endtab %}

{% tab title="Success Response" %}

```json
{
    "data": {
        "attributes": {
            "id": "38add208-1bc5-4be4-9063-8968ad489681",
            "status": "new",
            "booking_id": "38add208-1bc5-4be4-9063-8968ad489681",
            "unique_id": "OFL-113",
            "revision_id": "c1e2198a-92e6-4c27-b964-f63c60d3243a"
        },
        "id": "38add208-1bc5-4be4-9063-8968ad489681",
        "type": "booking"
    }
}
```

{% endtab %}
{% endtabs %}

To get more information about fields, please take a look into our [Public Booking API](/api-v.1-documentation/bookings-collection.md).

{% hint style="warning" %}
Operation to create Booking and save it inside database is asynchronous, as result, if you trigger request immediately after receiving response you can get 404 Error.
{% endhint %}

{% hint style="warning" %}
Create Booking operation working based at regular logic and will trigger all associated web-hooks and availability changes (depending to Property settings).
{% endhint %}

### Update Booking

Property should have Booking CRS App installed to have access for Booking CRS API.

{% tabs %}
{% tab title="Request" %}
`PUT /api/v1/bookings/:booking_id`

Payload:

```json
{
  "booking": {
    "status": "modified",
    "property_id": "60c85c87-4119-4129-ba33-f63a5d617479",
    "ota_reservation_code": "113",
    "ota_name": "Offline",
    "arrival_date": "2025-10-10",
    "departure_date": "2025-10-11",
    "arrival_hour": "18:00",
    "services": [
      {
        "is_inclusive": true,
        "name": "Cancellation Fee",
        "nights": 0,
        "persons": 0,
        "price_mode": "Per stay",
        "price_per_unit": "6.75",
        "total_price": "6.75",
        "type": "Cancellation Fee"
      }
    ],
    "deposits": [
      {
        "amount": "100.00",
        "currency": "GBP",
        "charged_at": "2019-05-05T19:20:32.001023",
        "type": "credit_card",
        "notes": "Card ending 1234",
        "meta": {}
      }
    ],
    "payment_collect": "ota",
    "payment_type": "bank_transfer",
    "currency": "GBP",
    "ota_commission": "2.00",
    "notes": "guest notes",
    "meta": null,
    "customer": {
      "name": "John",
      "zip": "ZIP123456",
      "address": "Sonner str. 38",
      "mail": "john@doe.com",
      "country": "GB",
      "city": "London",
      "phone": "+44 123 123456",
      "surname": "Doe"
    },
    "rooms": [
      {
        "room_type_id": "6db77022-a078-49be-9270-cdb01d731730",
        "rate_plan_id": "6b27f60c-e0ef-4600-aeb5-3fcb6ff2a54e",
        "days": {
          "2025-10-10": "100.00"
        },
        "services": [],
        "taxes": [
          {
            "is_inclusive": true,
            "name": "VAT (20%)",
            "nights": 1,
            "persons": 2,
            "price_mode": "Per booking",
            "price_per_unit": "13.33",
            "total_price": "13.33",
            "type": "Value Added Tax (VAT)",
            "version": null
          }
        ],
        "guests": [
          {
            "name": "John",
            "surname": "Doe"
          }
        ],
        "occupancy": {
          "adults": 1,
          "children": 0,
          "infants": 0,
          "ages": []
        }
      }
    ]
  }
}
```

{% endtab %}

{% tab title="Response" %}
**Success Response**

```json
{
    "data": {
        "attributes": {
            "id": "38add208-1bc5-4be4-9063-8968ad489681",
            "status": "modified",
            "booking_id": "38add208-1bc5-4be4-9063-8968ad489681",
            "unique_id": "OFL-113",
            "revision_id": "c1e2198a-92e6-4c27-b964-f63c60d3243a"
        },
        "id": "38add208-1bc5-4be4-9063-8968ad489681",
        "type": "booking"
    }
}
```

{% endtab %}
{% endtabs %}

{% hint style="warning" %}
Operation to update Booking and save it inside database is asynchronous, as result, if you trigger request immediately after receiving response you can get 404 Error.
{% endhint %}

{% hint style="warning" %}
Update Booking operation working based at regular logic and will trigger all associated web-hooks and availability changes (depending to Property settings).
{% endhint %}

{% file src="/files/NDv0uCsaxH0DUa9507MD" %}
Booking CRS OpenSpec collection
{% endfile %}
