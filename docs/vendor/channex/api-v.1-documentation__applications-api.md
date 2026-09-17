<!-- https://docs.channex.io/api-v.1-documentation/applications-api.md -->
> For the complete documentation index, see [llms.txt](https://docs.channex.io/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://docs.channex.io/api-v.1-documentation/applications-api.md).

# Applications API

API methods to work with Applications

Channex.io provide functionality extensions what is called "Applications".

This Applications provide ability to work with OTA Messages and Reviews, setup integration with Zapier or Make.com, add Payment Application or Stripe Tokenization app.

Please, take a look into our [Applications page](https://app.channex.io/applications) to get full list of available Applications.

{% hint style="warning" %}
Some applications are free of charge, but some are paid. Please, take a look Application details.
{% endhint %}

## Get List of Applications

Retrieve list of available Applications.

{% tabs %}
{% tab title="Request" %}
Request:

```
GET /api/v1/applications
```

{% endtab %}

{% tab title="Success Response" %}
**Success Response Example**

Status Code: `200 OK`

```json
{
    "data": [
        {
            "attributes": {
                "code": "apaleo",
                "id": "2fac68cf-9790-496f-b63b-19236510d242",
                "description": null,
                "title": "Apaleo",
                "is_configurable": true,
                "logo_url": "https://app.channex.io/application_assets/apaleo.png",
                "price": null,
                "representation_settings": null,
                "vr_price": null
            },
            "id": "2fac68cf-9790-496f-b63b-19236510d242",
            "type": "application"
        },
        {
            "attributes": {
                "code": "booking_crs",
                "id": "bdcd403b-b62e-46c4-997e-3dced2ae7a37",
                "description": null,
                "title": "Booking CRS",
                "is_configurable": true,
                "logo_url": null,
                "price": null,
                "representation_settings": null,
                "vr_price": null
            },
            "id": "bdcd403b-b62e-46c4-997e-3dced2ae7a37",
            "type": "application"
        }
    ]
}
```

{% endtab %}

{% tab title="Error Response" %}
**Unauthorised Error Response**

Status Code: `401 Unauthorized`

```
{
  "errors": {
    "code": "unauthorized",
    "title": "Unauthorized"
  }
}
```

{% endtab %}
{% endtabs %}

## Get List of Installed Applications

Retrieve list of installed Applications.

{% tabs %}
{% tab title="Request" %}
Request:

```
GET /api/v1/applications/installed
```

{% endtab %}

{% tab title="Success Response" %}
**Success Response Example**

Status Code: `200 OK`

```json
{
    "data": [
        {
            "attributes": {
                "id": "12ca008c-95e9-4668-942a-d255b618c00e",
                "settings": null,
                "property_id": "c19a05af-8c8c-4754-8c8a-8132845d4cac",
                "application_id": "8587fbf6-a6d1-46f8-8c12-074273284917",
                "application_code": "channex_messages"
            },
            "id": "12ca008c-95e9-4668-942a-d255b618c00e",
            "type": "application_installation"
        }
    ]
}
```

{% endtab %}

{% tab title="Error Response" %}
**Unauthorised Error Response**

Status Code: `401 Unauthorized`

```
{
  "errors": {
    "code": "unauthorized",
    "title": "Unauthorized"
  }
}
```

{% endtab %}
{% endtabs %}

## Install Application

Method to add Application into Property

{% tabs %}
{% tab title="Request" %}
Request:

```json
POST /api/v1/applications/install

{
    "application_installation": {
        "property_id": "18535b75-26a0-4716-ae99-0578006639c5",
        "application_code": "channex_messages"
    }
}
```

{% endtab %}

{% tab title="Success Response" %}
**Success Response Example**

Status Code: `200 OK`

```json
{
    "data": {
        "attributes": {
            "id": "7db569e1-3fb3-49a7-884b-690140827c50",
            "settings": {},
            "property_id": "18535b75-26a0-4716-ae99-0578006639c5",
            "is_active": true,
            "application_id": "0dbb54b2-1321-43dd-9fe9-30d54e19ff33",
            "application_code": "channex_messages"
        },
        "id": "7db569e1-3fb3-49a7-884b-690140827c50",
        "type": "application_installation",
        "relationships": {
            "rate_plans": {
                "data": []
            }
        }
    }
}
```

{% endtab %}

{% tab title="Error Response" %}
**Unauthorised Error Response**

Status Code: `401 Unauthorized`

```
{
  "errors": {
    "code": "unauthorized",
    "title": "Unauthorized"
  }
}
```

{% endtab %}
{% endtabs %}

{% hint style="info" %}
At one of previous version we suggest to use `application_id` for installation process, but now, we are recommend to use `application_code` what can be safely saved as Constant at your environment.
{% endhint %}

### Application configuration

Please, keep in mind, some of application require additional configuration after installation (such as Payment App). Please, contact with our support team to get full API information to configure application.

## Uninstall Application

Remove installed application

{% tabs %}
{% tab title="Request" %}
Request:

```
DELETE /api/v1/applications/:application_installation_id/uninstall
```

{% endtab %}

{% tab title="Success Response" %}
**Success Response Example**

Status Code: `200 OK`

```json
{
    "meta": {
        "message": "Success"
    }
}
```

{% endtab %}

{% tab title="Error Response" %}
**Unauthorised Error Response**

Status Code: `401 Unauthorized`

```
{
  "errors": {
    "code": "unauthorized",
    "title": "Unauthorized"
  }
}
```

{% endtab %}
{% endtabs %}
