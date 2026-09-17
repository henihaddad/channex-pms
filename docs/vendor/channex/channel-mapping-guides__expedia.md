<!-- https://docs.channex.io/channel-mapping-guides/expedia.md -->
> For the complete documentation index, see [llms.txt](https://docs.channex.io/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://docs.channex.io/channel-mapping-guides/expedia.md).

# Expedia

How to connect and map to Expedia

## Request the connection with Channex

In the Expedia extranet please go to "Rooms and Rates" and then "Connectivity Settings"

![](https://2514252617-files.gitbook.io/~/files/v0/b/gitbook-legacy-files/o/assets%2F-LWLG7_BCMgWd3mn6DYg%2F-MIcj955IyhFJxXlTUpn%2F-MIcjb5qRU8tWehZngBD%2FScreenshot%202020-10-02%20at%2011.56.48.png?alt=media\&token=d4aa9af3-520c-4ab6-a3e3-1224d7ff799b)

Typically Expedia will require 2 factor authentication to access this page

![](https://2514252617-files.gitbook.io/~/files/v0/b/gitbook-legacy-files/o/assets%2F-LWLG7_BCMgWd3mn6DYg%2F-MIcj955IyhFJxXlTUpn%2F-MIckKcEFInTeEyOdzzg%2FScreenshot%202020-10-02%20at%2011.59.35.png?alt=media\&token=d7147805-b771-4d32-88bd-3bd2a7a0bc82)

Once this has been completed the user should choose Channex for both options of Connectivity and bookings.

## Creating the Expedia Channel

In Channex go to the channel tab: <https://app.channex.io/channels>

Click on the "Create" button and you will get this page:

![](https://2514252617-files.gitbook.io/~/files/v0/b/gitbook-legacy-files/o/assets%2F-LWLG7_BCMgWd3mn6DYg%2F-MIcj955IyhFJxXlTUpn%2F-MIcovloUcMkrW48hRcz%2FScreenshot%202020-10-02%20at%2012.20.05.png?alt=media\&token=85f645fa-9b1c-459b-9f58-1e1276d1cf68)

Select "Expedia" from the list of channels

![](https://2514252617-files.gitbook.io/~/files/v0/b/gitbook-legacy-files/o/assets%2F-LWLG7_BCMgWd3mn6DYg%2F-MIcj955IyhFJxXlTUpn%2F-MIcpI-UqN7FbBKrC1VA%2FScreenshot%202020-10-02%20at%2012.21.44.png?alt=media\&token=bcd967cd-7054-4a15-871a-6723857fd0a0)

Please enter all fields:

Title: This is the name you would like to call the channel

Property: Choose your property from the list

Hotel ID: This will be the Expedia property ID

Min Stay Type: Choose which Min stay the property uses and wants to send to Expedia. Typically it will be "Arrival"

Test Connection: Once the details are entered this should have a successful result and you can click on the next button to go to mapping.

### Booking Total Type

<figure><img src="https://2514252617-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2F-LWLG7_BCMgWd3mn6DYg%2Fuploads%2FCRrKNBojKqK8CNm3nBYg%2FScreenshot%202026-05-21%20at%2009.07.49.png?alt=media&amp;token=eca6a072-e885-4d12-bf11-257d58dc224f" alt=""><figcaption></figcaption></figure>

Here you will have 3 choices of how to store the booking

**Payout Amount** - This will save the amount that you need to charge the guest (Collect Amount) or the VCC. It will match your VCC amount. All taxes and fees are inclusive.

**Total Amaount** - This is the total the guest paid, All taxes and fees are inclusive.

**Total Amount Excluding Taxes** - This is the total the guest paid, All taxes and fees are excusive. (For USA)

## Mapping Expedia

![](https://2514252617-files.gitbook.io/~/files/v0/b/gitbook-legacy-files/o/assets%2F-LWLG7_BCMgWd3mn6DYg%2F-MIdbwIBZCe9tz7j2tlT%2F-MIdfpJftLCNgGTX__JJ%2FScreenshot%202020-10-02%20at%2016.19.56.png?alt=media\&token=94c38752-578f-4deb-934d-f7d214c52593)

Mapping to Expedia is pretty straight forward, onthe left side there is all the rooms and rates from Expedia and on the right side is what you should map to.

You should select the correct room and rates from the options provided and save

## Activate the Connection

Once the connection is activated make sure you make it active in the channels page by clicking the options button and "Activate"

![](https://2514252617-files.gitbook.io/~/files/v0/b/gitbook-legacy-files/o/assets%2F-LWLG7_BCMgWd3mn6DYg%2F-MIdbwIBZCe9tz7j2tlT%2F-MIdgO6vZwNxgl7QSMRm%2FScreenshot%202020-10-02%20at%2016.22.20.png?alt=media\&token=6b222787-3bf7-4c9b-85be-5fde31fadd24)

Once you have activated the channel it would do a full sync of all pricing, availability and restrictions to the mapped rate plans.

## Pull Future Bookings

This channel connection supports pulling all the future bookings from Expedia.
