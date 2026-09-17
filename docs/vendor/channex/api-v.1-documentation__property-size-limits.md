<!-- https://docs.channex.io/api-v.1-documentation/property-size-limits.md -->
> For the complete documentation index, see [llms.txt](https://docs.channex.io/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://docs.channex.io/api-v.1-documentation/property-size-limits.md).

# Property Size Limits

## Introduction

To prevent system abuse and ensure API stability, we have to make sure properties are not too large. Big properties can cause issues if there are too many rate plans or rooms and rates and affect other users and properties.

## Property Size Limits for Vacation Rental

**Room Types:** Max 50

**Rate Plans:** Max 10 Per Room Type

**Per Person Rate:** 18 Occupancy

## Property Size Limits for Hotel

**Room Types:** Max 20

**Rate Plans:** Max 200 per property

**Per Person Rate:** 18 Occupancy

## Overage Fees if your property is larger than the included limits (USD)

If you really need to go over limits there will be overage fees to pay, large properties take more resources.

**Hotel Room Type Overage:** $1 Per room Type (Max Fee 7 USD Per property)

**Hotel Rate Plan Overage Fee:** $0.05 per rate plan

**Vacation Rental Rate Plan Overage Fee:** $0.05 per rate plan<br>

**Best practices to avoid issues:**

* Make sure you use "Per Person" rate plans instead of making a rate plan per occupancy
* Try not to make a rate plan per OTA
* If you have vacation Rental you should make a property per apartment instead of putting all into one Channex property

Example: A client with 100 apartments

Instead of 1 property with 100 room types in Channex, This should be 100 properties in Channex with 1 room type each. This is more correct since each apartment will have its own address and details.

## What if I need more rooms or rates for a property?

We can manually change limits for a certain property on a case by case basis. Please let us know via <support@channex.io>.
