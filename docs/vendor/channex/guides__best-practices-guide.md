<!-- https://docs.channex.io/guides/best-practices-guide.md -->
> For the complete documentation index, see [llms.txt](https://docs.channex.io/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://docs.channex.io/guides/best-practices-guide.md).

# Best Practices Guide

## Authentication

We use API keys at Channex. You can make 1 API key and use for all your properties or create a API key per property. For most cloud based systems 1 API key for all is fine since you will not expose it to the user.

If you are hosted then you will be better to create a API key for 1 or groups of properties since they might be able to read the API key from the UI.

## Restriction and Availability Updates

Channex process incoming ARI messages in a FIFO (First In First Out) principle. Messages are processed sequentially.

Don't send a lot of api calls with small changes, this will take much more time than sending 1 call with all details inside. Combine messages together and send it as batch.

Keep in mind that messages should be less than 10mb. Channex does not have any limits to the count of changes in one message.

Please read [Rate Limit](/api-v.1-documentation/rate-limits.md) page to see our rate limits

Example: If you would like to update prices for 1 rate plan for the next 100 days, you should send one message with 100 changes instead of 100 messages with 1 change per message.

Result: 1 API call instead of 100

{% hint style="success" %}
**Best Practices**

Combine updates together and send it as a single message instead of lots of small updates. If you would like to track changes at Property ARI, please, use our [Webhook API](/api-v.1-documentation/webhook-collection.md) for that.
{% endhint %}

## Get Bookings

To receive bookings from Channex we have provided a simple way with our [Feed API](/api-v.1-documentation/bookings-collection.md#booking-revisions-feed).

You just need to poll this endpoint and we will provide you all new bookings for all your properties, just make sure you check the property ID so it is delivered to the right property in the PMS.

Once you have the booking you just acknowledge it and then we will mark it as received and not send again.

Do not pull all bookings for a property constantly just in case you missed something. You should acknowledge only when you have successfully saved the booking. This means if it's acked it is in the PMS

{% hint style="success" %}
Use the Feed endpoint to get all new bookings and changes and ack them.
{% endhint %}
