<!-- https://docs.channex.io/channel-mapping-guides/booking.com.md -->
> For the complete documentation index, see [llms.txt](https://docs.channex.io/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://docs.channex.io/channel-mapping-guides/booking.com.md).

# Booking.com

Guide to connect and map booking.com to Channex

## Request connection to Channex.io in booking extranet

Login to the admin for the property here: <https://account.booking.com/>

{% hint style="info" %}
This step is best done by the property since booking.com have 2 step security with passcodes sent to the phone.
{% endhint %}

![](https://2514252617-files.gitbook.io/~/files/v0/b/gitbook-legacy-files/o/assets%2F-LWLG7_BCMgWd3mn6DYg%2F-M9N9xA6YPoq892ZkGms%2F-M9NC6MDUth4vnX1nrii%2FScreenshot%202020-06-09%20at%2010.30.40.png?alt=media\&token=795fb329-09bd-4646-b2ea-5db0955bd74b)

1. Copy the property code at the top of the navigation, you will need this later inside Channex to connect the account
2. Click on Account > Connectivity Provider

### Choose Provider Screen

![](https://2514252617-files.gitbook.io/~/files/v0/b/gitbook-legacy-files/o/assets%2F-LWLG7_BCMgWd3mn6DYg%2F-M9N9xA6YPoq892ZkGms%2F-M9NDDDlLpLsecvv0AhK%2FScreenshot%202020-06-09%20at%2010.35.41.png?alt=media\&token=000825c8-8db2-4c1c-944c-6bf24b93b9e3)

Click on "Search"

![](https://2514252617-files.gitbook.io/~/files/v0/b/gitbook-legacy-files/o/assets%2F-LWLG7_BCMgWd3mn6DYg%2F-M9N9xA6YPoq892ZkGms%2F-M9NDs_jJo8aEox7v1CW%2FScreenshot%202020-06-09%20at%2010.38.29.png?alt=media\&token=a958113a-22f0-4e3c-b64e-9ecf9f2137a6)

Type "Channex" and it will find Channex.io on the list.

{% hint style="warning" %}
You have to type the whole word "Channex" since it wont find it otherwise.
{% endhint %}

![](https://2514252617-files.gitbook.io/~/files/v0/b/gitbook-legacy-files/o/assets%2F-LWLG7_BCMgWd3mn6DYg%2F-M9N9xA6YPoq892ZkGms%2F-M9NEay24ArscexPIH5h%2FScreenshot%202020-06-09%20at%2010.41.51.png?alt=media\&token=461f0e8a-4b67-4d43-90a4-831e17be79b4)

Once channex is selected on the list it will show the summary box, just click "Next"

### Agree the XML Service Agreement

![](https://2514252617-files.gitbook.io/~/files/v0/b/gitbook-legacy-files/o/assets%2F-LWLG7_BCMgWd3mn6DYg%2F-M9N9xA6YPoq892ZkGms%2F-M9NFT-ESq_J9jVk4XKh%2FScreenshot%202020-06-09%20at%2010.45.06.png?alt=media\&token=088dbe84-dcaf-4758-8591-be29be20c85c)

Click on the checkbox to agree the terms and conditions and then the "Yes, I accept" button.

No other things needs to be done or completed on this form

![](https://2514252617-files.gitbook.io/~/files/v0/b/gitbook-legacy-files/o/assets%2F-LWLG7_BCMgWd3mn6DYg%2F-M9N9xA6YPoq892ZkGms%2F-M9NFpI671WZAMqnblTf%2FScreenshot%202020-06-09%20at%2010.47.09.png?alt=media\&token=7c8497f9-2785-488a-9301-897cfa4d08d2)

Now you will be in a waiting status, until Channex accepts the connection

{% hint style="info" %}
You can go to map the property in Channex immediately even though Channex has not accepted the property yet. But at this stage you cannot go live (just mapping)
{% endhint %}

{% hint style="danger" %}
Warning: Once you connect a channel manager to Booking.com you should check the settings of all derived rates to make sure the min stay or other settings are correct as they might be changed automatically by booking.com.
{% endhint %}

## Create Booking.com Channel in Channex

Once booking.com connectivity provider is completed or in waiting mode you can start the connection and mapping. If you try before you will get an error since the property has not provided you access yet.

In Channex to go the channels page: <https://app.channex.io/channels>

![](https://2514252617-files.gitbook.io/~/files/v0/b/gitbook-legacy-files/o/assets%2F-LWLG7_BCMgWd3mn6DYg%2F-M9N9xA6YPoq892ZkGms%2F-M9NGnivFrfmS4UwJrDF%2FScreenshot%202020-06-09%20at%2010.51.22.png?alt=media\&token=77f083e9-8441-47b4-b9d8-0538c4c76fd6)

Click on the "Create" button to start a new connection

![](https://2514252617-files.gitbook.io/~/files/v0/b/gitbook-legacy-files/o/assets%2F-LWLG7_BCMgWd3mn6DYg%2F-M9N9xA6YPoq892ZkGms%2F-M9NH2qWaOSwUEhSjj9d%2FScreenshot%202020-06-09%20at%2010.52.32.png?alt=media\&token=0441fa20-51e8-4c56-99dd-75291fb7671b)

Select the channel "Booking.com"

![](https://2514252617-files.gitbook.io/~/files/v0/b/gitbook-legacy-files/o/assets%2F-LWLG7_BCMgWd3mn6DYg%2F-M9N9xA6YPoq892ZkGms%2F-M9NHH-CK8UHl7D6x4Ka%2FScreenshot%202020-06-09%20at%2010.53.33.png?alt=media\&token=0a4cec89-9739-4dcb-99c5-6412e79f1505)

Group: if you have more than 1 group then please select the correct group where the property is located.

Title: Custom text to call this connection

Property: Choose the correct property from the list

Hotel ID: This is where you enter the property ID of the property from booking.com.

{% hint style="info" %}
You can find property ID in booking.com extranet at the top of the screen next to the property name.
{% endhint %}

Test Connection Button - Checks if the property is accessible to map

Once the settings are filled and the test gives a positive result we can move onto the mapping

## Advanced Settings

<figure><img src="https://2514252617-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2F-LWLG7_BCMgWd3mn6DYg%2Fuploads%2FKQBSPksPCP7CPbLoZkBz%2FScreenshot%202026-03-18%20at%2023.14.22.png?alt=media&amp;token=beef8f17-4c6f-4fd3-91ff-fe8fd8bc886f" alt=""><figcaption></figcaption></figure>

Optional settings if you would like you booking to be modified for any of these events.

VCC - If the VCC Changes

Payout - If the payour amount changes

Payout Method - If payout is changed Example: VSS to Bank Transfer

VCC Balance - If VCC balance changes

VCC Fees Payout - If Payment fees Cahnge

{% hint style="info" %}
Note: Some of these may create a lot of booking modifications. Example: VCC balance changes if the currency is different to the booking (Currency changes)
{% endhint %}

## Mapping booking.com

Mapping is important that all rate plans be mapped, any non mapped rate plans or rooms will cause issues later. If a rate or room is not required anymore then please ask the property to delete it.

![](https://2514252617-files.gitbook.io/~/files/v0/b/gitbook-legacy-files/o/assets%2F-LWLG7_BCMgWd3mn6DYg%2F-M9N9xA6YPoq892ZkGms%2F-M9NIdzvM864Ha28za-a%2FScreenshot%202020-06-09%20at%2010.59.14.png?alt=media\&token=b0ba4ca2-adb3-425d-b2bd-32cabaa876e5)

Notes:

On the left side you will see all the rooms and rates on the channel, and on the right side you can see what is mapped.

The Booking.com room type names are their default name, if you have added a custom name in the extranet then they are not visible. This is why we have also given the Room ID after the text.

{% hint style="info" %}
Some properties like apartments can have multiple room types of the same name. It will be hard to know how to map unless you look at the ID and match to room internally on the extranet.
{% endhint %}

Once mapping is completed please save the channel by pressing the save button at the bottom

## Occupancy Based Mapping

Booking can support occupancy based prices also, if this is supported then you can map each occupancy of a room type

![](https://2514252617-files.gitbook.io/~/files/v0/b/gitbook-legacy-files/o/assets%2F-LWLG7_BCMgWd3mn6DYg%2F-MEqfS3SyW-TKGDb5-vS%2F-MEqhn4qhxn3ncBPBZPD%2FScreenshot%202020-08-16%20at%2011.57.45.png?alt=media\&token=b1db5d85-2468-48a6-b260-0d727bf07c8e)

**Primary Rate** - This will be the rate plan that sends the restrictions such as min stay or stop sell. Since it is only one rate plan in booking.com.

![](https://2514252617-files.gitbook.io/~/files/v0/b/gitbook-legacy-files/o/assets%2F-LWLG7_BCMgWd3mn6DYg%2F-MEqfS3SyW-TKGDb5-vS%2F-MEqhrhwQ1I1LNu-2amK%2FScreenshot%202020-08-16%20at%2011.57.40.png?alt=media\&token=39f3622c-eb61-4294-b8b8-496e54bed48c)

You can move your mouse over the other occupancy options and you can change the primary rate.

## Activate the Connection

![](https://2514252617-files.gitbook.io/~/files/v0/b/gitbook-legacy-files/o/assets%2F-LWLG7_BCMgWd3mn6DYg%2F-M9OI2Mn09D36KcIAJqN%2F-M9OJJmfZDW7KeESu400%2FScreenshot%202020-06-09%20at%2015.42.06.png?alt=media\&token=08d0001f-7e55-4aff-b94f-55d61e92af50)

To activate please click on "Actions" button on the channel and select "Activate"

## Pull Future Reservations

You can also pull all future reservations if you require from booking.com channel. This is useful in many instances especially with a new PMS setup.

{% hint style="warning" %}
Importing bookings will not affect the availability in Channex.

The data you get from imported bookings will lack some details compared to normal booking, it will not include

* Taxes of Fees
* Personal Details like email, address, telephone etc.
* Commission details
* Credit Card Details
  {% endhint %}

## Derived Rate Plans inside booking.com

Derived should be not mappable inside Channex, if they have some or make new ones inside booking it should work similar to promotions where it does not need mapping and the bookings will come back fine.

However, in some cases there are old versions of derived rates that will show in Channex mapping as mappable rates. There are 2 solutions to this:

1. Map all rates even the derived ones, if you don't map then you will get unmapped booking errors
2. Ask the hotel to delete the derived rates inside booking.com and then they can make them again new. The new versions will not show as mappable and will work as expected.
