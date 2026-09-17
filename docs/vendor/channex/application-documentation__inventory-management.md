<!-- https://docs.channex.io/application-documentation/inventory-management.md -->
> For the complete documentation index, see [llms.txt](https://docs.channex.io/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://docs.channex.io/application-documentation/inventory-management.md).

# Inventory Management

This is where you are able to see all rate, restriction and availability information of all your properties, rooms and rate plans.

**Table of Content:**

1. Select Property
2. PMS connected Properties
3. Inventory Management Overview
4. How to Navigate the Inventory Grid
5. Inventory Shortcodes
6. Update the table
7. Bulk Update
8. Change Log

### **1. Select Which Property to View**

You are able to view a single or multi property at this page, to choose your view use the property selector at the top of the page

![Select a single property or group](https://2514252617-files.gitbook.io/~/files/v0/b/gitbook-legacy-files/o/assets%2F-LWLG7_BCMgWd3mn6DYg%2F-LeRh3hv8gMThE1R3pC6%2F-LeRiZJQBnWcQMEZCo94%2FScreenshot%202019-05-09%20at%2015.13.01.png?alt=media\&token=ce787c20-914d-4da6-a608-c21e43cb092f)

{% hint style="info" %}
Generally for hotels and multi unit accommodation businesses you will want to view one property at a time. For vacation rental you will be able to benefit for single or group views.
{% endhint %}

### 2. PMS Connected Properties

For properties that have a PMS connected.

The PMS will update to availability, rates and restrictions, changing anything here manually may mean that it is later overwritten by a PMS update.

There are some advanced settings which is likely the PMS does not update:

* Max Availability
* Availability Offset

```
You can use these special settings to control availability. 
Please go here for more details
```

### 3. Inventory Management Overview

We use the standard hierarchy of:

* Room Types
* Room Rates
* Channel Rates

#### **Room Type**

This is the type of room you are selling

**Example:** Double Room, Family Room

{% hint style="info" %}
Room Types are from the Hotel industry to manage multiple rooms of the same type (Multi Unit)

If you are a vacation rental or sell rooms individually then just call the room type after your property or room.
{% endhint %}

#### Room Rate / Rate Plan

A room rate is a combo of the Room Type and Rate Plan

**Example:** Double / Best Available Rate

{% hint style="info" %}
The Room Rate will hold all details of Pricing, Availability and Restrictions for that Room Type.
{% endhint %}

#### Channel Rate

A channel rate is when a room rate is mapped to a channel, you will be able to see here what is sent to that channel.

{% hint style="info" %}
Channel Rate is what is sent to the channel, in channel mapping you can use a modifier to change rates sent to channels.

Example: +10%

In this example the channel rate should show 10% higher than the parent rate.
{% endhint %}

### 4. How to Navigate the Inventory Grid

![Key parts of inventory management table](https://2514252617-files.gitbook.io/~/files/v0/b/gitbook-legacy-files/o/assets%2F-LWLG7_BCMgWd3mn6DYg%2F-LeS7c_RyISzafhaStmg%2F-LeS7jMTbY5clY4wACvw%2FScreenshot_2019-05-09_at_16_15_33.png?alt=media\&token=8ed23338-8652-4133-ac4b-c4b47bacba0e)

Navigation - You can navigate in 2 ways:

1. Use the date picker and select a date
2. Use the arrows to go to next date range.

### 5. Inventory Shortcodes:

We have lots of shortcodes on the calendar:

Common:

* RATE - This is the Rate/Price
* MSA - Minimum Stay Arrival
* AVL - Availability (How many rooms/units left)
* SS - Stop Sell Restriction
* MXS - Maximum Stay Restriction
* CTA - Closed to Arrival
* CTD - Closed to Departure

Special Ones:

* AVO - Availability Offset
* MAL - Maximum Availability
* AVL - Availability of room rate

### Update the Table

To change anything on the grid you just need to click on it or click and drag for a date range

![Changing a rate for 3 days](https://2514252617-files.gitbook.io/~/files/v0/b/gitbook-legacy-files/o/assets%2F-LWLG7_BCMgWd3mn6DYg%2F-LeSKVJLTPUpWx4KQES7%2F-LeSPXwHyOObvWzRT4U1%2FChange%20a%20Rate.gif?alt=media\&token=72424b69-1c75-4a65-bef2-66c6e83bf749)

After you click on the grid you will see a popup like this:

![After you click on inventory grid](https://2514252617-files.gitbook.io/~/files/v0/b/gitbook-legacy-files/o/assets%2F-LWLG7_BCMgWd3mn6DYg%2F-LeSKVJLTPUpWx4KQES7%2F-LeSPmVu0Xs3AwPaX7YR%2FScreenshot%202019-05-09%20at%2018.26.24.png?alt=media\&token=1a1db098-4723-423b-bd6c-f5ec39276618)

Now you can check the dates are correct and enter the new value.

Once you have updated the grid you can save or reset changes.

### Bulk Update

This is the method you need for bulk changes, you can do multiple date ranges and days of the week

![Bulk Update Screen](https://2514252617-files.gitbook.io/~/files/v0/b/gitbook-legacy-files/o/assets%2F-LWLG7_BCMgWd3mn6DYg%2F-LeSKVJLTPUpWx4KQES7%2F-LeSQhqCi3g7GBdWtSOb%2FScreenshot%202019-05-09%20at%2018.29.50.png?alt=media\&token=fdceba6d-e5b1-4e32-977a-f4bbcd47ca29)

Affected Dates: You can update with 1 date range or add multiple

Restrictions: Here you can choose what you want to update, you can update multiple things at the same time.

Affected Rooms: You can search the table for any text, the table will show only what matches the search.

Select the rooms and rates you wish to update

Press save to finish!

![Example of a bulk update](https://2514252617-files.gitbook.io/~/files/v0/b/gitbook-legacy-files/o/assets%2F-LWLG7_BCMgWd3mn6DYg%2F-LeSKVJLTPUpWx4KQES7%2F-LeSRoDIzbHbcD6QBcbO%2FBulkUpdate.gif?alt=media\&token=353dbc5a-8d32-4df5-8c1a-41380c26c8e9)

## Change Log

We made another page for change log, please see here: [Change Log](/application-documentation/change-log-feature.md)
