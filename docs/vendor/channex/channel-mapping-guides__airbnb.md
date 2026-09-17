<!-- https://docs.channex.io/channel-mapping-guides/airbnb.md -->
> For the complete documentation index, see [llms.txt](https://docs.channex.io/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://docs.channex.io/channel-mapping-guides/airbnb.md).

# Airbnb

Guide on the Airbnb connection and mapping

1. [Login to Airbnb](#login-to-the-airbnb-account)
2. [Create the Airbnb Channel](#create-the-airbnb-channel)
3. [Connection Errors](#connection-errors)
4. [Multi Property](#multi-property)
5. [Mapping Airbnb Listings](#mapping-airbnb-listings)
6. [Edit the listings](#edit-the-listings)
7. [Price Per Person with Airbnb](#price-per-person-with-airbnb)

## Login to the Airbnb Account

To connect Airbnb it works with an Oauth model, this means you need to have login access to the account to be able to connect it to Channex.

{% hint style="info" %}
You should have login access to the users account to connect it with Channex. You can ask the user to change their password after connection for security reasons and it will not affect the connection.
{% endhint %}

{% hint style="danger" %}
Make sure you are logged in to the correct Airbnb account before you try to connect.
{% endhint %}

## Create the Airbnb Channel

![](https://2514252617-files.gitbook.io/~/files/v0/b/gitbook-legacy-files/o/assets%2F-LWLG7_BCMgWd3mn6DYg%2F-MAjrRqPJUTv1YVfT0lS%2F-MAjw5Rpj_32N_BEcNYl%2FScreenshot%202020-06-26%20at%2011.22.08.png?alt=media\&token=bf295494-b3f5-46fb-a953-c00c08288904)

1. Go to: <https://app.channex.io/channels> and click on the create button
2. Channel: Choose "Airbnb"
3. Title: Enter the name or note on the connection
4. Choose which properties that will connect to the channel, this can be 1 property or multiple properties.

Once you have filled in all required fields the "Connect to Airbnb" button will become active.

{% hint style="warning" %}
If there is already another channel manager or PMS connected to Airbnb the connection will not complete. You should disconnect any connection before trying to connect Channex.
{% endhint %}

![](https://2514252617-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2F-LWLG7_BCMgWd3mn6DYg%2Fuploads%2FZRfSuZ20ytx88iZp94cx%2FScreenshot%202021-11-29%20at%2013.21.10.png?alt=media\&token=66481075-eaf6-4e3c-908e-b29ce410b84f)

**Min Stay Type:** This setting is so you can choose which min stay values you send to Airbnb. You should check since Channex supports 2 types of minimum stay and Airbnb can only have 1.

{% hint style="info" %}
Airbnb works on "Arrival" type of Min Stay. This setting just chooses which numbers we send over and doesn't change the min stay logic.
{% endhint %}

**Send Booking Notification Email:** This is optional if you would like Channex to send an email after a booking (New, Modification and Cancellation)

**Host ID:** This will be empty, once connection is active it will show the Host ID here.

**Copy Link:** If you have no access to the Airbnb account but need to setup on behalf of the host. Copy the link and provide to them. They can accept the connection and let you know if it was completed. Then the channel should be created.

After you press "Connect to Airbnb" button you will be taken to Airbnb page to confirm the connection. You should check if it is the correct account and accept. You will then be redirected back and we will show the connected text instead of the button.

<figure><img src="https://2514252617-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2F-LWLG7_BCMgWd3mn6DYg%2Fuploads%2FYFRUlcCCfT4FtnQ1bqci%2FScreenshot%202026-06-18%20at%2016.54.17.png?alt=media&amp;token=d45a1f5a-4bca-4db5-814d-47ed89276be1" alt=""><figcaption></figcaption></figure>

Less co host payout from Total: This is payout amount less co host commission

### Connection Errors

If you get any issues to connect it's usually only a few possible things

1. There is already a Channel Manager connected, they will usually tell you this error on top of the screen. You can go to setting and into privacy options to disconnect an old channel manager.
2. Missing Host info, this can block connection if the account is missing email verification or some other important details. They will usually notify you what is the problem

If you require help on connecting please take a video or capture images of the error before reaching out since it's usually on the Airbnb side.

## Multi Property

If you have multiple properties then you can add them in this section. Add all the properties to the channel and then you can map them to the listing in the mapping page.

<figure><img src="https://2514252617-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2F-LWLG7_BCMgWd3mn6DYg%2Fuploads%2FsaGO5sR2d5ykz2Lho3Ga%2FScreenshot%202022-12-13%20at%2019.30.56.png?alt=media&amp;token=a09ff55e-16f5-422b-9670-cc12c52b5784" alt=""><figcaption></figcaption></figure>

## Mapping Airbnb Listings

Once the connection is active

Click on the "Mapping" tab at the top to see the mapping.

Each listing will show as "not mapped" and It you just need to click on it to map.

![](https://2514252617-files.gitbook.io/~/files/v0/b/gitbook-legacy-files/o/assets%2F-LWLG7_BCMgWd3mn6DYg%2F-MAjrRqPJUTv1YVfT0lS%2F-MAjzBvua4E0YADY2lcb%2FScreenshot%202020-06-26%20at%2011.36.42.png?alt=media\&token=9c839563-6f38-4dd6-89c8-e356952cff0a)

Once you click on "not mapped" you will see a drop down to select what room and rate to map it with

![](https://2514252617-files.gitbook.io/~/files/v0/b/gitbook-legacy-files/o/assets%2F-LWLG7_BCMgWd3mn6DYg%2F-MAjrRqPJUTv1YVfT0lS%2F-MAjz_9ZbVkuHJNVoavh%2FScreenshot%202020-06-26%20at%2011.37.57.png?alt=media\&token=90071771-5845-48ba-b1db-5f1484c915fe)

You must choose both a room and a rate plan.

{% hint style="info" %}
If you have different prices depending on how many people are staying then you should map your lowest occupancy rate plan like the 1 person rate. There will be settings later to set how much extra to charge per person.

In this example the price is for the whole apartment so they mapped the highest rate.
{% endhint %}

Once you have mapped the listings click the Save button.

## Edit the listings

Once you have mapped the listings you can edit the listing to make sure the settings are correct.

Click on the "Listing" tab

![](https://2514252617-files.gitbook.io/~/files/v0/b/gitbook-legacy-files/o/assets%2F-LWLG7_BCMgWd3mn6DYg%2F-MAjrRqPJUTv1YVfT0lS%2F-MAk-XvGUlIDydCzpCDD%2FScreenshot%202020-06-26%20at%2011.42.25.png?alt=media\&token=2b8bc963-7254-40cb-a6e8-38c8236a0ddb)

You will notice the listing name first, then you will see "Published" or "Unpublished" You can click on it to change the status.

![](https://2514252617-files.gitbook.io/~/files/v0/b/gitbook-legacy-files/o/assets%2F-LWLG7_BCMgWd3mn6DYg%2F-MAjrRqPJUTv1YVfT0lS%2F-MAk-rETM2lmxL5n554K%2FScreenshot%202020-06-26%20at%2011.44.02.png?alt=media\&token=08bc49cd-094f-4070-953a-c3e1a684b37c)

The second option is "Price Settings"

![](https://2514252617-files.gitbook.io/~/files/v0/b/gitbook-legacy-files/o/assets%2F-LWLG7_BCMgWd3mn6DYg%2F-MAjrRqPJUTv1YVfT0lS%2F-MAk0QtpY2ivajpN8C_d%2FScreenshot%202020-06-26%20at%2011.45.00.png?alt=media\&token=224b035c-8c07-4fe4-87be-7eea33550ef6)

{% hint style="info" %}
The details are pulled from the listing, so mostly it is to check they are correct. You can edit also. These settings are now **not** editable in Airbnb!
{% endhint %}

**Currency** - Select the currency of your listing

**Default Daily Price** - Whatever is set here is the default price per night

**Default Weekend Price** - Whatever is set here is the default price per night

{% hint style="info" %}
Default Price & Weekend Price is just the default setting, the price per night will be synced from the room/rate chosen in the mapping.
{% endhint %}

**Monthly Stay Discount** - How much to discount for a 1 month stay

**Weekly Stay Discount** - How much to discount for a 1 week stay

{% hint style="info" %}
In the Airbnb admin, It it possible to set up other length of stay discounts also from 2 to 60+ nights.
{% endhint %}

**Price Per Extra Guest** - How much extra per guest from included guests

**Guests Included** - How many guests are included in the price per night

**Security Deposit** - How much will Airbnb keep as a security deposit

**Cleaning Fee** - What is the cleaning fee for the listing, this amount will be added to the final bill.

Next is "Availability Settings"

![](https://2514252617-files.gitbook.io/~/files/v0/b/gitbook-legacy-files/o/assets%2F-LWLG7_BCMgWd3mn6DYg%2F-MAjrRqPJUTv1YVfT0lS%2F-MAk5FYMBqJCmw1If_03%2FScreenshot%202020-06-26%20at%2012.07.05.png?alt=media\&token=1a09b003-0d0c-4399-ac5a-2fcfcdb54d79)

![](https://2514252617-files.gitbook.io/~/files/v0/b/gitbook-legacy-files/o/assets%2F-LWLG7_BCMgWd3mn6DYg%2F-MAjrRqPJUTv1YVfT0lS%2F-MAk5Jb9wryiwRECnQJA%2FScreenshot%202020-06-26%20at%2012.07.10.png?alt=media\&token=b1c4a624-0139-49f2-aa4c-c0746cc0c2e9)

**Number of Days**: Choose how many days in advance the listing should be available.

{% hint style="danger" %}
If the setting is on "Unavailable by Default" it is incompatible with Channex. You should choose either all dates or a number.
{% endhint %}

**Number of Hours** - How many hours notice you need for bookings so you don't get last minute bookings

**Preparation Time** - How long a gap do you need before accepting a new guest

**Max Nights** - What is the maximum length of a booking you would like, if you want long term stays then set a high number.

**Min nights** - Minimum length of stay for a booking

{% hint style="info" %}
These restrictions are just default settings, Channex will pass the min stay and max stay for each night from the Room/Rate plan in mapping.
{% endhint %}

{% hint style="danger" %}
Currently we send Min Stay Arrival restriction to Airbnb, if your property is using Min Stay Through it will not be sent. We will add a selector soon to choose which to send.
{% endhint %}

**Checkin Dates**: This is default settings for which days are allowed for checkin

**Checkout Dates**: This is default settings for which days are allowed for checkin

{% hint style="info" %}
These settings will be overwritten by channex daily from the CTA (Closed to Arrival) and CTD (Closed to Departure) restrictions.
{% endhint %}

**Min Nights Per Week** - Default settings for min stay per weekday

## Price Per Person with Airbnb

Airbnb allows you to map only 1 rate plan. So essentially you can send just 1 price only, to have different prices per person you will need to change settings in the Airbnb listing.

Example: 8 person room and you have different prices for 4,5,6,7 & 8 persons.

In this example you should send the lowest price (2 persons) to Airbnb

Then edit the "Pricing Settings" and set included persons to 4. You can find this settings in the channel by editing the channel.

![](https://2514252617-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2F-LWLG7_BCMgWd3mn6DYg%2Fuploads%2FIi5U2VOp5Nu2iDsVras5%2FScreenshot%202021-12-24%20at%2013.34.53.png?alt=media\&token=e721fde4-9258-4994-bb18-69fca037150e)

Then set "Price per extra guest" to whatever the increase per person should be.

For Airbnb you can only have 1 setting for price per extra person, you cant have different price for 1st extra or 2nd extra etc. They will all be the same.
