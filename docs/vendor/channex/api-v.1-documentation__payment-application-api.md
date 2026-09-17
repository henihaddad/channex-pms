<!-- https://docs.channex.io/api-v.1-documentation/payment-application-api.md -->
> For the complete documentation index, see [llms.txt](https://docs.channex.io/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://docs.channex.io/api-v.1-documentation/payment-application-api.md).

# Payment Application API

Information about Channex Payment Application API

## Introduction <a href="#introduction" id="introduction"></a>

The Payment Application is a new and safe way for a PMS connected with Channex to charge payments through Stripe API without the headache of PCI DSS and handling credit cards. Once the Payment App is installed and configured you will be able to charge cards through Channex API directly to the properties Stripe account. We charge a small fee to the connected Stripe account each time a card is charged.

## Application Installation and Configuration <a href="#application-installation-and-configuration" id="application-installation-and-configuration"></a>

### Install the Payment Application <a href="#install-the-payment-application" id="install-the-payment-application"></a>

To Install the Payment Application you should send an application installation request:

```json
POST /api/v1/applications/install

Payload:
{
    "application_installation": {
        "property_id": "{{PROPERTY_ID}}",
        "application_code": "channex_payments"
    }
}

Response:
{
    "data": [
        {
            "attributes": {
                "id": "12ca008c-95e9-4668-942a-d255b618c00e",
                "settings": null,
                "property_id": "c19a05af-8c8c-4754-8c8a-8132845d4cac",
                "application_id": "8587fbf6-a6d1-46f8-8c12-074273284917",
                "application_code": "channex_payments"
            },
            "id": "12ca008c-95e9-4668-942a-d255b618c00e", <-- INSTALLATION ID
            "type": "application_installation"
        }
    ]
}
```

For more information about this API look here [Applications API](https://docs.channex.io/api-v.1-documentation/applications-api).

### Application configuration <a href="#application-configuration" id="application-configuration"></a>

The next step is the Application Configuration. At this step you should connect the property Stripe Account to the Channex Payments app.

To setup Stripe connection, you should go over oAuth process, it can be triggered from the Channex user interface or via API.

#### Initiate oAuth connection <a href="#initiate-oauth-connection" id="initiate-oauth-connection"></a>

Send a request to connect:

```json
POST /api/v1/applications/payment_app/{{installation_id}}/connect

Payload:
{
  "provider": "stripe",
  "title": "Custom Title For Provider",
  "redirect_url": "HTTPS Endpoint at your side to handle redirect"
}

Response:
{
  "data": {
    "link": "STRIPE_OAUTH_LINK"
  }
}
```

When you receive a response, you should redirect User to received `data.link` URL.

User will go over the connection pipeline and be redirected to the provided Redirect URL.

## Get Application Info API <a href="#get-application-info-api" id="get-application-info-api"></a>

### Get list of connected Providers <a href="#get-list-of-connected-providers" id="get-list-of-connected-providers"></a>

To get list of connected Providers you can use the next API:

```json
POST /api/v1/applications/payment_app/{{installation_id}}/providers

Payload:
{
  "page": 1,
  "limit": 10
}

Response:
{
  "data": [
    {
      "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
      "type": "payment_provider",
      "attributes": {
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "title": "string",
        "provider": "stripe",
        "is_active": true,
        "is_default": true,
        "details": {
          "account_id": "xyz123"
        }
      }
    }
  ]
}
```

### Update Payment Provider <a href="#update-payment-provider" id="update-payment-provider"></a>

To update title for existing Payment Provider you can use next request:

```json
PUT /api/v1/applications/payment_app/{{installation_id}}/update_provider

Payload:
{
  "params": {
    "title": "string"
  },
  "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6"
}

Response:
{
  "data": [
    {
      "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
      "type": "payment_provider",
      "attributes": {
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "title": "Test",
        "provider": "stripe",
        "is_active": true,
        "is_default": true,
        "details": {
          "account_id": "xyz123"
        }
      }
    }
  ]
}
```

### Set the Payment Provider as default <a href="#set-the-payment-provider-as-default" id="set-the-payment-provider-as-default"></a>

Because you can have more than one connected Payment Provider, you should be able to choose which Payment Provider will be used as default.

```json
POST /api/v1/applications/payment_app/{{installation_id}}/set_provider_as_default

Payload:
{
  "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6"
}

Response:
{
  "data": [
    {
      "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
      "type": "payment_provider",
      "attributes": {
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "title": "Test",
        "provider": "stripe",
        "is_active": true,
        "is_default": true,
        "details": {
          "account_id": "xyz123"
        }
      }
    }
  ]
}
```

## Payment API <a href="#payment-api" id="payment-api"></a>

Channex Payment API supports these operations:

* pre auth
* settle pre-authorized charge
* void pre-authorized charge
* charge
* refund

### Pre Auth <a href="#pre-auth" id="pre-auth"></a>

To create pre-auth payment

```json
POST /api/v1/bookings/{{booking_id}}/pre_auth_payment

Payload:
{
  "amount": "100.50", <-- AMOUNT AS A STRING
  "booking_id": "{{BOOKING_ID}}",
  "payment_provider_id": "{{PAYMENT_PROVIDER_ID}}",
  "description": "string"
}

Response:
{
  "data": {
    "attributes": {
      "id": "ba8dcd0f-fc91-4778-ae9f-6927a359c849",
      "status": "pre_authorized",
      "description": "string",
      "currency": "GBP",
      "amount": "100.50",
      "inserted_at": "2025-06-18T12:35:03.887722",
      "updated_at": "2025-06-18T12:35:03.887722",
      "transactions": [
        {
          "id": "486f0134-b776-46ec-9f0b-2e97f5505433",
          "type": "pre_auth",
          "currency": "GBP",
          "amount": "100.50",
          "inserted_at": "2025-06-18T12:35:03.893527",
          "updated_at": "2025-06-18T12:35:03.893527",
          "ip_address": "118.0.0.232",
          "booking_id": "513866a5-bdb1-4ff5-b02f-390f7fad7bd2",
          "user_id": "6e085073-673b-49c5-be75-3c5d1cf6eb1c",
          "details": {
            "id": "pi_3RbLClEX4pVZ00VM01OZKST6"
          }
        }
      ],
      "booking_id": "513866a5-bdb1-4ff5-b02f-390f7fad7bd2"
    },
    "id": "ba8dcd0f-fc91-4778-ae9f-6927a359c849", <-- PAYMENT ID
    "type": "payment",
    "relationships": {
      "users": {
        "data": [
          {
            "attributes": {
              "id": "6e085073-673b-49c5-be75-3c5d1cf6eb1c",
              "name": "UserName",
              "email": "email@domain.com"
            },
            "id": "6e085073-673b-49c5-be75-3c5d1cf6eb1c",
            "type": "user"
          }
        ]
      },
      "booking": {
        "data": {
          "attributes": {
            "id": "513866a5-bdb1-4ff5-b02f-390f7fad7bd2",
            "reference": "OSA-CA20F017F2"
          },
          "id": "513866a5-bdb1-4ff5-b02f-390f7fad7bd2",
          "type": "booking"
        }
      }
    }
  }
}
```

### Settle pre-authorized payment <a href="#settle-pre-authorized-payment" id="settle-pre-authorized-payment"></a>

```json
POST /api/v1/bookings/{{booking_id}}/settle_payment

Payload:
{
  "payment_id":"{{PAYMENT_ID}}"
}

Response:
{
    "data": {
        "attributes": {
            "id": "94f57ee1-484d-45e6-906a-bc95dbe4498a",
            "status": "charged",
            "description": "Desc",
            "currency": "GBP",
            "amount": "100.50",
            "inserted_at": "2025-06-18T12:37:54.000000",
            "updated_at": "2025-06-18T12:38:47.884441",
            "transactions": [
                {
                    "id": "dd150ee1-4b41-40ae-bb9a-18ec89d3f3e2",
                    "type": "pre_auth",
                    "currency": "GBP",
                    "amount": "100.50",
                    "inserted_at": "2025-06-18T12:37:54.000000",
                    "updated_at": "2025-06-18T12:37:54.000000",
                    "ip_address": "77.21.15.232",
                    "booking_id": "513866a5-bdb1-4ff5-b02f-390f7fad7bd2",
                    "user_id": "6e085073-673b-49c5-be75-3c5d1cf6eb1c",
                    "details": {
                        "id": "pi_3RbLFVEX4pVZ00VM1wKBjJnl"
                    },
                    "payment_provider_id": "ccaf28f3-f066-4f7d-b5a5-6dafd8a98753"
                },
                {
                    "id": "1f573871-3406-42c0-8786-8e7eeed65c94",
                    "type": "charge",
                    "currency": "GBP",
                    "amount": "100.50",
                    "inserted_at": "2025-06-18T12:38:47.879886",
                    "updated_at": "2025-06-18T12:38:47.879886",
                    "ip_address": "77.21.15.232",
                    "booking_id": "513866a5-bdb1-4ff5-b02f-390f7fad7bd2",
                    "user_id": "6e085073-673b-49c5-be75-3c5d1cf6eb1c",
                    "details": {
                        "id": "pi_3RbLFVEX4pVZ00VM1wKBjJnl"
                    },
                    "payment_provider_id": "ccaf28f3-f066-4f7d-b5a5-6dafd8a98753"
                }
            ],
            "booking_id": "513866a5-bdb1-4ff5-b02f-390f7fad7bd2"
        },
        "id": "94f57ee1-484d-45e6-906a-bc95dbe4498a",
        "type": "payment",
        "relationships": {
            "users": {
                "data": [
                    {
                        "attributes": {
                            "id": "6e085073-673b-49c5-be75-3c5d1cf6eb1c",
                            "name": "UserName",
                            "email": "email@domain.com"
                        },
                        "id": "6e085073-673b-49c5-be75-3c5d1cf6eb1c",
                        "type": "user"
                    }
                ]
            },
            "booking": {
                "data": {
                    "attributes": {
                        "id": "513866a5-bdb1-4ff5-b02f-390f7fad7bd2",
                        "reference": "OSA-CA20F017F2"
                    },
                    "id": "513866a5-bdb1-4ff5-b02f-390f7fad7bd2",
                    "type": "booking"
                }
            },
            "payment_provider": {
                "data": {
                    "attributes": {
                        "id": "ccaf28f3-f066-4f7d-b5a5-6dafd8a98753",
                        "title": "20250524",
                        "is_active": true,
                        "provider": "stripe",
                        "details": {
                            "account_id": "acct_1RS8B7EX4pVZ00VM"
                        },
                        "is_default": true
                    },
                    "id": "ccaf28f3-f066-4f7d-b5a5-6dafd8a98753",
                    "type": "payment_provider"
                }
            }
        }
    }
}
```

### Void pre-authorized payment <a href="#void-pre-authorized-payment" id="void-pre-authorized-payment"></a>

```json
POST /api/v1/bookings/{{booking_id}}/void_payment

Payload:
{
  "payment_id":"{{PAYMENT_ID}}"
}

Response:
{
  "data": {
    "attributes": {
      "id": "de9d8488-d7de-4751-b3aa-1384e6b02d21",
      "status": "cancelled",
      "description": "description",
      "currency": "GBP",
      "amount": "100.50",
      "inserted_at": "2025-06-18T12:43:04.000000",
      "updated_at": "2025-06-18T12:43:08.534023",
      "transactions": [
        {
          "id": "61de594d-62b5-4d20-8c0e-06ff81e254b3",
          "type": "pre_auth",
          "currency": "GBP",
          "amount": "100.50",
          "inserted_at": "2025-06-18T12:43:04.000000",
          "updated_at": "2025-06-18T12:43:04.000000",
          "ip_address": "77.21.15.232",
          "booking_id": "513866a5-bdb1-4ff5-b02f-390f7fad7bd2",
          "user_id": "6e085073-673b-49c5-be75-3c5d1cf6eb1c",
          "details": {
            "id": "pi_3RbLKVEX4pVZ00VM0BZ6FB6E"
          },
          "payment_provider_id": "ccaf28f3-f066-4f7d-b5a5-6dafd8a98753"
        },
        {
          "id": "cba8dd7b-1d83-4c6c-ae21-87ef6a1f1f63",
          "type": "void",
          "currency": "GBP",
          "amount": "100.50",
          "inserted_at": "2025-06-18T12:43:08.530890",
          "updated_at": "2025-06-18T12:43:08.530890",
          "ip_address": "77.21.15.232",
          "booking_id": "513866a5-bdb1-4ff5-b02f-390f7fad7bd2",
          "user_id": "6e085073-673b-49c5-be75-3c5d1cf6eb1c",
          "details": {
            "id": "pi_3RbLKVEX4pVZ00VM0BZ6FB6E"
          },
          "payment_provider_id": "ccaf28f3-f066-4f7d-b5a5-6dafd8a98753"
        }
      ],
      "booking_id": "513866a5-bdb1-4ff5-b02f-390f7fad7bd2"
    },
    "id": "de9d8488-d7de-4751-b3aa-1384e6b02d21",
    "type": "payment",
    "relationships": {
      "users": {
        "data": [
          {
            "attributes": {
              "id": "6e085073-673b-49c5-be75-3c5d1cf6eb1c",
              "name": "UserName",
              "email": "email@domain.com"
            },
            "id": "6e085073-673b-49c5-be75-3c5d1cf6eb1c",
            "type": "user"
          }
        ]
      },
      "booking": {
        "data": {
          "attributes": {
            "id": "513866a5-bdb1-4ff5-b02f-390f7fad7bd2",
            "reference": "OSA-CA20F017F2"
          },
          "id": "513866a5-bdb1-4ff5-b02f-390f7fad7bd2",
          "type": "booking"
        }
      },
      "payment_provider": {
        "data": {
          "attributes": {
            "id": "ccaf28f3-f066-4f7d-b5a5-6dafd8a98753",
            "title": "20250524",
            "is_active": true,
            "provider": "stripe",
            "details": {
              "account_id": "acct_1RS8B7EX4pVZ00VM"
            },
            "is_default": true
          },
          "id": "ccaf28f3-f066-4f7d-b5a5-6dafd8a98753",
          "type": "payment_provider"
        }
      }
    }
  }
}
```

### Charge payment <a href="#charge-payment" id="charge-payment"></a>

```json
POST /api/v1/bookings/{{booking_id}}/charge_payment

Payload:
{
  "booking_id": "{{BOOKING_ID}}",
  "payment_provider_id": "{{PAYMENT_PROVIDER_ID}}",
  "amount": "10.00",
  "description": "description"
}

Response:
{
  "data": {
    "attributes": {
      "id": "73538783-d1c1-436a-b947-b4263232023b",
      "status": "charged",
      "description": "description",
      "currency": "GBP",
      "amount": "10.00",
      "inserted_at": "2025-06-18T12:46:04.585381",
      "updated_at": "2025-06-18T12:46:04.585381",
      "transactions": [
        {
          "id": "4e9a0b02-28b0-4a4f-b1cb-b6bea06dd30a",
          "type": "charge",
          "currency": "GBP",
          "amount": "100.50",
          "inserted_at": "2025-06-18T12:46:04.591567",
          "updated_at": "2025-06-18T12:46:04.591567",
          "ip_address": "77.21.15.232",
          "booking_id": "513866a5-bdb1-4ff5-b02f-390f7fad7bd2",
          "user_id": "6e085073-673b-49c5-be75-3c5d1cf6eb1c",
          "details": {
            "id": "pi_3RbLNPEX4pVZ00VM1MpGZx4N"
          }
        }
      ],
      "booking_id": "513866a5-bdb1-4ff5-b02f-390f7fad7bd2"
    },
    "id": "73538783-d1c1-436a-b947-b4263232023b",
    "type": "payment",
    "relationships": {
      "users": {
        "data": [
          {
            "attributes": {
              "id": "6e085073-673b-49c5-be75-3c5d1cf6eb1c",
              "name": "UserName",
              "email": "email@domain.com"
            },
            "id": "6e085073-673b-49c5-be75-3c5d1cf6eb1c",
            "type": "user"
          }
        ]
      },
      "booking": {
        "data": {
          "attributes": {
            "id": "513866a5-bdb1-4ff5-b02f-390f7fad7bd2",
            "reference": "OSA-CA20F017F2"
          },
          "id": "513866a5-bdb1-4ff5-b02f-390f7fad7bd2",
          "type": "booking"
        }
      }
    }
  },
  "success": true
}
```

### Refund for an existing payment <a href="#refund-for-an-existing-payment" id="refund-for-an-existing-payment"></a>

```json
POST /api/v1/bookings/{{booking_id}}/refund_payment

Payload:
{
  "amount": "100.50",
  "payment_id": "{{PAYMENT_ID}}"
}

Response:
{
  "data": {
    "attributes": {
      "id": "73538783-d1c1-436a-b947-b4263232023b",
      "status": "refunded",
      "description": "description",
      "currency": "GBP",
      "amount": "0.00",
      "inserted_at": "2025-06-18T12:46:05.000000",
      "updated_at": "2025-06-18T12:48:30.611340",
      "transactions": [
        {
          "id": "4e9a0b02-28b0-4a4f-b1cb-b6bea06dd30a",
          "type": "charge",
          "currency": "GBP",
          "amount": "100.50",
          "inserted_at": "2025-06-18T12:46:05.000000",
          "updated_at": "2025-06-18T12:46:05.000000",
          "ip_address": "77.21.15.232",
          "booking_id": "513866a5-bdb1-4ff5-b02f-390f7fad7bd2",
          "user_id": "6e085073-673b-49c5-be75-3c5d1cf6eb1c",
          "details": {
            "id": "pi_3RbLNPEX4pVZ00VM1MpGZx4N"
          },
          "payment_provider_id": "ccaf28f3-f066-4f7d-b5a5-6dafd8a98753"
        },
        {
          "id": "89282eb0-2aa1-4913-9c5a-7f115582eb33",
          "type": "refund",
          "currency": "GBP",
          "amount": "100.50",
          "inserted_at": "2025-06-18T12:48:30.602890",
          "updated_at": "2025-06-18T12:48:30.602890",
          "ip_address": "77.21.15.232",
          "booking_id": "513866a5-bdb1-4ff5-b02f-390f7fad7bd2",
          "user_id": "6e085073-673b-49c5-be75-3c5d1cf6eb1c",
          "details": {
            "id": "re_3RbLNPEX4pVZ00VM1VJ2XDpX"
          },
          "payment_provider_id": "ccaf28f3-f066-4f7d-b5a5-6dafd8a98753"
        }
      ],
      "booking_id": "513866a5-bdb1-4ff5-b02f-390f7fad7bd2"
    },
    "id": "73538783-d1c1-436a-b947-b4263232023b",
    "type": "payment",
    "relationships": {
      "users": {
        "data": [
          {
            "attributes": {
              "id": "6e085073-673b-49c5-be75-3c5d1cf6eb1c",
              "name": "UserName",
              "email": "email@domain.com"
            },
            "id": "6e085073-673b-49c5-be75-3c5d1cf6eb1c",
            "type": "user"
          }
        ]
      },
      "booking": {
        "data": {
          "attributes": {
            "id": "513866a5-bdb1-4ff5-b02f-390f7fad7bd2",
            "reference": "OSA-CA20F017F2"
          },
          "id": "513866a5-bdb1-4ff5-b02f-390f7fad7bd2",
          "type": "booking"
        }
      },
      "payment_provider": {
        "data": {
          "attributes": {
            "id": "ccaf28f3-f066-4f7d-b5a5-6dafd8a98753",
            "title": "20250524",
            "is_active": true,
            "provider": "stripe",
            "details": {
              "account_id": "acct_1RS8B7EX4pVZ00VM"
            },
            "is_default": true
          },
          "id": "ccaf28f3-f066-4f7d-b5a5-6dafd8a98753",
          "type": "payment_provider"
        }
      }
    }
  }
}

```

### Errors <a href="#errors" id="errors"></a>

Once you work with Payment API you can get some errors:

{% tabs %}
{% tab title="Too big amount" %}

#### Validation Error for a big amount <a href="#validation-error-for-a-big-amount" id="validation-error-for-a-big-amount"></a>

Total amount can’t be greater than booking due amount.

```json
{
    "errors": {
        "code": "validation_error",
        "title": "Validation Error",
        "details": {
            "amount": [
                "is too big"
            ]
        }
    }
}
```

{% endtab %}

{% tab title="Low balance on VCC" %}

#### Validation Error for low balance on VCC <a href="#validation-error-for-low-balance-on-vcc" id="validation-error-for-low-balance-on-vcc"></a>

You are not able to charge more than VCC Balance.

```json
{
    "errors": {
        "code": "validation_error",
        "title": "Validation Error",
        "details": {
            "booking_id": [
                "has not enough balance of virtual card"
            ]
        }
    }
}
```

{% endtab %}
{% endtabs %}

## Data Structures <a href="#data-structures" id="data-structures"></a>

### Payment <a href="#payment" id="payment"></a>

```json
{
  "id": "73538783-d1c1-436a-b947-b4263232023b",
  "status": "refunded",
  "description": "description",
  "currency": "GBP",
  "amount": "0.00",
  "inserted_at": "2025-06-18T12:46:05.000000",
  "updated_at": "2025-06-18T12:48:30.611340",
  "transactions": [...],
  "booking_id": "513866a5-bdb1-4ff5-b02f-390f7fad7bd2"
}
```

**status**\
Enumerable, one of `charged`, `refunded`, `pre_authorized`, `cancelled`, `partially_refunded`.

**description**\
String, free-form description for a payment.

**currency**\
String. 3 symbols. Currency of a payment. Taken automatically from Booking object.

**amount**\
String. Represent amount of Payment.

**booking\_id**\
UUID. Link to associated Booking.

**transactions**\
List of Transaction objects.

### Transaction <a href="#transaction" id="transaction"></a>

```json
{
  "id": "89282eb0-2aa1-4913-9c5a-7f115582eb33",
  "type": "refund",
  "currency": "GBP",
  "amount": "100.50",
  "inserted_at": "2025-06-18T12:48:30.602890",
  "updated_at": "2025-06-18T12:48:30.602890",
  "ip_address": "77.21.15.232",
  "booking_id": "513866a5-bdb1-4ff5-b02f-390f7fad7bd2",
  "user_id": "6e085073-673b-49c5-be75-3c5d1cf6eb1c",
  "details": {
    "id": "re_3RbLNPEX4pVZ00VM1VJ2XDpX"
  },
  "payment_provider_id": "ccaf28f3-f066-4f7d-b5a5-6dafd8a98753"
}
```

**type**\
Enum. One of possible values: `charge`, `refund`, `pre_auth`, `void`.

**currency**\
String. 3 symbols. Currency of a payment. Taken automatically from Booking object.

**amount**\
String. Represent amount of Payment.

**details**\
Object with raw Stripe transaction ID.

**payment\_provider\_id**\
UUID. Link to used Payment Provider.

**booking\_id**\
UUID. Link to associated Booking.

**user\_id**\
UUID. Link to User Object who made Payment.

**ip\_address**

String. IP Address of User who made Payment.

{% hint style="warning" %}
Please, keep in mind, Transaction object is immutable and can’t be changed over time.

At same time Payment object is mutable and can be changed after each operation.
{% endhint %}

## Reporting API <a href="#reporting-api" id="reporting-api"></a>

The last part of Payment API is reporting API. It can be used to collect information about Payments provided via Channex Payment App.

```json
POST /api/v1/applications/payment_app/{{installation_id}}/transactions

Payload:
{
  "pagination": {
    "page": 1,
    "limit": 10
  },
  "order": {
    "inserted_at": "asc"
  },
  "filter": {}
}

Response:
{
    "data": [
        {
            "attributes": {
                "id": "89282eb0-2aa1-4913-9c5a-7f115582eb33",
                "type": "refund",
                "currency": "GBP",
                "amount": "10.00",
                "inserted_at": "2025-06-18T12:48:31.000000",
                "updated_at": "2025-06-18T12:48:31.000000",
                "ip_address": "77.21.15.232",
                "booking_id": "513866a5-bdb1-4ff5-b02f-390f7fad7bd2",
                "user_id": "6e085073-673b-49c5-be75-3c5d1cf6eb1c",
                "details": {
                    "id": "re_3RbLNPEX4pVZ00VM1VJ2XDpX"
                },
                "payment_provider_id": "ccaf28f3-f066-4f7d-b5a5-6dafd8a98753"
            },
            "relationships": {
                "user": {
                    "data": {
                        "attributes": {
                            "id": "6e085073-673b-49c5-be75-3c5d1cf6eb1c",
                            "name": "UserName",
                            "email": "email@domain.com"
                        },
                        "id": "6e085073-673b-49c5-be75-3c5d1cf6eb1c",
                        "type": "user"
                    }
                },
                "booking": {
                    "data": {
                        "attributes": {
                            "id": "513866a5-bdb1-4ff5-b02f-390f7fad7bd2",
                            "reference": "OSA-CA20F017F2"
                        },
                        "id": "513866a5-bdb1-4ff5-b02f-390f7fad7bd2",
                        "type": "booking"
                    }
                },
                "payment_provider": {
                    "data": {
                        "attributes": {
                            "id": "ccaf28f3-f066-4f7d-b5a5-6dafd8a98753",
                            "title": "20250524",
                            "is_active": true,
                            "provider": "stripe",
                            "details": {
                                "account_id": "acct_1RS8B7EX4pVZ00VM"
                            },
                            "is_default": true
                        },
                        "id": "ccaf28f3-f066-4f7d-b5a5-6dafd8a98753",
                        "type": "payment_provider"
                    }
                },
                "payment": {
                    "data": {
                        "id": "73538783-d1c1-436a-b947-b4263232023b",
                        "type": "payment"
                    }
                }
            }
        }
    ],
    "meta": {
        "total": 17,
        "limit": 10,
        "order_by": "inserted_at",
        "page": 1,
        "order_direction": "asc"
    }
}
```

## Open Spec API <a href="#open-spec-api" id="open-spec-api"></a>

{% file src="/files/eBnZBuaXFceLihKLyfgd" %}

{% file src="/files/X55hE5cYWEkQqMAbG31f" %}
