<!-- https://docs.channex.io/google/google-hotel-ads-1.md -->
> For the complete documentation index, see [llms.txt](https://docs.channex.io/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://docs.channex.io/google/google-hotel-ads-1.md).

# Google Vacation Rental

This guide will show you the process of getting a vacation rental property online and working with Google.

## Step 0: Content Requirements

Before you add the Google Channel we will require you to edit the property and make sure some key things have content. Google has no extranet so we must provide a lot of details to them about the property:

To activate the Google channel we will check:

* country
* address
* phone
* Website URL (Must have https\://)
* latitude & longitude (Map location is set)
* timezone
* hotel\_policy
* cancellation\_policy
* at least one facility
* at least 8 photos
* Property\_description
* ```
  In Channel Settings:
  bathrooms_count
  bedrooms_count
  beds_count
  ```

All these content settings can be found by editing the property or in the channel settings. To use Google Vacation Rentals the property billing type must be as "Vacation Rental"

## Step 1: Add a new Channel

Connecting the channel is a fairly straight forward process:

1. Go to the channels page: <https://app.channex.io/channels>
2. Click on the "Create" button
3. Select "Google Hotel Search"
4. Select the property you wish to connect in the dropdown menu.

## Step 2: Configure the Booking Link (Skip if using Channex account)

{% hint style="warning" %}
This section is only if you have your own Hotel Centre, Channex account must use the Channex Instant booking page.
{% endhint %}

If you have over 500 properties you can apply for your own Google VR account and use your own Hotel Centre.

You can apply here: <https://services.google.com/fb/forms/googlevacationrentalsinterestform/>

We have a checkbox to use the Channex ibe (Booking Engine), if you have your own booking engine follow the guide below.

The booking link is important to be set correctly because when a click comes from Google we will translate the URL using the setting in the booking link.

{% hint style="info" %}
Please get in touch with us so we can help you create your booking link
{% endhint %}

Example Link: **<https://bookingengine.com/Hotel1?Checkin=2021-06-01\\&nights=2>**

All you need to do is replace the checkin date and nights with one of our variables from the table below.

New Link: **<https://bookingengine.com/Hotel1?Checkin=(CHECKIN\\_DATE)\\&nights=(LENGTH)>**

{% hint style="warning" %}
[O](https://bookingengine.com/Hotel1?Checkin=\(CHECKIN_DATE\)\&nights=\(LENGTH\))nce you have created the link once you can usually reuse for all properties and just change the property slug or property ID
{% endhint %}

### Variable Table

| Description           |                                                      |
| --------------------- | ---------------------------------------------------- |
| (CHECKIN\_DATE)       | Checkin date at ISO standard (YYYY-MM-DD)            |
| (ADULTS)              | Count of Adults                                      |
| (CHECKIN\_DAY)        | Checkin day without leading zero (1, 2, 3, …, 10)    |
| (CHECKIN\_DAY\_WL)    | Checkin day with leading zero (01, 02, 03, …, 10)    |
| (CHECKIN\_MONTH)      | Checkin month without leading zero (1, 2, 3, …, 10)  |
| (CHECKIN\_MONTH\_WL)  | Checkin month with leading zero (01, 02, 03, …, 10)  |
| (CHECKIN\_YEAR)       | Checkin year at YYYY format                          |
| (CHECKOUT\_DATE)      | Checkout date at ISO standard (YYYY-MM-DD)           |
| (CHECKOUT\_DAY)       | Checkout day without leading zero (1, 2, 3, …, 10)   |
| (CHECKOUT\_DAY\_WL)   | Checkout day with leading zero (01, 02, 03, …, 10)   |
| (CHECKOUT\_MONTH)     | Checkout month without leading zero (1, 2, 3, …, 10) |
| (CHECKOUT\_MONTH\_WL) | Checkout month with leading zero (01, 02, 03, …, 10) |
| (CHECKOUT\_YEAR)      | Checkout year at YYYY format                         |
| (LENGTH)              | Length of stay or Number of Nights                   |
| (CURRENCY)            | ISO Currency symbol EUR, GBP, USD etc.               |

## Step 3: Mapping Rooms and Rates

Once you have finished adding your booking link you can go to the mapping tab and select which room and rates you wish for Google to see.

{% hint style="success" %}
Google Vacation Rental only allows 1 room type to connect since if a property has multiple room types they don't consider that a real Vacation Rental

If you have multiple apartments in the same building then you can make multiple Google channels (one for each apartment)

If you have multiple locations of properties in one Channex property then you will need to split out these properties to their own property so they can all have their own unique address in Google.
{% endhint %}

## Step 4: Wait for Google to pick up the property

Google will check for new properties each week, so once you have activated the Google Channel you should wait for at least 4 weeks.

If it still does not show let us know

## FAQ

### Is this the Google Free Links?

Yes, the vacation rental links are 100% free

### Where will it show?

Vacation Rentals free links will show if someone searches for vacation rentals in an area. It will show as a pin in the map.
