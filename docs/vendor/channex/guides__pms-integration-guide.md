<!-- https://docs.channex.io/guides/pms-integration-guide.md -->
> For the complete documentation index, see [llms.txt](https://docs.channex.io/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://docs.channex.io/guides/pms-integration-guide.md).

# PMS Integration Guide

This guide is to help you to connect your PMS to Channex

1. [Introduction](#1-introduction)
2. [Create Methods and Mapping](#2-create-methods-and-mapping)
3. [Send ARI to Channex](#send-ari-to-channex)
4. [Receive Bookings](#receiving-bookings)

## 1. Introduction

Channex is a connectivity platform to help companies connect to OTA, Meta Search and other systems.

This guide is targeted mainly towards PMS but also any system that is connecting Channex to push their properties prices and availability to OTA or Meta.

* PMS
* IBE (Using Channex as a Channel Manager or Meta Search)
* OTA (Using Channex to access Meta Channels)
* CM (Use Channex to expand their distribution)
* RM (To send and receive prices)

{% hint style="info" %}
Channex provides connectivity superpowers, with great power comes great responsibility.
{% endhint %}

## Auth: Create API key and use in Headers

To use Channex API you need an account and have created an API key, for details please see this link on how to use API key in the header: [https://docs.channex.io/api-v.1-documentation/api-reference#authentication](/api-v.1-documentation/api-reference.md#authentication)

## Managing Properties

Typically a PMS would have one account with Channex which you would add multiple properties. This is the simplest approach since you only manage one account and credentials.

You can invite users to individual properties if you need to give them access.

## 2. Create Methods and Mapping

At Channex we expect connecting systems to setup accounts via API.

This approach brings many benefits to you as it reduces any manual processes and simplifies mapping.

* Properties API Collection\
  <https://docs.channex.io/api-v.1-documentation/hotels-collection>\
  API methods to receive list of connected Properties and manage it
* Room Type API Collection\
  <https://docs.channex.io/api-v.1-documentation/room-types-collection>\
  API methods to receive list of Room Types and manage it
* Rate Plans API Collection\
  <https://docs.channex.io/api-v.1-documentation/rate-plans-collection>\
  API methods to receive list of Rate Plans and manage it

### Create Property

You can create properties in the Channex interface and then map on your side. However it is much faster if you build to our create property methods so onboarding new properties is faster for your team.

<https://docs.channex.io/api-v.1-documentation/hotels-collection#create-property>

### Create Room Types

Creating a Room Type is best practice, we would require some information regarding the name and occupancy

<https://docs.channex.io/api-v.1-documentation/room-types-collection#create-room-type>

### Create Rate Plans

Creating Rate plans via API saves a lot of time since by creating you would auto map it to your internal room and rate combination.

<https://docs.channex.io/api-v.1-documentation/rate-plans-collection#create-rate-plan>

{% hint style="warning" %}
If you set Room Type to 2 Persons you cannot create Rate Plan for above 2 persons. It will cause an error.
{% endhint %}

## Get Information for Mapping

We have some simple endpoints so you can easily get mapping info to use on your side:

Properties: <https://docs.channex.io/api-v.1-documentation/hotels-collection#property-options>

Rooms: <https://docs.channex.io/api-v.1-documentation/room-types-collection#room-type-options>

Rates: <https://docs.channex.io/api-v.1-documentation/rate-plans-collection#rate-plan-options>

### Mapping Screens UI Example

For Channex you have 2 ways you can map from your system

1. Traditional Way
2. Automated Way

#### Traditional Mapping Screens

Traditional screens lets you map to an account that already exists or allows you to create. This is the most flexible as it allows you to map existing properties, rooms and rates or if it is an empty account to create everything.

![Example of credential section](https://2514252617-files.gitbook.io/~/files/v0/b/gitbook-legacy-files/o/assets%2F-LWLG7_BCMgWd3mn6DYg%2F-LjQJwYWWBMxJZOtWEWy%2F-LjQUVex1xiG-2QUx9cH%2FScreenshot%202019-07-10%20at%2012.42.14.png?alt=media\&token=26549659-16d3-46da-b0b9-8c5656cce99a)

Once the property is chosen or created, then you must map the room types and rate plans.

![Example of mapping screen](https://2514252617-files.gitbook.io/~/files/v0/b/gitbook-legacy-files/o/assets%2F-LWLG7_BCMgWd3mn6DYg%2F-LjQJwYWWBMxJZOtWEWy%2F-LjQVN8QoRyxgND8H_qL%2FScreenshot%202019-07-10%20at%2012.48.27.png?alt=media\&token=383c6fcf-b499-4b03-a0a3-60e6e894b557)

As you notice the mapping screen allows you to map to existing room/rate or to create new. This allows you to be flexible to map something created in Channex.

The Reload Inventory button allows you to pull room and rate information from Channex to show what is already created. This is useful if the user wants to create in Channex then map manually.

{% hint style="info" %}
We also allow you to delete rooms and rates via API. There will be an error if it is mapped to a channel. It's optional if you want to delete in your mapping screen, you can do this in the Channex interface.
{% endhint %}

### Automated Mapping

For some PMS or systems it might be simpler to auto create and map and to keep the mapping interface to the administrator.

This method would be handy if you want to provide easy self service to your users.

* Auto create property, rooms and rate plans on new accounts
* Auto sync new rate plans that are created
* Delete any removed rate plans (Make sure you check its deleted from Channex before deleting in PMS as it could be mapped to channel)
* Use the channel API to allow users to create and map channels in your PMS

{% hint style="info" %}
It is advisable to have the traditional mapping screens for admin to fix any issues that might come from the auto methods.
{% endhint %}

{% hint style="warning" %}
Be sure to auto create and remove rates and rooms, you also need to check if it's removed from Channex before removing in the PMS or you will break the chain.
{% endhint %}

## Send ARI to Channex

At Channex we like to receive updates for Availability and Rate & Restrictions separately.

Example: To update Channex for 10 days you would send 10 days of Availability information in one message and prices and restrictions in another.

<https://docs.channex.io/api-v.1-documentation/ari>

{% hint style="info" %}
At Channex we like to have a separate message for availability. We push these updates to the front of the queue for processing.
{% endhint %}

**Push ARI Best Practices**

* Please send all changes immediately to Channex
* If lots of changes try to collect into as few messages as possible for faster processing. We would say its good to batch messages per property each 30-60 seconds.
* Advisable to send a daily full update each night per property
* Message must be less than 10mb

{% hint style="info" %}
We are always happy to have a chat on best practices.
{% endhint %}

## Receiving Bookings

Receiving bookings will be the last stage of the connection process. You can create test bookings and see if they are received successfully.

We support credit cards in PCI secure manner and also extras in the bookings.

Use the Booking Revision Feed to get all unacknowledged bookings: <https://docs.channex.io/api-v.1-documentation/bookings-collection#booking-revisions-feed>

Once you successfully receive a booking you should ack the booking so it wont be provided to you again.

<https://docs.channex.io/api-v.1-documentation/bookings-collection#acknowledge-booking-revision-receiving>

{% hint style="info" %}
If you want to chat about ways to keep your system out of scope for credit cards please get in touch.
{% endhint %}
