<!-- https://docs.channex.io/channel-mapping-guides/vrbo.md -->
> For the complete documentation index, see [llms.txt](https://docs.channex.io/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://docs.channex.io/channel-mapping-guides/vrbo.md).

# VRBO

VRBO / Homeaway connection is currently stable and working well

## Current Problems & Issues

Right now we have a few issues which are being worked on:

* Sometimes the channel will disconnect automatically (You will get email about this if it happens) Usually it is because the user has changed their user password.

## Supported Functionality

We support the following:

* ARI updates (Availability, Rates and Restrictions)
* Get Bookings (New, Modified and Cancelled)
* Currency Supported: **USD, CAD, EUR, AUD, NZD, JPY, SGD, BRL, MXN and GBP**

Not supported yet:

* Messages
* Reviews

## Make sure the VRBO account is not API connected to previous software

<figure><img src="https://2514252617-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2F-LWLG7_BCMgWd3mn6DYg%2Fuploads%2FqjeRLKmILuvU1fRhACoJ%2Fimage004%20(1).jpg?alt=media&amp;token=7f6c4647-8634-4978-b363-95223fe74bf8" alt=""><figcaption></figcaption></figure>

If the account was previously connected to a PMS for XML API then you will see something like this. The owner or property manager will need to ask VRBO support to convert the account back into a normal account (without channel manager)

Once this is completed it can be ready to connect. Connecting while still connected to previous software can make issues.

## Make sure you remove any ical connections

Leaving ical connected from Airbnb or another PMS will overwrite anything that Channex sends. You should remove ical connections first.

## Instructions for VRBO if it is connected to a channel manager already

"Please can you disconnect my account from my current channel manager, I will control the extranet manually"

They should disconnect the current channel manager and convert the account to a normal one with payments by VRBO.

## How to Connect

## Create the VRBO Channel

Go to the channels tab and click on "Create"

Select **VRBO** as the channel

Title - Enter the name you would like here to describe this connection

Group: Choose the correct group of which property you need to connect.

Affected Property: Choose the properties you wish to connect from Channex

Username: This is the VRBO username

Password: The password used to login

Authenticate: This button will start the connection

Test Connection - This button will check if the connection is a success.

**The Process:**

* Enter the username and password into the provided fields of VRBO channel
* Press Authenticate button (not test connection)
* (If Required) Enter the 2 factor SMS code into provided field. This is a code sent to the account owner
* Press Test Connection to see if it is successful
* if its working the mapping page should show listings, if not then please get in touch

## Mapping

<figure><img src="https://2514252617-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2F-LWLG7_BCMgWd3mn6DYg%2Fuploads%2FATeaoeL21GCDCpkSuNxz%2FScreenshot%202022-11-25%20at%2014.14.07.png?alt=media&amp;token=7d69642c-bc38-4e7d-afb0-363c3290673f" alt=""><figcaption></figcaption></figure>

Mapping page will show all listings to connect. Please map a room and rate to the listings you wish to connect.

Once everything is mapped activate the channel
