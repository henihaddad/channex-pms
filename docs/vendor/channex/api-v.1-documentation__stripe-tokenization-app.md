<!-- https://docs.channex.io/api-v.1-documentation/stripe-tokenization-app.md -->
> For the complete documentation index, see [llms.txt](https://docs.channex.io/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://docs.channex.io/api-v.1-documentation/stripe-tokenization-app.md).

# Stripe Tokenization App

API related to Stripe Tokenization App

A lot of our customers use Stripe to charge guests and transfer money to Properties. It is excellent solution and works well without any headache except one - how to transfer Credit Card details from OTA to Stripe account. Usually, to perform this operation your system should be PCI DSS certified, because this operation required access to Raw Credit Card data.

Channex will offer a new way how to do that and dramatically decrease complexity - Stripe Tokenization App.

Basically, this Application allow you to do just one thing - pass Credit Card data from Channex PCI Storage into your Stripe Account.

<figure><img src="https://2514252617-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2F-LWLG7_BCMgWd3mn6DYg%2Fuploads%2FvLhVwfE22hSNxZz5Ochn%2FGroup%201.png?alt=media&amp;token=c8bbead6-92cc-4c47-ba88-686392c968ab" alt=""><figcaption></figcaption></figure>

To work with this API you should have:

* connected PMS Stripe Account (you can do that at your User Profile)
* installed Stripe Tokenization App (see [Applications API](/api-v.1-documentation/applications-api.md))

When Stripe is connected and Application is installed, you will have access to two API methods:

* Create Credit Card Stripe Token
* Create Payment Method Token

## Connect PMS Stripe Account

Login into system as PMS Account Owner and open User Profile.

At User Profile page you will see section "Stripe Connection" with "Connect" button. Please, go over oAuth process at Stripe side.

{% hint style="warning" %}
For `staging` environment you can use only Test Stripe Accounts!
{% endhint %}

## Install Application for Property

To install Stripe Tokenization App for Property you can use next API:

```json
POST /api/v1/applications/install

{
    "application_installation": {
        "property_id": "PROPERTY_ID",
        "application_code": "stripe_tokenization"
    }
}
```

## Create Credit Card Token

{% tabs %}
{% tab title="Request" %}
Request:

```json
POST /api/v1/bookings/:booking_id/stripe_token
```

{% endtab %}

{% tab title="Success Response" %}
**Success Response Example**

Status Code: `200 OK`

```json
{
  "success": true,
  "data": {
    "token": "STRIPE_CREDIT_CARD_TOKEN"
  }
}
```

{% endtab %}

{% tab title="Error Response" %}
**Unauthorised Error Response**

Status Code: `401 Unauthorized`

```json
{
  "errors": { 
    "code": "unauthorized",
    "title": "Unauthorized"
  }
}
```

**Validation Error Response**

Status Code: `422 Validation Error`

```json
{
  "errors": {
    "title": "Validation Error",
    "code": "validation_error",
    "details": {
      "booking_id": [
        "has no token"
      ]
    }
  }
}
```

{% endtab %}
{% endtabs %}

## Create Payment Method Token

{% tabs %}
{% tab title="Request" %}
Request:

```json
POST /api/v1/bookings/:booking_id/stripe_payment_method
```

{% endtab %}

{% tab title="Success Response" %}
**Success Response Example**

Status Code: `200 OK`

```json
{
  "success": true,
  "data": {
    "token": "STRIPE_PAYMENT_METHOD_TOKEN"
  }
}
```

{% endtab %}

{% tab title="Error Response" %}
**Unauthorised Error Response**

Status Code: `401 Unauthorized`

```json
{
  "errors": { 
    "code": "unauthorized",
    "title": "Unauthorized"
  }
}
```

**Validation Error Response**

Status Code: `422 Validation Error`

```json
{
  "errors": {
    "title": "Validation Error",
    "code": "validation_error",
    "details": {
      "booking_id": [
        "has no token"
      ]
    }
  }
}
```

{% endtab %}
{% endtabs %}

## How to use token?

Once token is created, you are able to use it at your side in regular basis - create a charge or anything else.

Please, keep in mind, token will be created at your account and we are not have any access to this information.
