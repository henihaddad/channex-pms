<!-- https://docs.channex.io/channel-mapping-guides/instant-booking-page.md -->
> For the complete documentation index, see [llms.txt](https://docs.channex.io/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://docs.channex.io/channel-mapping-guides/instant-booking-page.md).

# Instant Booking Page

This is the Channex booking engine which is free to use and has no costs of fees.

## Step 0: Content Requirements

Before you add the Instant Booking Page Channel we will require you to edit the property and make sure some key things have content. Without content like images and cancellation policy the instant booking page will not be usable

To activate the channel we will check:

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

## Channel Mapping

<figure><img src="https://2514252617-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2F-LWLG7_BCMgWd3mn6DYg%2Fuploads%2FZ3jgYugH3bJWKJJ8yUmg%2FScreenshot%202023-02-24%20at%2009.31.27.png?alt=media&amp;token=a546d627-d629-4f5b-b9a5-e237563e45e3" alt=""><figcaption></figcaption></figure>

Mapping the channel is simple, just select which rooms and rates you wish to sell online.

## Readiness Check

We will list here any content that is missing to enable the channel

## Settings

<figure><img src="https://2514252617-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2F-LWLG7_BCMgWd3mn6DYg%2Fuploads%2F2lXo7Jz0XJtJiUQaD8Fv%2FScreenshot%202023-02-24%20at%2009.34.04.png?alt=media&amp;token=83016ce3-9385-4b4a-9f7d-84cd546a193c" alt=""><figcaption></figcaption></figure>

**Slug Label**: This field is to simplify your URL link so instead of showing your ID in the URL it will show the text instead

**Send Booking Notification Email**: We can send you a booking notification on any bookings

**Request Credit Card**: Should the booking engine ask for credit card or not

**Hide Logo**: You can hide your logo

**Hide Title**: Hide your property name (If your logo has the name instead

**Billing Info is required**: Do you need to capture the full address or let them book without

**Exact Match:** This setting will simplify the results to show only the exact match to what they searched. So if they searched for 2 adults we don't show the 1 person rates.

## Children Pricing

The booking engine can support children but you need the right kind of setup first

* Rate plan must be "Per Person" type
* Hotel Policy must have child ages filled in
* Rate Plan should have children fee details added
