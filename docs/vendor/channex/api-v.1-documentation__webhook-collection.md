<!-- https://docs.channex.io/api-v.1-documentation/webhook-collection.md -->
> For the complete documentation index, see [llms.txt](https://docs.channex.io/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://docs.channex.io/api-v.1-documentation/webhook-collection.md).

# Webhook Collection

You can create **Webhooks** to be notified about any changes of the property's ARI or about booking and some OTA specific webhooks.\
**Webhooks** are Push-notifications. When any changes happens, we send a POST request with JSON payload to the provided endpoint.

**Webhooks** can be global (related to whole account) or property-related. Global webhooks allow you have single point to manage endpoints, credentials and don't worry about that when new property is added. Property-level webhooks is suitable to setup specific logic for single property.

**Webhook UI**

We have an UI available to view, add and edit webhooks also so you can lessen your development efforts if you wish to manually set up instead of via API.

Property Webhooks: <https://staging.channex.io/organization/webhooks/property>

Global Webhooks: <https://staging.channex.io/organization/webhooks/global>

## Global Webhooks

By default, webhooks are scoped to a single property. **Global Webhooks** allow you to receive events for **all properties** associated with your account through a single webhook endpoint, removing the need to create and manage individual webhooks per property.

#### How It Works

To create a Global Webhook, set `property_id` to `null` and `is_global` to `true` in your webhook configuration:

```json
{
  "webhook": {
    "callback_url": "https://your-website.com/api/push_message",
    "event_mask": "*",
    "property_id": null,
    "is_global": true,
    "request_params": {},
    "headers": {},
    "is_active": true,
    "send_data": true
  }
}
```

Global Webhooks support the same event types, payload structures, and configuration options (`send_data`, `event_mask`, `headers`, `request_params`) as property-level webhooks. Every payload includes the `property_id` field, so your endpoint can identify which property triggered the event.

#### When to Use Global Webhooks

Global Webhooks are ideal when:

* Your system manages many properties and you want a centralized event handler rather than one webhook per property.
* New properties are added frequently and you want them covered automatically without additional webhook setup.

#### Important Notes

* Global Webhooks and property-level webhooks can coexist. If both are configured for the same event and property, your endpoint will receive only 1 webhook event. Property level webhook win.

## Webhook Security

Channex webhooks currently do not include a built-in HMAC signature or cryptographic signing mechanism similar to Stripe/GitHub webhook signatures.

Webhook authentication is instead designed around:

* HTTPS endpoints
* Custom shared-secret headers
* Optional IP allowlisting
* Your own replay/idempotency handling

### Recommended Authentication Approach

When registering a webhook endpoint, we recommend including a custom secret header such as:

```http
X-Channex-Webhook-Secret: your-random-secret
```

Your application should validate this secret on every incoming webhook request.

Use:

* long random secrets
* HTTPS only
* separate secrets per environment
* secret rotation where appropriate

### IP Allowlisting

For additional security, you may optionally restrict incoming webhook traffic to known Channex IP ranges where supported by your infrastructure.

### Important Notes

* Do not expose webhook endpoints publicly without validation.
* Do not rely solely on source IP validation.
* Always validate incoming payload structure before processing.
* Webhooks should be treated as untrusted external input.

## Webhook repeat logic

When we receive unexpected 5XX error from your webhook endpoint we make a new attempt for delivery with exponential backoff timeout. Max count of attempts is 11. Timeouts between attempts:\
\- 1 minute\
\- 2 minutes\
\- 4 minutes\
\- 8 minutes\
\- 15 minutes\
\- 30 minutes\
\- 1 hour\
\- 2 hours\
\- 4 hours\
\- 6 hours\
\- 10 hours

So, latest attempt will be close to 24h from original event.

## List of webhook events available

* `ari`\
  This will send you any ARI changes like changed availability or prices, useful if you allow users to change ARI in the Channex interface or mobile app and also to integrate any RM system
* `booking`\
  If you wish to get all booking changes then this is the one, you will get notification for any booking revision new, modified and cancelled.
* `booking_new`\
  Will be triggered only for Booking Revisions with status `new`.
* `booking_modification`\
  Will be triggered only for Booking Revisions with status `modified`.
* `booking_cancellation`\
  Will be triggered only for Booking Revisions with status `cancelled`.
* `booking_unmapped_room`\
  This will let you know if any bookings were created which were not mapped
* `booking_unmapped_rate`\
  Similar to unmapped room but this means room is mapped but rate is not
* `non_acked_booking`\
  Will be triggered when Booking Revision will be not acknowledged at 30 minutes after first receiving.
* `message`\
  If you use the messaging API this is required to push messages to you in real time
* `sync_error`\
  You can see any sync errors on your dashboard
* `sync_warning`\
  Will be triggered if some non-critical errors will be returned by OTA on sync.
* `rate_error`\
  Will be triggered if error associated with Rate values will be returned by OTA on sync.
* `reservation_request`\
  Airbnb specific, You can see a reservation request and can accept or deny.
* `alteration_request`\
  Airbnb specific, You can see an alteration request and can accept or deny.
* `accepted_reservation`\
  Airbnb specific, will be triggered when Reservation request will be accepted.
* `declined_reservation`\
  Airbnb specific, will be triggered when Reservation request will be declined.
* `inquiry`\
  Airbnb specific, You can see an inquiry request at Dashboard and Messages App.
* `review`\
  This will let you know if any new review is came.
* `updated_review`\
  Will be triggered when Review object will be updated (Guest feedback will be received).
* `new_channel`\
  Will be triggered when new Channel will be created for Property.
* `updated_channel`\
  Will be triggered when Channel is updated.
* `disconnect_channel`\
  Will be triggered when Channel is disconnected by automatic rules or User action.
* `disconnect_listing`\
  Will be triggered when Listing is disconnected from Airbnb Channel.
* `activate_channel`\
  Will be triggered when Channel is activated.
* `deactivate_channel`\
  Will be triggered when Channel is deactivated.
* `channel_removal_warning`\
  Will be triggered when an inactive Channel is approaching its automatic removal date (7 days and 1 day before removal).
* `property_removal_warning`\
  Will be triggered when a Property without active channels is approaching its automatic removal date (30 days, 7 days and 1 day before removal).
* `message_thread_booking_assigned` \
  Will be triggered when Message Thread created before Booking is linked to incoming Booking.

## Webhooks List

## GET /webhooks

> Retrieve a list of webhooks associated with the user's properties.

```json
{"openapi":"3.1.0","info":{"title":"Webhooks API","version":"0.0.0"},"tags":[{"name":"Webhooks"}],"security":[{"ApiKeyAuth":[]}],"components":{"securitySchemes":{"ApiKeyAuth":{"type":"apiKey","in":"header","name":"user-api-key"}},"schemas":{"ChannexIO.Common.Scalars.id":{"type":"string","format":"uuid"},"Models.WebhookReadModel":{"type":"object","required":["callback_url","event_mask","request_params","headers","is_active","send_data","protected","is_global"],"properties":{"callback_url":{"type":"string","format":"uri","description":"Callback URL that will receive POST requests when trigger events occur."},"event_mask":{"$ref":"#/components/schemas/Models.EventMask"},"request_params":{"anyOf":[{"type":"object","unevaluatedProperties":{"type":"string"}},{"type":"null"}]},"headers":{"anyOf":[{"type":"object","unevaluatedProperties":{"type":"string"}},{"type":"null"}]},"is_active":{"type":"boolean"},"send_data":{"type":"boolean"},"protected":{"type":"boolean"},"is_global":{"type":"boolean"}},"description":"Webhook model returned under `data.attributes`.\nMatches current API (read shape)."},"Models.EventMask":{"type":"string","description":"Event mask filter. Use `*` to subscribe to all events, or provide a semicolon-separated\nlist of values from `WebhookEvent`. Examples: `\"*\"`, `\"booking\"`,\n`\"booking_new;booking_modification;booking_cancellation\"`."},"Responses.WebhookRelationships":{"type":"object","required":["organization"],"properties":{"property":{"type":"object","properties":{"data":{"type":"object","properties":{"type":{"type":"string","enum":["property"]},"id":{"$ref":"#/components/schemas/ChannexIO.Common.Scalars.id"}},"required":["type","id"]}},"required":["data"]},"organization":{"type":"object","properties":{"data":{"type":"object","properties":{"type":{"type":"string","enum":["organization"]},"id":{"$ref":"#/components/schemas/ChannexIO.Common.Scalars.id"}},"required":["type","id"]}},"required":["data"]}}},"ChannexIO.Common.Pagination.PaginationMeta":{"type":"object","required":["page","limit","total"],"properties":{"page":{"allOf":[{"$ref":"#/components/schemas/ChannexIO.Common.Scalars.positiveInt"}]},"limit":{"allOf":[{"$ref":"#/components/schemas/ChannexIO.Common.Scalars.positiveInt"}]},"total":{"allOf":[{"$ref":"#/components/schemas/ChannexIO.Common.Scalars.nonNegativeInt"}]}}},"ChannexIO.Common.Scalars.positiveInt":{"type":"integer","format":"int32","minimum":1},"ChannexIO.Common.Scalars.nonNegativeInt":{"type":"integer","format":"int32","minimum":0},"ChannexIO.Common.Responses.Errors.Models.UnauthorizedError":{"type":"object","required":["errors"],"properties":{"errors":{"type":"object","properties":{"code":{"type":"string","enum":["unauthorized"]},"title":{"type":"string","enum":["Unauthorized"]}},"required":["code","title"]}}}}},"paths":{"/webhooks":{"get":{"operationId":"list_webhooks","description":"Retrieve a list of webhooks associated with the user's properties.","parameters":[{"name":"pagination[page]","in":"query","required":false,"schema":{"type":"integer","format":"int32"},"explode":false},{"name":"pagination[limit]","in":"query","required":false,"schema":{"type":"integer","format":"int32"},"explode":false}],"responses":{"200":{"description":"The request has succeeded.","content":{"application/json":{"schema":{"type":"object","required":["data","meta"],"properties":{"data":{"type":"array","items":{"type":"object","required":["type","id","attributes","relationships"],"properties":{"type":{"type":"string","enum":["webhook"]},"id":{"$ref":"#/components/schemas/ChannexIO.Common.Scalars.id"},"attributes":{"$ref":"#/components/schemas/Models.WebhookReadModel"},"relationships":{"$ref":"#/components/schemas/Responses.WebhookRelationships"}}}},"meta":{"$ref":"#/components/schemas/ChannexIO.Common.Pagination.PaginationMeta"}}}}}},"401":{"description":"Access is unauthorized.","content":{"application/json":{"schema":{"$ref":"#/components/schemas/ChannexIO.Common.Responses.Errors.Models.UnauthorizedError"}}}}},"tags":["Webhooks"]}}}}
```

## Get Webhook by ID

## GET /webhooks/{webhookId}

> Retrieve a specific webhook by ID.

```json
{"openapi":"3.1.0","info":{"title":"Webhooks API","version":"0.0.0"},"tags":[{"name":"Webhooks"}],"security":[{"ApiKeyAuth":[]}],"components":{"securitySchemes":{"ApiKeyAuth":{"type":"apiKey","in":"header","name":"user-api-key"}},"schemas":{"ChannexIO.Common.Scalars.id":{"type":"string","format":"uuid"},"Models.WebhookReadModel":{"type":"object","required":["callback_url","event_mask","request_params","headers","is_active","send_data","protected","is_global"],"properties":{"callback_url":{"type":"string","format":"uri","description":"Callback URL that will receive POST requests when trigger events occur."},"event_mask":{"$ref":"#/components/schemas/Models.EventMask"},"request_params":{"anyOf":[{"type":"object","unevaluatedProperties":{"type":"string"}},{"type":"null"}]},"headers":{"anyOf":[{"type":"object","unevaluatedProperties":{"type":"string"}},{"type":"null"}]},"is_active":{"type":"boolean"},"send_data":{"type":"boolean"},"protected":{"type":"boolean"},"is_global":{"type":"boolean"}},"description":"Webhook model returned under `data.attributes`.\nMatches current API (read shape)."},"Models.EventMask":{"type":"string","description":"Event mask filter. Use `*` to subscribe to all events, or provide a semicolon-separated\nlist of values from `WebhookEvent`. Examples: `\"*\"`, `\"booking\"`,\n`\"booking_new;booking_modification;booking_cancellation\"`."},"Responses.WebhookRelationships":{"type":"object","required":["organization"],"properties":{"property":{"type":"object","properties":{"data":{"type":"object","properties":{"type":{"type":"string","enum":["property"]},"id":{"$ref":"#/components/schemas/ChannexIO.Common.Scalars.id"}},"required":["type","id"]}},"required":["data"]},"organization":{"type":"object","properties":{"data":{"type":"object","properties":{"type":{"type":"string","enum":["organization"]},"id":{"$ref":"#/components/schemas/ChannexIO.Common.Scalars.id"}},"required":["type","id"]}},"required":["data"]}}},"ChannexIO.Common.Responses.Errors.Models.UnauthorizedError":{"type":"object","required":["errors"],"properties":{"errors":{"type":"object","properties":{"code":{"type":"string","enum":["unauthorized"]},"title":{"type":"string","enum":["Unauthorized"]}},"required":["code","title"]}}},"ChannexIO.Common.Responses.Errors.Models.NotFoundError":{"type":"object","required":["errors"],"properties":{"errors":{"type":"object","properties":{"code":{"type":"string","enum":["resource_not_found"]},"title":{"type":"string","enum":["Resource Not Found"]}},"required":["code","title"]}}}}},"paths":{"/webhooks/{webhookId}":{"get":{"operationId":"get_webhook","description":"Retrieve a specific webhook by ID.","parameters":[{"name":"webhookId","in":"path","required":true,"schema":{"$ref":"#/components/schemas/ChannexIO.Common.Scalars.id"}}],"responses":{"200":{"description":"The request has succeeded.","content":{"application/json":{"schema":{"type":"object","required":["data"],"properties":{"data":{"type":"object","required":["type","id","attributes","relationships"],"properties":{"type":{"type":"string","enum":["webhook"]},"id":{"$ref":"#/components/schemas/ChannexIO.Common.Scalars.id"},"attributes":{"$ref":"#/components/schemas/Models.WebhookReadModel"},"relationships":{"$ref":"#/components/schemas/Responses.WebhookRelationships"}}}}}}}},"401":{"description":"Access is unauthorized.","content":{"application/json":{"schema":{"$ref":"#/components/schemas/ChannexIO.Common.Responses.Errors.Models.UnauthorizedError"}}}},"404":{"description":"The server cannot find the requested resource.","content":{"application/json":{"schema":{"$ref":"#/components/schemas/ChannexIO.Common.Responses.Errors.Models.NotFoundError"}}}}},"tags":["Webhooks"]}}}}
```

## Create Webhook

## POST /webhooks

> Create a new webhook.

```json
{"openapi":"3.1.0","info":{"title":"Webhooks API","version":"0.0.0"},"tags":[{"name":"Webhooks"}],"security":[{"ApiKeyAuth":[]}],"components":{"securitySchemes":{"ApiKeyAuth":{"type":"apiKey","in":"header","name":"user-api-key"}},"schemas":{"ChannexIO.Common.Scalars.id":{"type":"string","format":"uuid"},"Models.WebhookReadModel":{"type":"object","required":["callback_url","event_mask","request_params","headers","is_active","send_data","protected","is_global"],"properties":{"callback_url":{"type":"string","format":"uri","description":"Callback URL that will receive POST requests when trigger events occur."},"event_mask":{"$ref":"#/components/schemas/Models.EventMask"},"request_params":{"anyOf":[{"type":"object","unevaluatedProperties":{"type":"string"}},{"type":"null"}]},"headers":{"anyOf":[{"type":"object","unevaluatedProperties":{"type":"string"}},{"type":"null"}]},"is_active":{"type":"boolean"},"send_data":{"type":"boolean"},"protected":{"type":"boolean"},"is_global":{"type":"boolean"}},"description":"Webhook model returned under `data.attributes`.\nMatches current API (read shape)."},"Models.EventMask":{"type":"string","description":"Event mask filter. Use `*` to subscribe to all events, or provide a semicolon-separated\nlist of values from `WebhookEvent`. Examples: `\"*\"`, `\"booking\"`,\n`\"booking_new;booking_modification;booking_cancellation\"`."},"Responses.WebhookRelationships":{"type":"object","required":["organization"],"properties":{"property":{"type":"object","properties":{"data":{"type":"object","properties":{"type":{"type":"string","enum":["property"]},"id":{"$ref":"#/components/schemas/ChannexIO.Common.Scalars.id"}},"required":["type","id"]}},"required":["data"]},"organization":{"type":"object","properties":{"data":{"type":"object","properties":{"type":{"type":"string","enum":["organization"]},"id":{"$ref":"#/components/schemas/ChannexIO.Common.Scalars.id"}},"required":["type","id"]}},"required":["data"]}}},"ChannexIO.Common.Responses.Errors.Models.UnauthorizedError":{"type":"object","required":["errors"],"properties":{"errors":{"type":"object","properties":{"code":{"type":"string","enum":["unauthorized"]},"title":{"type":"string","enum":["Unauthorized"]}},"required":["code","title"]}}},"ChannexIO.Common.Responses.Errors.Models.ValidationError":{"type":"object","required":["errors"],"properties":{"errors":{"type":"object","properties":{"code":{"type":"string","enum":["validation_error"]},"title":{"type":"string","enum":["Validation Error"]},"details":{"type":"object","properties":{"field":{"type":"array","items":{"type":"string"}}},"required":["field"]}},"required":["code","title","details"]}}},"Requests.WebhookRequest":{"type":"object","required":["webhook"],"properties":{"webhook":{"$ref":"#/components/schemas/Models.WebhookWriteModel"}}},"Models.WebhookWriteModel":{"type":"object","required":["callback_url","event_mask","property_id"],"properties":{"callback_url":{"type":"string","format":"uri","description":"Callback URL that will receive POST requests when trigger events occur."},"event_mask":{"$ref":"#/components/schemas/Models.EventMask"},"property_id":{"anyOf":[{"$ref":"#/components/schemas/ChannexIO.Common.Scalars.id"},{"type":"null"}],"description":"UUID of the property associated with this webhook. Can be null for global webhooks that receive events from all properties in the account."},"request_params":{"anyOf":[{"type":"object","unevaluatedProperties":{"type":"string"}},{"type":"null"}],"description":"JSON object with additional GET query parameters for the callback request."},"headers":{"anyOf":[{"type":"object","unevaluatedProperties":{"type":"string"}},{"type":"null"}],"description":"JSON object with custom request headers for the callback request."},"is_active":{"type":"boolean","description":"Whether the webhook is active. Defaults to `false`."},"send_data":{"type":"boolean","description":"Whether to include event payload data in the callback. Defaults to `false`."},"protected":{"type":"boolean","description":"Whether the webhook is protected. Defaults to `false`."},"is_global":{"type":"boolean","description":"Whether the webhook is global (not associated with a specific property). Defaults to `false`. Global webhooks receive events from all properties in the account."}},"description":"Webhook model used in request bodies (`{ webhook: ... }`).\nMatches current API (write shape)."}}},"paths":{"/webhooks":{"post":{"operationId":"create_webhook","description":"Create a new webhook.","parameters":[],"responses":{"201":{"description":"The request has succeeded and a new resource has been created as a result.","content":{"application/json":{"schema":{"type":"object","required":["data"],"properties":{"data":{"type":"object","required":["type","id","attributes","relationships"],"properties":{"type":{"type":"string","enum":["webhook"]},"id":{"$ref":"#/components/schemas/ChannexIO.Common.Scalars.id"},"attributes":{"$ref":"#/components/schemas/Models.WebhookReadModel"},"relationships":{"$ref":"#/components/schemas/Responses.WebhookRelationships"}}}}}}}},"401":{"description":"Access is unauthorized.","content":{"application/json":{"schema":{"$ref":"#/components/schemas/ChannexIO.Common.Responses.Errors.Models.UnauthorizedError"}}}},"422":{"description":"Client error","content":{"application/json":{"schema":{"$ref":"#/components/schemas/ChannexIO.Common.Responses.Errors.Models.ValidationError"}}}}},"tags":["Webhooks"],"requestBody":{"required":true,"content":{"application/json":{"schema":{"$ref":"#/components/schemas/Requests.WebhookRequest"}}}}}}}}
```

## Update Webhook

## PUT /webhooks/{webhookId}

> Update an existing webhook.

```json
{"openapi":"3.1.0","info":{"title":"Webhooks API","version":"0.0.0"},"tags":[{"name":"Webhooks"}],"security":[{"ApiKeyAuth":[]}],"components":{"securitySchemes":{"ApiKeyAuth":{"type":"apiKey","in":"header","name":"user-api-key"}},"schemas":{"ChannexIO.Common.Scalars.id":{"type":"string","format":"uuid"},"Models.WebhookReadModel":{"type":"object","required":["callback_url","event_mask","request_params","headers","is_active","send_data","protected","is_global"],"properties":{"callback_url":{"type":"string","format":"uri","description":"Callback URL that will receive POST requests when trigger events occur."},"event_mask":{"$ref":"#/components/schemas/Models.EventMask"},"request_params":{"anyOf":[{"type":"object","unevaluatedProperties":{"type":"string"}},{"type":"null"}]},"headers":{"anyOf":[{"type":"object","unevaluatedProperties":{"type":"string"}},{"type":"null"}]},"is_active":{"type":"boolean"},"send_data":{"type":"boolean"},"protected":{"type":"boolean"},"is_global":{"type":"boolean"}},"description":"Webhook model returned under `data.attributes`.\nMatches current API (read shape)."},"Models.EventMask":{"type":"string","description":"Event mask filter. Use `*` to subscribe to all events, or provide a semicolon-separated\nlist of values from `WebhookEvent`. Examples: `\"*\"`, `\"booking\"`,\n`\"booking_new;booking_modification;booking_cancellation\"`."},"Responses.WebhookRelationships":{"type":"object","required":["organization"],"properties":{"property":{"type":"object","properties":{"data":{"type":"object","properties":{"type":{"type":"string","enum":["property"]},"id":{"$ref":"#/components/schemas/ChannexIO.Common.Scalars.id"}},"required":["type","id"]}},"required":["data"]},"organization":{"type":"object","properties":{"data":{"type":"object","properties":{"type":{"type":"string","enum":["organization"]},"id":{"$ref":"#/components/schemas/ChannexIO.Common.Scalars.id"}},"required":["type","id"]}},"required":["data"]}}},"ChannexIO.Common.Responses.Errors.Models.UnauthorizedError":{"type":"object","required":["errors"],"properties":{"errors":{"type":"object","properties":{"code":{"type":"string","enum":["unauthorized"]},"title":{"type":"string","enum":["Unauthorized"]}},"required":["code","title"]}}},"ChannexIO.Common.Responses.Errors.Models.NotFoundError":{"type":"object","required":["errors"],"properties":{"errors":{"type":"object","properties":{"code":{"type":"string","enum":["resource_not_found"]},"title":{"type":"string","enum":["Resource Not Found"]}},"required":["code","title"]}}},"ChannexIO.Common.Responses.Errors.Models.ValidationError":{"type":"object","required":["errors"],"properties":{"errors":{"type":"object","properties":{"code":{"type":"string","enum":["validation_error"]},"title":{"type":"string","enum":["Validation Error"]},"details":{"type":"object","properties":{"field":{"type":"array","items":{"type":"string"}}},"required":["field"]}},"required":["code","title","details"]}}},"Requests.WebhookRequest":{"type":"object","required":["webhook"],"properties":{"webhook":{"$ref":"#/components/schemas/Models.WebhookWriteModel"}}},"Models.WebhookWriteModel":{"type":"object","required":["callback_url","event_mask","property_id"],"properties":{"callback_url":{"type":"string","format":"uri","description":"Callback URL that will receive POST requests when trigger events occur."},"event_mask":{"$ref":"#/components/schemas/Models.EventMask"},"property_id":{"anyOf":[{"$ref":"#/components/schemas/ChannexIO.Common.Scalars.id"},{"type":"null"}],"description":"UUID of the property associated with this webhook. Can be null for global webhooks that receive events from all properties in the account."},"request_params":{"anyOf":[{"type":"object","unevaluatedProperties":{"type":"string"}},{"type":"null"}],"description":"JSON object with additional GET query parameters for the callback request."},"headers":{"anyOf":[{"type":"object","unevaluatedProperties":{"type":"string"}},{"type":"null"}],"description":"JSON object with custom request headers for the callback request."},"is_active":{"type":"boolean","description":"Whether the webhook is active. Defaults to `false`."},"send_data":{"type":"boolean","description":"Whether to include event payload data in the callback. Defaults to `false`."},"protected":{"type":"boolean","description":"Whether the webhook is protected. Defaults to `false`."},"is_global":{"type":"boolean","description":"Whether the webhook is global (not associated with a specific property). Defaults to `false`. Global webhooks receive events from all properties in the account."}},"description":"Webhook model used in request bodies (`{ webhook: ... }`).\nMatches current API (write shape)."}}},"paths":{"/webhooks/{webhookId}":{"put":{"operationId":"update_webhook","description":"Update an existing webhook.","parameters":[{"name":"webhookId","in":"path","required":true,"schema":{"$ref":"#/components/schemas/ChannexIO.Common.Scalars.id"}}],"responses":{"200":{"description":"The request has succeeded.","content":{"application/json":{"schema":{"type":"object","required":["data"],"properties":{"data":{"type":"object","required":["type","id","attributes","relationships"],"properties":{"type":{"type":"string","enum":["webhook"]},"id":{"$ref":"#/components/schemas/ChannexIO.Common.Scalars.id"},"attributes":{"$ref":"#/components/schemas/Models.WebhookReadModel"},"relationships":{"$ref":"#/components/schemas/Responses.WebhookRelationships"}}}}}}}},"401":{"description":"Access is unauthorized.","content":{"application/json":{"schema":{"$ref":"#/components/schemas/ChannexIO.Common.Responses.Errors.Models.UnauthorizedError"}}}},"404":{"description":"The server cannot find the requested resource.","content":{"application/json":{"schema":{"$ref":"#/components/schemas/ChannexIO.Common.Responses.Errors.Models.NotFoundError"}}}},"422":{"description":"Client error","content":{"application/json":{"schema":{"$ref":"#/components/schemas/ChannexIO.Common.Responses.Errors.Models.ValidationError"}}}}},"tags":["Webhooks"],"requestBody":{"required":true,"content":{"application/json":{"schema":{"$ref":"#/components/schemas/Requests.WebhookRequest"}}}}}}}}
```

## Remove Webhook

## DELETE /webhooks/{webhookId}

> Remove a webhook.

```json
{"openapi":"3.1.0","info":{"title":"Webhooks API","version":"0.0.0"},"tags":[{"name":"Webhooks"}],"security":[{"ApiKeyAuth":[]}],"components":{"securitySchemes":{"ApiKeyAuth":{"type":"apiKey","in":"header","name":"user-api-key"}},"schemas":{"ChannexIO.Common.Scalars.id":{"type":"string","format":"uuid"},"ChannexIO.Common.Responses.Success.Response":{"type":"object","required":["meta"],"properties":{"meta":{"type":"object","properties":{"message":{"type":"string","enum":["Success"]}},"required":["message"]}}},"ChannexIO.Common.Responses.Errors.Models.UnauthorizedError":{"type":"object","required":["errors"],"properties":{"errors":{"type":"object","properties":{"code":{"type":"string","enum":["unauthorized"]},"title":{"type":"string","enum":["Unauthorized"]}},"required":["code","title"]}}},"ChannexIO.Common.Responses.Errors.Models.NotFoundError":{"type":"object","required":["errors"],"properties":{"errors":{"type":"object","properties":{"code":{"type":"string","enum":["resource_not_found"]},"title":{"type":"string","enum":["Resource Not Found"]}},"required":["code","title"]}}}}},"paths":{"/webhooks/{webhookId}":{"delete":{"operationId":"remove_webhook","description":"Remove a webhook.","parameters":[{"name":"webhookId","in":"path","required":true,"schema":{"$ref":"#/components/schemas/ChannexIO.Common.Scalars.id"}}],"responses":{"200":{"description":"The request has succeeded.","content":{"application/json":{"schema":{"$ref":"#/components/schemas/ChannexIO.Common.Responses.Success.Response"}}}},"401":{"description":"Access is unauthorized.","content":{"application/json":{"schema":{"$ref":"#/components/schemas/ChannexIO.Common.Responses.Errors.Models.UnauthorizedError"}}}},"404":{"description":"The server cannot find the requested resource.","content":{"application/json":{"schema":{"$ref":"#/components/schemas/ChannexIO.Common.Responses.Errors.Models.NotFoundError"}}}}},"tags":["Webhooks"]}}}}
```

## Test Webhook

## POST /webhooks/test

> Test a webhook by sending a test POST request to the callback URL. Returns the status code and body from the target endpoint.

```json
{"openapi":"3.1.0","info":{"title":"Webhooks API","version":"0.0.0"},"tags":[{"name":"Webhooks"}],"security":[{"ApiKeyAuth":[]}],"components":{"securitySchemes":{"ApiKeyAuth":{"type":"apiKey","in":"header","name":"user-api-key"}},"schemas":{"Responses.WebhookTestResponse":{"type":"object","required":["status_code","body"],"properties":{"status_code":{"type":"integer","format":"int32","description":"HTTP status code returned by the callback URL."},"body":{"type":"string","description":"Response body returned by the callback URL."}}},"ChannexIO.Common.Responses.Errors.Models.UnauthorizedError":{"type":"object","required":["errors"],"properties":{"errors":{"type":"object","properties":{"code":{"type":"string","enum":["unauthorized"]},"title":{"type":"string","enum":["Unauthorized"]}},"required":["code","title"]}}},"ChannexIO.Common.Responses.Errors.Models.ValidationError":{"type":"object","required":["errors"],"properties":{"errors":{"type":"object","properties":{"code":{"type":"string","enum":["validation_error"]},"title":{"type":"string","enum":["Validation Error"]},"details":{"type":"object","properties":{"field":{"type":"array","items":{"type":"string"}}},"required":["field"]}},"required":["code","title","details"]}}},"Requests.WebhookRequest":{"type":"object","required":["webhook"],"properties":{"webhook":{"$ref":"#/components/schemas/Models.WebhookWriteModel"}}},"Models.WebhookWriteModel":{"type":"object","required":["callback_url","event_mask","property_id"],"properties":{"callback_url":{"type":"string","format":"uri","description":"Callback URL that will receive POST requests when trigger events occur."},"event_mask":{"$ref":"#/components/schemas/Models.EventMask"},"property_id":{"anyOf":[{"$ref":"#/components/schemas/ChannexIO.Common.Scalars.id"},{"type":"null"}],"description":"UUID of the property associated with this webhook. Can be null for global webhooks that receive events from all properties in the account."},"request_params":{"anyOf":[{"type":"object","unevaluatedProperties":{"type":"string"}},{"type":"null"}],"description":"JSON object with additional GET query parameters for the callback request."},"headers":{"anyOf":[{"type":"object","unevaluatedProperties":{"type":"string"}},{"type":"null"}],"description":"JSON object with custom request headers for the callback request."},"is_active":{"type":"boolean","description":"Whether the webhook is active. Defaults to `false`."},"send_data":{"type":"boolean","description":"Whether to include event payload data in the callback. Defaults to `false`."},"protected":{"type":"boolean","description":"Whether the webhook is protected. Defaults to `false`."},"is_global":{"type":"boolean","description":"Whether the webhook is global (not associated with a specific property). Defaults to `false`. Global webhooks receive events from all properties in the account."}},"description":"Webhook model used in request bodies (`{ webhook: ... }`).\nMatches current API (write shape)."},"Models.EventMask":{"type":"string","description":"Event mask filter. Use `*` to subscribe to all events, or provide a semicolon-separated\nlist of values from `WebhookEvent`. Examples: `\"*\"`, `\"booking\"`,\n`\"booking_new;booking_modification;booking_cancellation\"`."},"ChannexIO.Common.Scalars.id":{"type":"string","format":"uuid"}}},"paths":{"/webhooks/test":{"post":{"operationId":"test_webhook","description":"Test a webhook by sending a test POST request to the callback URL. Returns the status code and body from the target endpoint.","parameters":[],"responses":{"200":{"description":"The request has succeeded.","content":{"application/json":{"schema":{"$ref":"#/components/schemas/Responses.WebhookTestResponse"}}}},"401":{"description":"Access is unauthorized.","content":{"application/json":{"schema":{"$ref":"#/components/schemas/ChannexIO.Common.Responses.Errors.Models.UnauthorizedError"}}}},"422":{"description":"Client error","content":{"application/json":{"schema":{"$ref":"#/components/schemas/ChannexIO.Common.Responses.Errors.Models.ValidationError"}}}}},"tags":["Webhooks"],"requestBody":{"required":true,"content":{"application/json":{"schema":{"$ref":"#/components/schemas/Requests.WebhookRequest"}}}}}}}}
```

## Payloads

### No Data Version <a href="#no-data-version" id="no-data-version"></a>

The message is provided to the provided webhook endpoint, depending on the webhook settings (`send_data`). If `send_data` is `true`, Channex will push the message payload, if `false` message payload will be removed and target endpoint will only receive `event`, `user_id`, `property_id` and `timestamp` fields.

```json
{
  "event": "booking_new",
  "property_id": "90958ec0-9214-4796-873e-4add0d834670",
  "user_id": null,
  "timestamp": "2021-12-24T00:00:00.0000Z"
}
```

### Webhooks with data payload <a href="#webhooks-with-data-payload" id="webhooks-with-data-payload"></a>

#### ARI (Availability, Rates & Restrictions) <a href="#ari-availability-rates-and-restrictions" id="ari-availability-rates-and-restrictions"></a>

Triggered when any changes have happened at the property State or inventory table. We provide information about changed prices, restrictions and availability.

Note: We have included the user ID of who generated the changes, this can be useful if you would like to ignore changes made by your own app.

```json
{
  "event": "ari",
  "payload": [
    {
      "availability": 5,
      "booked": 7,
      "date": "2021-12-02",
      "rate_plan_id": "04c607e4-644d-45ea-ab1a-da920ee36e50",
      "room_type_id": "27e24739-239c-4619-9c30-0dc390f5d7ac",
      "stop_sell": false
    }
  ],
  "property_id": "90958ec0-9713-1196-873e-4add0d834670",
  "user_id": null,
  "timestamp": "2021-12-24T00:00:00.0000Z"
}
```

#### Booking <a href="#booking" id="booking"></a>

Triggered when Channex receives a booking revision (New, Cancelled or Modified).

```json
{
  "event": "booking",
  "payload": {
    "booking_id": "e10de9d1-3e2c-431c-b88c-ffca9ed5db5d",
    "property_id": "90958ec0-9713-1196-873e-4add0d834670",
    "revision_id": "80b3b60c-5e24-35c5-ad1b-da67cd704093"
  },
  "property_id": "90958ec0-9713-1396-873e-4add0d834670",
  "user_id": null,
  "timestamp": "2021-12-24T00:00:00.0000Z"
}
```

This event was originally designed to trigger a Pull booking revision operation from the PMS. When this event arrives, we expect the PMS will call `api/v1/booking_revisions/:id`, to pull the new revision and ack it.

Alternatively the PMS can call the Feed endpoint also to get list of all unack bookings.

#### Booking Unmapped Room <a href="#booking-unmapped-room" id="booking-unmapped-room"></a>

Triggered when Channex receives a booking revision but can’t map it with existing Room Types. This can happen if the channel is not mapped correctly or if the OTA provides ID which has no mapping.

This event is designed to notify PMS about potential problems at mapping and usually used to trigger notification to support team at PMS side to investigate problems with mapping.

Please, keep in mind, to prevent any potential problems with overbookings, Mapping Issues should be solved in short time-frame and should have high priority.

```json
{
  "event": "booking_unmapped_room",
  "payload": {
    "booking_id": "4995a8d5-552b-4d6c-acc5-cc8ca45bd32a",
    "booking_revision_id": "8a5c7299-611e-4b57-a703-7e146b538750"
  },
  "property_id": "a88cdfa3-2e25-1bcc-ab18-2d4f899ca49b",
  "user_id": null,
  "timestamp": "2021-12-24T00:00:00.0000Z"
}
```

#### Booking Unmapped Rate <a href="#booking-unmapped-rate" id="booking-unmapped-rate"></a>

Triggered when Channex receives a booking revision but can’t map it with existing Rate Plans.

This trigger will not come if revision has not mapped Room Type error. Booking Unmapped Room event will mute Booking Unmapped Rate, because when we have no mapped Room it also means rate is not mapped.

This event is designed to notify PMS about potential problems at mapping, but in that case, we can map Room (and correctly process Availability changes), but can’t map to Rate Plan.

```json
{
  "event": "booking_unmapped_rate",
  "payload": {
    "booking_id": "4995a8d5-552b-4d6c-acc5-cc8ca45bd32a",
    "booking_revision_id": "8a5c7299-611e-4b57-a703-7e146b538750"
  },
  "property_id": "a88cdfa3-2e25-3bcc-ab18-2d4f899ca49b",
  "user_id": null,
  "timestamp": "2021-12-24T00:00:00.0000Z"
}
```

#### Message <a href="#message" id="message"></a>

Triggered when new chat message from a guest is registered at Channex.

```json
{
  "event": "message",
  "payload": {
    "id": "e10b1d2d-ac82-46f3-810f-a18514eca3e1",
    "message": "Thanks a lot.",
    "meta": null,
    "sender": "guest",
    "property_id": "680585d7-af7f-4880-8e91-25fca1508b55",
    "booking_id": "c680428a-573a-4969-bcd8-c92d16cff54a",
    "message_thread_id": "bb737f04-c418-4c35-b821-4cf1a58ce626",
    "live_feed_event_id": "fb3365e5-3460-4a57-6747-828bf871fcf3",
    "attachments": [],
    "have_attachment": false,
    "ota_message_id": "0d8aadb0-a2e8-11f0-be32-995226a481d7"
  },
  "property_id": "680585d7-af7f-4880-8e91-25fca1508b55",
  "user_id": null,
  "timestamp": "2021-12-24T00:00:00.0000Z"
}
```

#### Sync Error <a href="#sync-error" id="sync-error"></a>

Triggered when sync error has happened at a connected channel.

Originally designed to notify PMS about potential problems at existed connections.

```json
{
  "event": "sync_error",
  "payload": {
    "channel": "Agoda",
    "channel_event_id": "e7883431-3df6-412f-8c07-0d5e1d983e0f",
    "channel_id": "d691462b-45d1-4655-9076-072210f2ceca",
    "channel_name": "Agoda",
    "error_type": "general_error",
    "property_name": "Hotel Name"
  },
  "property_id": "d69a591e-9be3-4822-cc95-7374ed13a673",
  "user_id": null,
  "timestamp": "2021-12-24T00:00:00.0000Z"
}
```

#### Reservation Request <a href="#reservation-request" id="reservation-request"></a>

Triggered when Channex receives a Reservation Request from Airbnb.

Contains information about requested reservation.

```json
{
  "event": "reservation_request",
  "payload": {
    "bms": BOOKING_MESSAGE,
    "resolved": false
  },
  "property_id": "4b70ec18-9ec1-4f77-8408-628b6477e824",
  "user_id": null,
  "timestamp": "2021-12-24T00:00:00.0000Z"
}
```

Where BOOKING\_MESSAGE is structure equal to regular Booking Revision structure.

#### Review

Triggered when Channex receives a Review.

```json
{
  "event": "review",
  "payload": {
    "id": "8b5e56bf-515c-4981-8c2a-8d19f6073c23",
    "reply": null,
    "content": null,
    "channel_id": "e990a463-9524-41ec-b741-d19fcd024e06",
    "scores": [
      {
        "category": "value",
        "score": 10.0
      },
      {
        "category": "clean",
        "score": 10.0
      },
      {
        "category": "location",
        "score": 10.0
      },
      {
        "category": "comfort",
        "score": 7.5
      },
      {
        "category": "facilities",
        "score": 10.0
      },
      {
        "category": "staff",
        "score": 10.0
      }
    ],
    "ota": "BookingCom",
    "property_id": "4b70ec18-9ec1-4f77-8408-628b6477e824",
    "expired_at": "2024-11-03T07:35:21.000000",
    "is_hidden": false,
    "is_replied": false,
    "ota_overall_score": 10.0,
    "ota_reservation_id": "4874110092",
    "ota_review_id": "OyQHKvMWfda",
    "ota_scores": [
      {
        "category": "value",
        "score": 10.0
      },
      {
        "category": "clean",
        "score": 10.0
      },
      {
        "category": "location",
        "score": 10.0
      },
      {
        "category": "comfort",
        "score": 7.5
      },
      {
        "category": "facilities",
        "score": 10.0
      },
      {
        "category": "staff",
        "score": 10.0
      }
    ],
    "overall_score": 10.0,
    "raw_content": null,
    "received_at": "2024-08-05T07:35:21.000000",
    "reviewer_name": null,
    "booking_id": "66101c21-178f-41b8-adb6-09a8b783dc69",
    "live_feed_event_id": "69121b1e-90d3-4903-8370-5468fc4f39cf",
    "ota_inserted_at": null,
    "reply_scheduled_at": null,
    "reply_sent_at": null
  },
  "property_id": "4b70ec18-9ec1-4f77-8408-628b6477e824",
  "user_id": null,
  "timestamp": "2021-12-24T00:00:00.0000Z"
}
```

#### Activate / Deactivate Channel <a href="#activate-deactivate-channel" id="activate-deactivate-channel"></a>

```json
{
   "timestamp":"2026-01-26T14:40:54.310491Z",
   "user_id":null,
   "payload":{
      "title":"Test Channel",
      "channel_id":"99f25e27-3152-41bc-884c-be13f98e7bbc",
      "ota_name":"Klook"
   },
   "property_id":"a92c01bb-4fc1-4c9e-9579-7d4e1ec607b8",
   "event":"activate_channel" | "deactivate_channel"
}
```

#### Non Acked Booking <a href="#non-acked-booking" id="non-acked-booking"></a>

```json
{
   "timestamp":"2026-01-26T14:40:54.310491Z",
   "user_id":null,
   "payload": {
      "currency":"EUR",
      "amount":"210.60",
      "channel_id":"b1a37301-c0ac-45e5-b1fb-c255eca7259c",
      "property_id":"a92c01bb-4fc1-4c9e-9579-7d4e1ec607b8",
      "booking_id":"a9148a2e-2434-488f-9849-74fa27eb0c77",
      "arrival_date":"2026-08-11",
      "booking_revision_id":"614a3c64-93b8-40ef-a787-2eb424e4c206",
      "count_of_rooms":1,
      "booking_unique_id":"BDC-111111",
      "count_of_nights":2,
      "customer_name":"Customer Name",
      "ota_code":"111111"
   },
   "property_id":"a92c01bb-4fc1-4c9e-9579-7d4e1ec607b8",
   "event":"non_acked_booking"
}
```

#### Airbnb Inquiry <a href="#airbnb-inquiry" id="airbnb-inquiry"></a>

```json
{
   "timestamp":"2026-01-26T14:40:54.310491Z",
   "user_id":null,
   "payload": {
      "status": "active",
      "property_id": "528175ae-0078-418b-b7f6-7bff7e24b0ae",
      "message_thread_id": "4d53d79c-4412-47a4-9381-2e0000b7d02d",
      "live_feed_event_id": "5e5adf3a-f368-4f5b-be26-e9196b36d1d0",
      "booking_details": {
        "currency": "EUR",
        "property_id": "528175ae-0078-418b-b7f6-7bff7e24b0ae",
        "listing_id": "LISTING_ID",
        "room_type_id": "d49a2cb3-736c-4a0b-a001-9a166909bf26",
        "nights": 6,
        "checkout_date": "2026-09-02",
        "checkin_date": "2026-08-27",
        "number_of_adults": 2,
        "number_of_children": 0,
        "number_of_infants": 0,
        "number_of_pets": 0,
        "guest_name": "Guest Name",
        "number_of_guests": 2,
        "payout_amount": "559.21",
        "listing_name": "Listing Name",
        "non_response_at": "2026-08-04T13:23:11.385Z"
      }
    },
    "property_id":"a92c01bb-4fc1-4c9e-9579-7d4e1ec607b8",
    "event":"inquiry"
}
```

#### Channel Removal Warning

`channel_removal_warning` event is sent when an inactive channel is approaching its automatic removal date. The warning is sent 7 days and 1 day before removal. For channels associated with multiple properties, the webhook is triggered for the first associated property.

```json
{
  "event": "channel_removal_warning",
  "payload": {
    "live_feed_event_id": "f3391b47-4a90-4b3e-a057-3a2b0e5bfa19",
    "property_id": "716305c4-561a-4561-a187-7f5b8aeb5920",
    "channel_id": "b2637a9c-2b8f-4b65-a05c-51830c21c0b4",
    "channel_name": "My Booking.com Channel",
    "channel": "BookingCom",
    "days_left": 7,
    "removal_date": "2026-08-12"
  },
  "property_id": "716305c4-561a-4561-a187-7f5b8aeb5920",
  "user_id": null,
  "timestamp": "2026-08-05T13:00:00.000000Z"
}
```

#### Property Removal Warning

`property_removal_warning` event is sent when a property without active channels is approaching its automatic removal date. The warning is sent 30 days, 7 days and 1 day before removal.

```json
{
  "event": "property_removal_warning",
  "payload": {
    "live_feed_event_id": "9d1f9262-3260-4f96-9b58-1a4e0e6e3c5d",
    "property_id": "716305c4-561a-4561-a187-7f5b8aeb5920",
    "property_name": "Demo Hotel",
    "days_left": 30,
    "removal_date": "2026-09-04"
  },
  "property_id": "716305c4-561a-4561-a187-7f5b8aeb5920",
  "user_id": null,
  "timestamp": "2026-08-05T13:00:00.000000Z"
}
```

#### Message Thread Booking Assigned <a href="#webhook-message-sequence" id="webhook-message-sequence"></a>

`message_thread_booking_assigned` event is sent when a Message Thread updated and receive link to Booking. It is happened in case, when communication with guest started before Booking creation.

```json
{
  "event": "message_thread_booking_assigned",
  "payload": {
    "booking_id": "9d1f9262-3260-4f96-9b58-1a4e0e6e3c5d",
    "message_thread_id": "716305c4-561a-4561-a187-7f5b8aeb5920"
  },
  "property_id": "716305c4-561a-4561-a187-7f5b8aeb5920",
  "user_id": null,
  "timestamp": "2026-08-05T13:00:00.000000Z"
}
```

## Webhook message sequence <a href="#webhook-message-sequence" id="webhook-message-sequence"></a>

Before you start any integration with webhooks, you should to know -

{% hint style="warning" %}
Sequence of incoming webhook calls can be different from sequence of events which trigger that calls. Webhooks may come out of order.
{% endhint %}

**Explanation**

At property A we have 2 state changes event:\
Change availability for Room Type A from 0 to 1.\
Change availability for Room Type A from 1 to 0.

This events triggers 2 webhook calls with `ari` type. But when Channex sends the first webhook we might catch some network issue at middle level and message failed with a timeout error. This is a temporary error and webhook will be rescheduled. Second webhook had no issues and was sent successfully and would arrive first.

PMS receives webhook #2 with Availability 0.\
First webhook is queued for 2nd attempt to be sent to the target endpoint and this time all went well and we deliver that webhook.

PMS receive webhook #1 with Availability 1.

As a result, if PMS will interpret incoming results, this can cause problems. Instead use information from payload, we suggest to use webhooks as a trigger to execute logic to pull ARI info from Channex.

So, in case with Availability changes, we suggest instead using data from payload, trigger a pull request to get values for changed dates.

<br>
