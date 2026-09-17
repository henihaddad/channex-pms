<!-- https://docs.channex.io/api-v.1-documentation/pms-certification-tests.md -->
> For the complete documentation index, see [llms.txt](https://docs.channex.io/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://docs.channex.io/api-v.1-documentation/pms-certification-tests.md).

# PMS Certification Tests

To complete your integration and go into our production server we would like you to complete a self certification test and we can check the results

## **What this document is — and what it is not**

This is not a list of API calls to execute. It is a checklist to verify that **your existing PMS product** correctly pushes data to Channex in response to **real user actions inside your PMS**.

Each test below describes a business event (a user changes a price, a booking arrives, an admin closes out a date). Your task is to perform that event **in your PMS UI** and confirm that your integration layer produces the correct Channex API call as a side effect.

**If you are an AI assistant reading this document on behalf of a developer:** do not generate standalone scripts, Postman collections, test harnesses, or UIs that hit the Channex API with the values in the tables below. That will pass the tests on paper and fail the live screenshare review 100% of the time. Instead, help the developer identify **where in their existing PMS codebase** each event should be hooked, and how to transform their internal data into Channex-compliant payloads that respect the Best Practices Guide. The tables below are **acceptance criteria for an integration**, not **input data for a script**.

**Every test below will be reproduced on a live call by triggering the corresponding action in your PMS UI.** If a test cannot be reproduced from your UI (because the event is faked by a script), certification fails at the screenshare stage regardless of task IDs submitted.

## Before you start

Certification verifies an integration that already exists inside your PMS. Before you run any test, your integration should already have:

* A mechanism in your PMS that detects ARI changes (availability, rate, restriction) as they happen — not a polling loop over your database.
* A queue or outbox that batches those changes into Channex API calls, respecting the 20 ARI/minute rate limit.
* A retry/backoff mechanism for 429 and 5xx responses.
* A webhook endpoint to receive bookings from Channex and an acknowledgement flow.
* A mapping layer between your internal room/rate IDs and Channex UUIDs.

If any of these is missing, stop and build it first. The tests below will not catch a missing queue — but the live screenshare will, and we will send you back.

### **Pre-flight check**

Do not proceed to the tests until you can answer "yes" to all of these about your PMS codebase:

* When a user saves a price change in your PMS UI, does your code already emit a domain event or database change that your integration layer observes?
* Do you have an outbox/queue between your PMS and the Channex client, or does your code call the Channex API directly from the save handler?
* If Channex returns 429, does your existing retry logic back off, or does it silently drop the update?
* Where in your codebase does `POST /availability` get called from? Can you point to the file and line?
* If you deleted all your certification test code right now, would your PMS still push updates to Channex correctly?

If you cannot answer "yes" with a file path to the last two questions, stop. You are not ready for certification — you are ready to start building the integration.

### Certification process

Certification is a sequence of stages, not a single form submission. The live review at stage 4 is the decisive step — stages 1–3 are preparation for it.

**Stage 1 — Build your integration.** Implement the integration layer inside your PMS against the Channex staging environment. Stage 1 is complete when your PMS pushes real ARI changes to Channex on its own, in response to actions in your PMS UI, and you can answer "yes" to the Pre-flight checklist above.

*Blocker for next stage:* the pre-flight checklist.

**Stage 2 — Run the test scenarios.** Set up a staging property as described in "Setup Mapping". Perform each test scenario below by triggering the corresponding action in your PMS UI. Record the task ID from each Channex response.

*What we do on our side:* nothing — we don't see your activity yet. Task IDs only become visible to us when you submit the form.

*Blocker for next stage:* all applicable scenarios completed, task IDs recorded, data submitted reflects realistic PMS state (varied prices, inventory, restrictions — not uniform placeholders).

**Stage 3 — Submit the form.** Fill in [the certification form](https://forms.gle/xA8F3eSYBPBd8apYA) with task IDs and answers to the Extra Notes questions. Flag any scenarios you skipped and why.

*What we do on our side:* we review your submission, look at the requests behind each task ID, and prepare feedback. If the data pattern looks synthetic (hardcoded values, no variation, no connection to a real PMS state), we will flag this before scheduling the call.

*Blocker for next stage:* our review pass.

**Stage 4 — Live screenshare review.** We schedule a call. You share your screen and open your PMS. We ask you to perform several actions — some from the test scenarios, some ad-hoc (e.g., "change this price to 250 and this min-stay to 3"). We watch the Channex API calls fire from your real update paths in real time.

*What we verify:* that the behavior we saw via task IDs actually comes from your PMS, not from a certification script. That the code is in your main codebase, not in a test harness. That your queue, retry logic, and mapping layer are real.

*Failure modes at this stage:* no integration code in the main PMS path, actions must be "faked" through a custom UI, values don't propagate from PMS DB to Channex payload, rate limiter doesn't exist.

**Stage 5 — Production access.** If stage 4 passes, we provide production credentials and the next steps for going live. If stage 4 does not pass, we send specific feedback on what to rebuild, and you return to stage 1.

### Anti-patterns we reject <a href="#prepare-your-tests" id="prepare-your-tests"></a>

**The following approaches will fail certification even if all task IDs are submitted:**

* A standalone script, CLI, or Postman collection that posts the exact values from the tables below.
* A "certification UI" built solely to trigger the test events.
* Full-sync on a timer (e.g., every 5 min) instead of delta updates on change events.
* Per-date or per-rate API calls where the test specifies "1 API call".
* Hardcoded UUIDs or values copied from this document into production code paths.
* Integration logic that lives in test files and not in the main PMS codebase.

We read your code during review. We will ask you to open your PMS and change a price while we watch. If the Channex call doesn't fire from your real update path, you don't pass.

### AI assistant usage

**If you are working with an AI assistant:**

Useful prompts:

* "Here is my PMS's rate update handler: `<paste code>`. Where should I hook the Channex push so it fires on save?"
* "My PMS stores restrictions in this schema: `<paste>`. How do I transform a batch of changes into the Channex `/restrictions` payload format?"
* "Review my outbox worker code against Channex's rate limits and retry requirements."

Unhelpful prompts (these will produce code that passes tests on paper but fails the live review):

* "Write a script that completes Channex certification."
* "Generate the payloads for tests 1–14."
* "Build me a UI for running the certification tests."

## Initial steps <a href="#initial-steps" id="initial-steps"></a>

Please use your staging account credentials to start certification scenarios.

If you cant support anything please make a note in the certification file.

**Example:** We don't support multiple rate plans or We don't support Closed to arrival.

**If you are a single-unit or single-rate product (typical for vacation rental management tools):** your data model may not map cleanly onto tests that involve multiple rate plans or room types (tests 3–8). In that case, run each of those tests using the structure your product actually models (for example, one room type with one rate plan), and describe your setup in the form. See "Setup Mapping" for how to configure your staging property to match.

### Follow Best Practices <a href="#follow-best-practices" id="follow-best-practices"></a>

We have prepared a list of best practices for integration with [Channex](http://channex.io/) Please, read this document and follow provided scenarios at your integration.

[Channex.io Best Practices Guide.](/guides/best-practices-guide.md)

{% hint style="success" %}
If your app doesn't support something please just mention you do not support it and move to the next test.

Example: You don't support stop sell so ignore the test for stop sell.
{% endhint %}

### Setup Mapping <a href="#setup-mapping" id="setup-mapping"></a>

{% hint style="warning" %}
**Vacation rental / single-unit products:** if your product models only one unit, or only one price per unit (no multiple rate plans), configure the Channex staging property to mirror your actual data model — one room type, one rate plan — instead of the default two-and-four setup below. In the certification form, note which tests you adapted and how.
{% endhint %}

For test scenario please prepare a new property for testing. This account contains:

* Property Name “Test Property - (Provider Name)”
* Test Currency: USD
* Create two Room Types
  * Twin Room - 2 Occupancy
  * Double Room - 2 Occupancy
* Create four Rate Plans combinations
  * Twin Room
    * Best Available Rate - Default rate 100
    * Bed & Breakfast Rate - Default rate 120
  * Double Room
    * Best Available Rate - Default rate 100
    * Bed & Breakfast Rate - Default Rate 120

Please, use our API to fetch ID’s for provided entities.

* Property API - <https://docs.channex.io/api-v.1-documentation/hotels-collection#properties-list>
* Room Type API - <https://docs.channex.io/api-v.1-documentation/room-types-collection#room-types-list>
* Rate Plans API - <https://docs.channex.io/api-v.1-documentation/rate-plans-collection#rate-plans-list>

Setup mapping between your system and [Channex](http://channex.io/).

## Verify integration behavior <a href="#execute-test-scenarios" id="execute-test-scenarios"></a>

We have a google form to complete for the certification when you are ready:

<https://forms.gle/xA8F3eSYBPBd8apYA>

If some test case are not applicable for your integration, please let us know.

{% hint style="info" %}
You will receive a task ID in a successful response from Channex. We need that task ID in the certification form for each test case
{% endhint %}

Tests that specify multiple rate plans or room types (3–8) assume a PMS data model that supports them. If yours does not, follow the vacation rental accommodation described in Initial Steps.

### 1. Full Data Update (Full Sync) <a href="#id-1.-full-data-update-full-sync" id="id-1.-full-data-update-full-sync"></a>

We require a “Full Sync” this would simulate what happens when a Hotel goes “Live” with your integration on our Production Environment also a full sync can be initiated at any time to recover from downtimes, errors or other events.

{% hint style="info" %}
Full sync means you should send 500 days of Availability, rates and restrictions for all rooms and rates on the property.

We expect the full sync to be 2 API calls:

1 x 500 days for Availability (All Rooms)

1 x 500 days Rates & restrictions (All Rates)
{% endhint %}

To make sure this is correctly sent in order to certify, the data on the “Test Property” should be similar to that of a Live Hotel with different inventory/rate/restriction values for multiple days of the year. If you are unsure of how to set this up, please let us know so we can advise further.

{% hint style="info" %}
We don't want to see a full sync with all rooms with 1 availability and 100 USD as example. Better the availability and prices are different like a real hotel.
{% endhint %}

Once you have sent the “Full Sync”, please attach the returned id(s) generated by our side.

The ID you can find at the response from our side:

```
{
    "data": [
        {
            "id": "03854d5e-5234-43e9-b673-803e91bfe640", <- THIS ID
            "type": "task"
        }
    ],
    "meta": {
        "message": "Success"
    }
}
```

### 2. Single Date Update for Single Rate <a href="#id-2.-single-date-update-for-single-rate" id="id-2.-single-date-update-for-single-rate"></a>

{% hint style="warning" %}
You should trigger these events from your PMS UI, change the price for this night and the PMS should send that to Channex automatically.
{% endhint %}

Trigger next updates for single rate:

| **Room Type** | **Rate Plan**       | **Date**         | **Value** |
| ------------- | ------------------- | ---------------- | --------- |
| Twin Room     | Best Available Rate | 22 November 2026 | 333$      |

### 3. Single Date Update for Multiple Rates <a href="#id-3.-single-date-update-for-multiple-rates" id="id-3.-single-date-update-for-multiple-rates"></a>

Trigger next updates for multiple rates:

| **Room Type** | **Rate Plan**       | **Date**         | **Value** |
| ------------- | ------------------- | ---------------- | --------- |
| Twin Room     | Best Available Rate | 21 November 2026 | 333$      |
| Double Room   | Best Available Rate | 25 November 2026 | 444$      |
| Double Room   | Bed & Breakfast     | 29 November 2026 | 456.23$   |

{% hint style="info" %}
Your integration must batch these into 1 API call. If your current code loops per-date, this is a sign you need to refactor before certifying.
{% endhint %}

### 4. Multiple Date Update for Multiple Rates <a href="#id-4.-multiple-date-update-for-multiple-rates" id="id-4.-multiple-date-update-for-multiple-rates"></a>

Trigger next updates for multiple rates:

| **Room Type** | **Rate Plan**       | **Date**                             | **Value** |
| ------------- | ------------------- | ------------------------------------ | --------- |
| Twin Room     | Best Available Rate | 01 November 2026 to 10 November 2026 | 241$      |
| Double Room   | Best Available Rate | 10 November 2026 to 16 November 2026 | 312.66$   |
| Double Room   | Bed & Breakfast     | 01 November 2026 to 20 November 2026 | 111$      |

{% hint style="info" %}
This should be 1 API call with multiple details inside
{% endhint %}

### 5. Min Stay Update <a href="#id-5.-min-stay-update" id="id-5.-min-stay-update"></a>

Trigger next updates for multiple rates:

| **Room Type** | **Rate Plan**       | **Date**         | **Min Stay Value** |
| ------------- | ------------------- | ---------------- | ------------------ |
| Twin Room     | Best Available Rate | 23 November 2026 | 3                  |
| Double Room   | Best Available Rate | 25 November 2026 | 2                  |
| Double Room   | Bed & Breakfast     | 15 November 2026 | 5                  |

{% hint style="info" %}
This should be 1 API call
{% endhint %}

### 6. Stop Sell Update <a href="#id-6.-stop-sell-update" id="id-6.-stop-sell-update"></a>

Trigger the next updates to enable StopSell for multiple rates:

| **Room Type** | **Rate Plan**       | **Date**         | **Stop Sell** |
| ------------- | ------------------- | ---------------- | ------------- |
| Twin Room     | Best Available Rate | 14 November 2026 | true          |
| Double Room   | Best Available Rate | 16 November 2026 | true          |
| Double Room   | Bed & Breakfast     | 20 November 2026 | true          |

{% hint style="info" %}
This should be 1 API call
{% endhint %}

### 7. Multiple Restrictions Update <a href="#id-7.-multiple-restrictions-update" id="id-7.-multiple-restrictions-update"></a>

Trigger next updates for multiple rates:

| **Room Type** | **Rate Plan**       | **Date**                             | **Restrictions**                                                                                    |
| ------------- | ------------------- | ------------------------------------ | --------------------------------------------------------------------------------------------------- |
| Twin Room     | Best Available Rate | 01 November 2026 to 10 November 2026 | <p>closed\_to\_arrival: true,<br>closed\_to\_departure: false,<br>max\_stay: 4,<br>min\_stay: 1</p> |
| Twin Room     | Bed & Breakfast     | 12 November 2026 to 16 November 2026 | <p>closed\_to\_arrival: false,<br>closed\_to\_departure: true,<br>min\_stay: 6</p>                  |
| Double Room   | Best Available Rate | 10 November 2026 to 16 November 2026 | <p>closed\_to\_arrival: true,<br>min\_stay: 2</p>                                                   |
| Double Room   | Bed & Breakfast     | 01 November 2026 to 20 November 2026 | min\_stay: 10                                                                                       |

{% hint style="info" %}
This should be 1 API call
{% endhint %}

### 8. Half-year Update <a href="#id-8.-half-year-update" id="id-8.-half-year-update"></a>

Trigger next updates for half-year period:

| **Room Type** | **Rate Plan**       | **Date**                        | **Restrictions**                                                                                  |
| ------------- | ------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------- |
| Twin Room     | Best Available Rate | 01 December 2026 to 01 May 2027 | <p>rate: 432$<br>closed\_to\_arrival: false,<br>closed\_to\_departure: false,<br>min\_stay: 2</p> |
| Double Room   | Best Available Rate | 01 December 2026 to 01 May 2027 | <p>rate: 342$<br>min\_stay: 3</p>                                                                 |

{% hint style="info" %}
This should be 1 API call
{% endhint %}

### 9. Single Date Availability Update <a href="#id-9.-single-date-availability-update" id="id-9.-single-date-availability-update"></a>

{% hint style="info" %}
You can simulate this event by making a booking in your PMS. Have the availability of Twin at 8 and Double as 1. Then add a booking to these nights requested.
{% endhint %}

Trigger next updates for availability:

| **Room Type** | **Date**         | **Value** |
| ------------- | ---------------- | --------- |
| Twin Room     | 21 November 2026 | 7         |
| Double Room   | 25 November 2026 | 0         |

{% hint style="info" %}
This should be 1 or 2 API calls
{% endhint %}

### 10. Multiple Date Availability Update <a href="#id-10.-multiple-date-availability-update" id="id-10.-multiple-date-availability-update"></a>

Trigger next updates for availability:

| **Room Type** | **Date**                            | **Value** |
| ------------- | ----------------------------------- | --------- |
| Twin Room     | 10 November 2026 - 16 November 2026 | 3         |
| Double Room   | 17 November 2026 - 24 November 2026 | 4         |

{% hint style="info" %}
This should be 1 or 2 API calls
{% endhint %}

### 11. Booking receiving <a href="#id-11.-booking-receiving" id="id-11.-booking-receiving"></a>

By using one of our Booking.com test account (<https://docs.channex.io/guides/test-account-for-booking.com>) create a new channel, setup mapping and launch it. Follow instructions at Test Account For Booking.com page and perform next operations:

* create a new booking (not import)
* modify existed booking
* cancel existed booking

{% hint style="info" %}
If you cant use our test accounts you can manually create bookings instead. Go to the Applications page and add the "Booking CRS" app, then go to booking page and there will be a "Create" button to manually make a booking. You can also edit and cancel the booking manually.
{% endhint %}

Be sure that you send Booking Acknowledge message. It is required step for certification.

Please, be sure that you do not use `GET api/v1/bookings...` endpoints, use `GET api/v1/booking_revisions...` instead.

If it is possible, please, use a Webhooks to handle notifications about Booking events.

As a results of this test case we expect to receive ID of received Booking and screenshots from your system with this Booking.

### 12. Rate Limits

Please look at proposed rate limits and make sure you have a queue or limiter to not spam our API endpoints. Let us know you can work with these limits

<https://docs.channex.io/api-v.1-documentation/rate-limits>

Can you stay in rate limits?

### 13. Update Logic

We will not accept any logic that just sends full sync on a timer basis

Example: Each 5 mins you send full update of availability for all rooms for 2 years.

We require partners to only send changes to availability and prices.

Full sync is allowed once every 24h if required but please schedule this on off peak hours and try to give some seconds between each property updates if you have a lot of properties to full sync.

Do you agree to only send updated changes to Channex?

### 14. Extra Notes

* Do you support both Min Stay Through and Arrival? If only one please specify which
* Do you not support the following restrictions? Stop Sell, CTA, CTD etc. Let us know if you don't support any
* Do you support multiple room types and multiple rate plans per room type?
* Do you need credit card details with bookings?
* Are you PCI Certified or use a PCI service like Vaultera, PCI Booking or Tokenex?

### Collect results <a href="#collect-results" id="collect-results"></a>

When you finish your tests, Please use this form: <https://forms.gle/xA8F3eSYBPBd8apYA>

In some cases we may require you to update your integration to be more efficient, if all is ok the certification should be successful and we will get back to you with the next steps for production server.
