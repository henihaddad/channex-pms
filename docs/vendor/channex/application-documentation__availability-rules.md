<!-- https://docs.channex.io/application-documentation/availability-rules.md -->
> For the complete documentation index, see [llms.txt](https://docs.channex.io/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://docs.channex.io/application-documentation/availability-rules.md).

# Availability Rules

We have settings so you can control availability to certain OTA

## How to find this feature

<figure><img src="https://2514252617-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2F-LWLG7_BCMgWd3mn6DYg%2Fuploads%2FnFPxcAVYEcMtjqyfA1aj%2FScreenshot%202023-12-13%20at%2014.22.33.png?alt=media&amp;token=60387f9b-3fc1-4d16-9e0f-a6d253d66ada" alt=""><figcaption></figcaption></figure>

Go to the inventory page and make sure onl1 1 proeprty is selected so you can see the table.

Then click on the "Actions" button to find the "Availability Rules" feature

## Create a Rule

<figure><img src="https://2514252617-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2F-LWLG7_BCMgWd3mn6DYg%2Fuploads%2FeyhkOvaYAf1ofbIGMIDn%2FScreenshot%202023-12-13%20at%2014.25.03.png?alt=media&amp;token=8e839bbc-7e69-4830-b183-a4db90548108" alt=""><figcaption></figcaption></figure>

The above image shows what it looks like with no rules setup

To make a new rule you can click on the "Create" button

<figure><img src="https://2514252617-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2F-LWLG7_BCMgWd3mn6DYg%2Fuploads%2FL2td8uLCknk8S1YFnPSZ%2FScreenshot%202023-12-13%20at%2014.27.04.png?alt=media&amp;token=1ec75996-4913-48d4-be05-dd2f9d088dbc" alt=""><figcaption></figcaption></figure>

**Affected Dates**: Here you should set the date range for the rule, you can set many years ahead if you want to set for a long time

**Type:** Close Out, Availability Offset, Max Availability (Details below what each of these means)

![](https://2514252617-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2F-LWLG7_BCMgWd3mn6DYg%2Fuploads%2F4rI7MUYCEU960lqc0NZL%2FScreenshot%202023-12-13%20at%2014.28.30.png?alt=media\&token=e5ae6bb5-1e44-4d76-9411-a1e0e3625b4b)

## Close Out

This is used if you want to stop giving availability for this OTA on the selected dates

Example: You want to block all of August to Expedia as you are busy with direct sales instead.

## Max Availability

This setting will limit the availability for the room

Example: If you have 10 rooms and set Max Availability to 5 then the channel will only see 5 rooms available even if you have 10 total.

If one room is booked and now 9 total is left the channel will still get an update to show 5. It will work like this until the total available is less than the max available rooms and then it will work as normal.

Typical Use Cases:

* Limit rooms available so you don't get large group bookings
* Limit rooms available so rooms look more scarce on the channel

## Availability Offset

This setting just applies a **negative** amount to the availability, you don't need to enter a negative sign.

If you set "2" to the offset and you have 10 double rooms total then you will have 10 - 2 = 8 rooms to sell.

Once you have 2 rooms left you end up with 0 rooms left (2 - 2 = 0)

Use Case:

* Stop giving availability to some high commission channels when only a few rooms left
* Give last room availability to selected channels or own website

Affected Channels: You need to select which OTA this rul applies to

Room Types: Choose which room types this rule affects.
