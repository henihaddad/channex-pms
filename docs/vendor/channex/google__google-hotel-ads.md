<!-- https://docs.channex.io/google/google-hotel-ads.md -->
> For the complete documentation index, see [llms.txt](https://docs.channex.io/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://docs.channex.io/google/google-hotel-ads.md).

# Connect Google Channel

This guide will show you the process of getting a property online and working with Google. Connecting a property to Google will show for free under the free section.

At the bottom there is more general information regarding linking Google Ads accounts and a FAQ.

## Step 0: Content Requirements

Before you add the Google Channel we will require you to edit the property and make sure some key things have content. Google has no extranet so we must provide a lot of details to them about the property:

To activate the Google channel we will check:

* country
* address
* phone
* latitude & longitude (Map location is set)
* timezone
* hotel\_policy
* at least one cancellation\_policy
* at least one facility
* at least one photo
* at least one property\_description

All these content settings can be found by editing the property, for more details please check this help file: <https://channex.labiknow.com/general/property-content-ready-for-google>

## Step 1: Add a new Channel

Connecting the channel is a fairly straight forward process:

1. Go to the channels page: <https://app.channex.io/channels>
2. Click on the "Create" button
3. Select "Google Hotel Search"
4. Select the property you wish to connect in the dropdown menu.

## Step 2: Configure the Booking Link (Skip this if you are using the Channex account)

{% hint style="warning" %}
This section is only if you have your own Hotel Centre, Channex account must use the Channex Instant booking page.
{% endhint %}

If you have over 25 properties you can apply for your own Google account and use your own Hotel Centre. You can apply here: <https://services.google.com/fb/forms/hoteladsfreebookinglinksinterestformforconnectivitypartners/>

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

Once you have finished adding your booking link you can go to the mapping tab and select which rooms and rates you wish for Google to see.

{% hint style="success" %}
Mapping is simple, just select using checkboxes the rooms and rates you want. You can modify these at any time in the future also if there are any changes.
{% endhint %}

## Step 4: Wait for Google to pick up the property

Google will check for new properties each week, so once you have activated the Google Channel you should wait for at least 1 week.

If it still does not show let us know

{% hint style="warning" %}
Google matches properties by looking at the Address, Telephone number, and property name. You should make sure this is all correct before activating the channel.
{% endhint %}

## Linking a Google Ads account

You can link your company Google Ads account to the Hotel Centre and manage campaigns for all your hotels or you can let the hotel connect their own Google Ads account so they can manage their own bidding.

{% hint style="info" %}
You can connect unlimited amount of Google Ads accounts
{% endhint %}

Both ways have advantages and disadvantages

**Advantages** of letting hotels link their own Google Ads include no worries on accounting and collecting payments from hotels for ad spend.

**Disadvantages** are more setup time and training

You should expect to charge for your services with either method you decide since both require human services

## FAQ

### Is this the Google Free Links?

Yes, Adding properties will automatically add them to the free links section. Then you have the option to link to Google Ads to boost your visibility.

### Is Google only Pay per Click (PPC)?

The default and recommended method is PPC, but they do offer a Cost per Acquisition (CPA) model also. But be careful since the CPA is commission percentage for the booking and there is no discount or refund if the booking is cancelled.

### Is it easy for a hotel to manage themselves?

You will need to either produce a very simple guide or ideally set up the campaign for them correctly. Once the campaign is set up the hotel can usually manage by themselves but it's quite likely they don't understand how to manage this efficiently.

Short Answer: Yes if they are technically minded

### Is it worth offering Google to my properties?

Yes. Google is a huge brand with increasing visibility each year. While it isn't a simple one click process currently it is beneficial to offer the channel for your properties. We suggest to charge a small fee to cover your time and services.

### How to cancel Google for a property

This is simple, just delete the channel in Channex interface for that property. You should also remove the property from any campaign in Google Ads also so there is no wasted clicks.

### Any Contracts with Google or agreements?

Not for connectivity. You will have an agreement with Google to use their Google Ads account which is then linked so you can bid on hotels. You don't need to be in contact with anyone at Google for this whole process.

{% hint style="info" %}
If you have over 25 properties you may apply for your own "Hotel Centre" account instead of using Channex accounts. This will require an agreement and setup and implementation time with Google if you are accepted. Note: Channex will connect your Hotel Centre for you once agreed.
{% endhint %}

### Can I use my own Booking Engine?

If you have your own Hotel Centre then yes.
