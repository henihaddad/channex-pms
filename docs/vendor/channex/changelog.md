<!-- https://docs.channex.io/changelog.md -->
> For the complete documentation index, see [llms.txt](https://docs.channex.io/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://docs.channex.io/changelog.md).

# Changelog

## 2026-09-14

#### New Channels

* Novoya

#### Features

* Record a refused review reply as `reply_error`, expose reply state in the API, send `updated_review` on refusal and confirmation

#### Bugfixes

* Answer `404` instead of `500` when an archive targets an unknown review

## 2026-09-08

#### New Channels

* GrevonAI
* Stayinto

#### Bugfixes

* Message attachments: a non-ASCII file name failed the upload with a bare 422. The upload now generates an ASCII-safe UUID name with an extension when available
* Open attachments with encoded file names instead of returning `404` for the URL from the API
* Cast a string occupancy in rate plan options before the `occ_adults` ceiling check.
* Return `HH:MM` check-in/check-out times from hotel policy create and update, so POST and GET no longer disagree on the same record

## 2026-08-31

#### New Channels

* OutReserve
* HLC+

#### Features

* Add log for property timezone changes in the property Logs
* Expose inserted\_at on ApplicationInstallation API responses

#### Bugfixes

* Prevent 500 when raising a room type's occ\_adults replays an occupancy option that already exists
* Answer a validation error instead of crashing the room type update when a decrease finds no occupancy option to promote in place of the one it removes
* Reject a rate plan whose occupancy options exceed the room type's max adults occupancy

## 2026-08-20

#### New Channels

* GlampingHub
* AscendTravel
* TBO

#### Features

* Add a `channex_booking_id` column to the bookings CSV export
* Mark taxes withheld by Airbnb (`tax_withholding_details`) with the `is_withheld` flag
* Associate `push_booking` channel events with the `Property.ReceiveBooking` task they enqueue
* Add Chinese (zh) language
* Warn users when a channel has an expected removal date
* Warn users when a property has an expected removal date
* Add grouping for events on live feed events filter
* Add channels filter to live feed events
* Unify datarange filter UI similar to live feed events
* The deactivate confirmation modal now show the retention policy information
* Add IP-whitelist support for API Keys

#### Bugfixes

* Clamp negative Airbnb booking amounts to zero when withheld taxes exceed the payout
* Keep the currency set on channel create when the channel's `connection_details` reports none, instead of overwriting the user's choice with `nil`
* Validate the booking\_id on booking application actions (payments, Stripe tokenization, Authorize.Net), so a non-UUID path id returns 422 instead of a 500
* Normalize a non-object `derived_option` in channel and mapping settings (`[]`/`null` to `{}`, else 422) and read stored ones as `{}` instead of a 500
* Prevent error on message send for bookings without channel
* Custom headers and request params should keep the key case
* Opening a non existing channel now shows "Resource not found"
* The Archive review action is available again in headless (iframe) mode

#### Chore

* Hide deprecated Airbnb Super Strict cancellation policies from selectable options

## 2026-08-11

### Features

* Reject switching an Airbnb listing to the deprecated `super_strict_30`/`super_strict_60` cancellation policies before calling Airbnb
* Add Live Feed API filter by Channel Adapter name
* Connect AscendTravel OTA
* Add new Live Feed events and webhooks (`channel_removal_warning`, `property_removal_warning`)
* Re-deliver booking webhooks on Latest revision resend call

### Bugfixes

* Answer with a validation error naming the field instead of `500` when a list filter value can't be cast to the field type (`filter[status]=pending` on bookings and booking revisions)
* Extend filter value validation for HTTP requests
* Skip the Airbnb LOS records update when no offers are generated

## 2026-08-03

### Bugfixes

* Stop sending `pass_through_taxes_collection_type` in Airbnb pricing settings updates (derived by Airbnb from the listing's tax jurisdiction; echoing it back rejected the whole update)
* Prevent duplicate Airbnb primary listing mappings
* Skip empty Airbnb LOS calendar operations and associate LOS listing sync events with tasks
* Reject `rate_source_id` referencing a rate plan from another property on Rate Plan create/update

## 2026-07-29

### Features

* Add `expected_removal_date` field to Channels
* Add `expected_removal_date` field to Properties
* Add warning emails about impending automatic channel removal
* Add warning emails about impending automatic property removal
* Cut live feed message previews at a word boundary with ellipsis

### Bugfixes

* Fix cut off dates reopening when `Property.UpdateDate` lags behind
* Fix unreachable billing account overrides in the API rate limiter
* Resolve BookingCom payment update status

## 2026-07-15

### Features

* Add total type options for Mr\&Mrs Smith

### Bugfixes

* Add max `30` limit for `property_settings.cut_off_days` field

## 2026-07-07

### New Channels

* JoodBooking

### Features

* Add strict currency validation across entities
* Update Make My Trip booking ID logic to save VendorBookingId

### Bugfixes

* Fix logic to exclude pass\_through\_taxes for Airbnb
* Improve logic for Airbnb Guest review tags

## 2026-07-01

### New Channels

* Room Panda
* RevChill

### Features

* Change default values for `allow_availability_autoupdate_on_modification` and `allow_availability_autoupdate_on_cancellation` at PropertySettings to `false`

#### Bugfixes

* Fix default `max_days_notice` value for new Airbnb listings
* Add logic to close out past dates on Date Update

## 2026-06-24

### Features

* Add single source of truth for supported currencies
* Add `inserted_at` into `message` webhook
* Add type and occupancy fields to rate\_params of Hostelworld channel adapter
* Add support for Airbnb Support messages

## 2026-06-22

### Features

* Improve Booking.com Load Future Reservations
* Add strict validation for `event_mask` on webhooks
* Add strict case-sensitive validation for channel field on Create and Edit channel operations
* Mask sensitive channel params by password field type

## 2026-06-17

### Bugfixes

* Fix tax inclusion resolution for identically named Booking.com charge codes

## 2026-06-08

### New Channels

* Julian Alps Booking
* Yatra

### Features

* Improve Airbnb Max Days Notice support
* Add new Airbnb Promotions

### Bugfixes

* Block ability to create cross-property Rate Plans

## 2026-06-01

### New Channels

* Guirez
* More.com
* Heytrip
* Crewdogs

### Features

* Persistent storage for Airbnb Connection Token
* Rework Booking.acknowledge\_status to reflect latest revision
* Schedule full sync for OTA CRS booking modifications and cancellations
* Extend Airbnb OAuth connection link TTL
* Preload Channel info at Reservation and Alteration requests UI
* Remove No Show option for Expedia bookings
* On property switch at Inventory screen add confirmation for dirty state
* Allow to edit offline source for Booking CRS

### Bugfixes

* Fix guest count message in emails
* Reset acknowledgement fields on new booking revisions
* Add validation for required credentials field on channel update
* Generalize per-mapping full\_sync to all channels
* Fix reports for multiple Billing Account owners
* Save WebhookLog with empty response
* Channels Report: use dates without timezone offset for checkin\_date filter

## 2026-04-13

### New Channels

* ZenithBookingEngine
* Tripnera

### Features

* Save booking when card data is invalid
* Gobal Webhooks support
* Add webhook log stats API endpoint

## 2026-04-01

### New Channels

* WigwamHolidays
* VibeLobby

### Features

* Add amount\_type field to Booking and Booking Revision responses
* Improve WebhookLog structure
* Remove `status` from channel view if not Google
* Organization-Level Webhooks
* Improve rendering for `Property.UpdateSettings` task payload

## 2026-03-09

#### New Channels

* Bed-and-Breakfast.it
* Padelbound

#### Features

* Add Pricelabs Application

## 2026-02-16

### New Channels

* WeSpeak
* Bedshero

### Features

* Add RateLimit headers
* Add booking amount settings options support for Despegar channel
* Add Property Title and Property ID to missed modification email
* New Organization Page
* Upgrade Photo Upload UI tool
* Improve availability rules drawer and forms with error handling and loading states

### Bugfixes

* Fix logic to calculate count of room for LiveFeedEvents
* Fix problem with loading Airbnb Descriptions

## 2026-01-26

### Features

* Add support for CoHost Payout at Airbnb - exclude cohost\_payout amount from total booking amount
* Airbnb LOS model
* Add Channel Activate / Deactivate logs at Property Tasks
* Add Channel Activate / Deactivate webhooks
* `allow_availability_autoupdate_on_confirmation` is not always ON
* Upgrade Airbnb API
* Add Smoking preferences to Booking Notes for Booking.com
* Improve formatting for amounts at Booking Interface

### Bugfixes

* Fix problem with trailing spaces at Hotel ID

## 2025-12-15

### Features

* Add support for Airbnb Listing Promotions
* Rework Aitbnb Listing Pricing Settings
* Rework Airbnb Listing Availability Settings
* Improve Airbnb LOS model synchronization logic

## 2025-12-11

### Features

* Improve logic for sending Property Notification emails

### Bugfixes

* Remove temporary users from group relationships object
* Improve security check for Reviews and OTA Score
* Prevent ability to create RatePlan with 0 occupancy

## 2025-12-10

### Features

* Add Auto Accommodation channel

## 2025-11-10

### Features

* Add logic to update Rate Plan currency when Channel currency changed
* Migrate to temporary attachment URLs from CDN
* Connect Levart OTA
* Show Feedback link only on Channex domains

## 2025-11-04

### Features

* Connect Gopaddi channel
* Connect WeSpeak channel
* Add `state` information into Customer entity for Booking.com

### Bugfixes

* improve error handling for Photo Upload operations

## 2025-09-30

### Features

* Billing Account page and Billing reports

### Bugfixes

* Fix max value for Min and Max Price at Property Settings
* Fix photo grid layout
* Fix HyperGuest short code

## 2025-09-17

### Features

* Add support for media-attachment for Airbnb messages
* Improve Billin Account Usage API
* Add handler and repeater to `close_rooms` at Google Hotel connection

## 2025-09-03

### Features

* Connect 1HotelRez
* Add LiveFeedEvent ID to MessageThread meta info
* Restrict access to Restrictions and Availability by 1 Property at same time

## 2025-08-27

### Features

* Add BillingAccount level option to block booking export for regular user
* Enrich Airbnb system messages by raw data
* Add Property Name into Listing Disconnected Notification

### Bugfixes

* Fix apply Cut Off time after midnight
* Fix problem with Guest Review override

## 2025-08-19

### Features

* Fix duplicated events on import booking operation
* Add BillingAccount level option to block booking export for regular user
* Update Listing info when `listing_edited` webhook from Airbnb handled
* Re-activate channel when `tns_user_reactivation` webhook from Airbnb handled
* Add ability to check `is_bookable` for multiple rooms

## 2025-08-12

### Features

* Improve Google HLF generation speed
* Add Payment Proxy API methods for Booking.com bookings
* Add report about Guest misconduct for Booking.com bookings
* Add report about changes to check-out date and / or price for Booking.com bookings
* Add test accounts select for Booking.com
* Add responsive view to channel events page

### Bugfixes

* Fix problem with multiple Booking CRS revisions
* Fix back navigation from Message Thread view

## 2025-07-22

### Features

* Add activation prompt on Save action for inactive channels with mapping
* Add notification for successful full-sync schedule
* Add support for new events at Live Feed
* Allow Export Booking operation only for Property Owner

## 2025-07-02

### Features

* Add logs for Apaleo and MEWS Booking events
* Connect VHP PMS
* Add "Inclusive without excluded taxes and fees" new tax mode for Apaleo
* Change font color to black at Booking Notifications

### Bugfixes

* Add validation for empty string at Send Message action
* Fix problem with inventory click for loading values

## 2025-06-17

### Features

* Add Channel Rate Plan Overrides
* Upgrade Airbnb API
* Release Payments App
* Release Stripe Tokenization App
* Improve MFA token logic

### Bugfixes

* Handle error with sending message to inactive channel
* Add error handler for No Show action when Channel is removed
* Fix channel icons in live feed events widget

## 2025-05-19

### Features

* Add UI to import missed Room Types and Rate Plans for Apaleo
* Add new Channel filters for IFrame UI (`available_channels` and `channels_filter`)
* Add a new flag to show Open Booking button at Chat header for IFrame UI (`messages_show_booking`)
* Add Extra Adult and Extra Child fee at Hotel Network mapping
* Add `ota_message_thread_id` into `message_thread` view
* Rework Booking import process for Airbnb channel
* Non blocking booking processing for Booking.com

### Bugfixes

* Deactivate sessions after change password
* Ability to deactivate Property is deprecated
* Solve problem with empty `rates` at Update Restrictions request

## 2025-05-05

### Features

* Improve StateChanges logs representation
* Add link to Google Hotel page

### Bugfixes

* Show property and room for removed rate plan on airbnb mapping

## 2025-04-23

### Features

* Improve StateChanges logs and Task Logs
* Add Google Hotel link into Channel settings info
* Add Wincloud Application
* Add logs for Apaleo app
* Add logs for MEWS app
* Improve logs for ApplyAvailabilityRules

## 2025-03-26

### Features

* Add Zavia Booking Engine
* Add GuruHotel
* Add AlojaPro into channels list
* Download logs for Channel Event

### Bugfixes

* Solve problem with creating photos
* Solve problem with creating duplicated photo

## 2025-03-18

### Features

* Add Load Future Reservations action to DespegarV2
* Add Copy To Clipboard button for OTA logs
* Add Download button for OTA logs
* Add deactivation reason section to channel events

### Bugfixes

* Fix pagination for Groups
* Fix problem with management fee for Airbnb
* Fix problem with State Length update and AvailabilityRules

## 2025-03-06

### Features

* Add support for Max Day Advance into Apply Availability changes
* Add Excluded / Included prices support for Feratel
* Add invalid card report for Booking.com bookings
* Allow dot for number separator on override modal

### Bugfixes

* Fix problem with inherit restrictions update on Rate Plan update
* Fix problem with photo without URL

## 2025-02-17

### Features

* Add Max Day Advance into Property Settings
* Connect BookDirect.com channel
* Extend logs for Booking operations

## 2025-02-10

### Features

* Improve logs for remove Rate Plan
* Improve logs for remove Room Type
* Use default rate plan for listing in check\_availability Airbnb action
* Add Deactivation reason and Logs
* Change logic for past dates in Availability or Restriction updates
* Add Ctoutvert channel
* Update options for Cancellation policy at Airbnb Rate Plans
* Fix problem with Airbnb listings search flickering
* Add filters and pagination to user api keys

### Bugfixes

* Solve problem with duplicated facility on update Property operation
* Fix problem with non-sent emails for Booking notifications
* Save log for `booking_unacked_email_sent` only if email was sent

## 2025-01-14

### Features

* Add maximum for Default Rate for RatePlan

### Bugfixes

* Fix validation for property state length
* Show error on mapping screen if mapping details null or cannot be loaded
* Correctly show failed readness check request result

## 2024-12-10

### Features

* Add API for Airbnb Checkout Tasks
* Add Unpublish reason API for Airbnb listings
* Add webhook notification for non acked booking event
* Automatic mappings for multioccupancy rates
* Add webhook notification for non acked booking event

### Bugfixes

* Correctly set min\_stay\_type for new channels based on properties

## 2024-11-28

### Bugfixes

* Fix problem with import past bookings for Airbnb

## 2024-11-27

### Bugfixes

* Fix problem with Min Stay Type at Channels
* Fix problem with default `max_count_of_occupancies` at BillingAccount

### Features

* Improve Cross Currency Rate recalculation logic

## 2024-10-28

### Features

* Add message translations for Airbnb
* Add property selector to property required pages
* Connect CampingVision
* Extend time-frame to load existed bookings from Airbnb
* Add webhook for accepted reservation request
* Add webhook for declined reservation request

## 2024-10-16

### Features

* Connect RVPARKGURU
* Add search to Airbnb mapping rates selector
* Add Confirmation for resend latest booking revision
* Hide always changed fields in revisions diff view
* Improve webhooks for Airbnb Reviews
* Improve logic to work with Airbnb suspended listings

## 2024-10-01

### Features

* Remove Ack Booking settings from Wubook
* Don't send inquiry webhook if messages app is not installed
* Force remove for Property
* Force update for Room Type

## 2024-08-20

### Bugfixes

* Add association between Rate Plan and Booking Room for better sync

### Features

* Add logs about webhooks
* Connect Sissae Living
* Add 2 hours offset for update date
* Connect B2B Global Channel
* Turn off room spaces
* Add collected Taxes representation for Booking.com

## 2024-08-05

### Bugfixes

* Allow change occupancy for Per Room Rate Plans connected to channels

### Features

* Add Validation Check for Entity Limits at Update Property
* Connect seminyak.villas channel

## 2024-07-24

### Features

* Connect Make.com
* Allow to filter Reviews by Property ID
* Save PaymentCharge info for Booking.com reservation
* Add setting to save booking price without commission for Ostrovok

### Bugfixes

* Solve problem with symbols at email subject
* Add handler for failed security check at Booking.com messages
* Pull review scores immediately after Messages Application install
* Add handler for failed change occupancy settings at Booking.com

## 2024-07-22

### Features

* Add Entity Limits
* Use rooms mappings as a fallback for Booking.com mappings
* Add new option for Agoda booking parsing
* Show removed rooms and rates in PriceTravel mapping UI
* Open App Settings on click at installed app
* Added Tax Mode for Apaleo

### Bugfixes

* Assign Message Thread to Booking after booking creation
* Send web-hooks for Reservation and Alteration requests without check for existed Messages App

## 2024-07-02

### Features

* Connect TableHotels
* Improve booking export file
* Rate Errors for LiveFeedEvents
* Add Rate Error Webhook event
* Hide Room Type links for embedded mode

### Bugfixes

* Improve event matching for Webhooks
* Prevent inventory requests without property filter
* Use UTC time for bookings advanced search booking date filter

## 2024-06-12

### Features

* Add listing\_id into MessageThread and Review objects
* Add support for applicable\_dates and max\_days for Google taxes
* Add handler for Airbnb Trip Issues
* Add support for Airbnb Review Tags

### Bugfixes

* Fix problem with count of messages at MessageThread

## 2024-06-05

### Features

* Upgrade Traveloka connecton
* Check Google Vacation Rentals Property Address Requirement
* Add Car Proxy Extras
* Add filter by `room_type_id` for `Channels.list`
* Add support for Date Ranges at Taxes

### Bugfixes

* Prevent duplication at MessageThreads
* Fix mapping scrollbar flickering

## 2024-05-20

### Features

* Ability to generate PDF by Booking ID
* Connect HotelTonight
* Add property facilities data to Google VR HotelListFeed
* Connect The TPM Group channel
* Add webhook for disconnected Listing and Channel
* Fix problem with booking modification across properties at Airbnb channel
* Connect SleepRest

## 2024-04-30

### Features

* Connect Rate Tiger
* Trigger Mapping loading after successful VRBO Auth
* Price type switcher for Booking.com

### Bugfixes

* Block ability to create Active channels
* Add validation for options at `per_room` RatePlan

## 2024-04-16

### Features

* Add API to send no reply needed marker for Booking.com
* Hide Airbnb Rate Plans under user settings flag

### Bugfixes

* Fix problem with float values at Update Restrictions
* Improve performance for Manage Group Properties operation
* Fix problem with Cascade Rate Plan parent selection
* Fix problem with rendering tail of state at Inventory screen

## 2024-04-09

### Features

* Add ability to refresh listing data for Airbnb
* Add API for no-show report for Expedia
* Filter listings for Airbnb Opportunities

### Bugfixes

* Add `noise_monitor` into Airbnb Guest Expectations list

## 2024-04-03

### Features

* Connect Hoterip Channel
* Improve Listings tab for Airbnb
* Add `de` and `el` languages into application
* Add Roibos mapping with primary rate per room
* Improve Date translations
* Migrate to latest Airbnb API version
* Open closed dates for Airbnb on connect listing
* Add OTA\_unique\_id for BookingRoom
* Fix problem with guest ages extractions for Booking.com
* Add Dida Travel channel

## 2024-03-13

### Features

* Improve Channel Readiness Probe
* Connect Juniper channel
* Connect BookOutdoors channel
* Connect Hostel Hop channel
* Add logs for Remove / Delete property scenarios
* Batch Airbnb Syncs by 30 seconds frames
* Split Availability and Restrictions syncs for Airbnb Full Sync

### Bugfixes

* Fix problem with channel events access

## 2024-02-20

### Features

* Connect Juniper
* Booking amount type for VRBO
* Remove room revenue from channel report
* Multiple levels of cancellation policies
* Add title for Channel Availability Rules
* Short number format for big rates on inventory screen
* Add Reconline mapping
* Show Subscription ID in Apaleo app settings
* Remove room revenue from channel report
* Add support for Extended Taxes

### Bugfixes

* Missed modification and cancellation availability update fixes

## 2024-02-06

### Features

* Disable editing for Availability Offset and Max Availability restrictions
* Add defaults for Rate Plans
* Fix Full Sync logic when Reservation request is voided on Airbnb

## 2024-01-22

### Features

* Add Listing disconnect notification
* HostelWorld option to keep total with or without commission
* Add Room Amount into Booking Export
* Auto update Rate Plan occupancy options on Room Type changes
* Remove Help link from menu
* Add danger color to remove menu action
* Fix problem with pulling messages for Bookings without channel
* Fix problems with soft-remove and Remove Group and Property operations
* Fix problem with replied review

### Bugfixes

* Fix problem with same Rate Plan mappings

## 2023-12-13

### Features

* Add Booking Settings API for Airbnb
* Translate User Emails
* Allow Admin change Channel Currency
* Connect Reconline
* Add Channel Availability Rules
* Add missed actions into Task logs search
* Disable messages for old bookings

### Bugfixes

* Fix messages for Unmapped Rate

## 2023-11-21

### Features

* Full sync Airbnb listing on reservation\_request\_voided event
* Custom icon for date range separator
* Show read only rate plan icon on mapping

### Bugfixes

* Fix problems with removed rates at SetTaxSet operation
* Add guest names in emails

## 2023-11-14

### Features

* Add timezone list endpoint
* Remove max availability from Bulk Update
* Connect Hopper
* Sort channels list in advanced search
* Format numbers on inventory screen

### Bugfixes

* Fix problem with currency updates when Channel updated

## 2023-10-31

### Features

* Add Hookusbookus channel
* Add Bookeasy channel

### Bugfixes

* Fix showing inventory due to mismatched start dates on inventory because of day change

## 2023-10-11

### Features

* Improve logs for add and remove Channel
* Add WINK Channel

### Bugfixes

* Block ability to create property through restricted API Key
* Fix Boolean value representation at State Changes Log
* Fix Primary Occupancy selector at Mapping screen

## 2023-09-26

### Features

* Connect HotelPoint
* Connect Szallas
* Improve mapping logs

## 2023-08-21

### Features

* Remove load\_ari from Booking.com
* Limit ability to create property only to accounts with active subscription
* Connect PegiPegi
* Connect Ostrovok
* Add ability to export Bookings to CSV
* Remove photo from emails
* Add meal plan to Booking Notification
* Currency support for Channels

### Support

* Remove HRK currency

## 2023-08-08

### Features

* Connect HotelNetwork
* Connect GetARoom

### Bugfixes

* Fix link at User Invitation email
* Prevent Room Type change on Rate Plan
* Fix initial loading for mobile inventory

## 2023-07-18

### Features

* Limit API Key access to bookings feed operation
* Allow create property only to Billing Account Owner or User with allowed API Keys
* Allow install Application only to Billing Account Owner or User with allowed API Keys
* Add `timeout` status into ignored statuses for Airbnb
* HotelNabe change to short ID for mappings
* Move airbnb rate plan feature toggle to rate plans tab

## 2023-06-26

### Features

* Add Wihp Channel
* Remove LiveFeedErrors on FullSync
* Add taxes for Airbnb bookings
* Add Taxes support for OpenChannel

### Bugfixes

* Set `first_seen_at` to current time if it is nil at Ack moment
* Allow user resolve Unmapped bookings

## 2023-06-22

### Features

* Add Airbnb Rate Plan support

## 2023-06-19

### Features

* Add OTA Commission per Booking Room
* Add AtlantisORS channel
* Add Hipcamp channel
* Add ACE Booking Engine
* Add URL marker to block Edit Availability at inventory screen
* Add channel events filters

### Bugfixes

* Fix problem with broken Photo URL
* Fix problem with Room Type title duplication with removed rooms
* Allow property selection at Headless mode if Active Property is not defined

## 2023-06-07

### Features

* Add CutOffDays support
* Add Property title for Airbnb Notifications
* Add Booking Acknowledgement filter
* Add Property title into Bookings page
* Improve Airbnb Inquiry representation
* Add OTA Commission field
* Add `is_expired` field for Reviews

## 2023-05-30

### Features

* Add meta field for RoomType
* Add support for Host Reviews at Airbnb

## 2023-05-23

### Features

* Package management for Group Properties
* Add User Info into Channel Events
* Implement back sync for Airbnb for `failed_verification` bookings

### Bugfixes

* Fix problem with messages and non supported method
* Fix problem with CutOffTime Task scheduling

### Maintenance

* Remove BookingEngine

## 2023-05-08

### Bugfixes

* Fix problem with min\_stay for OpenShopping
* Allow 0 as max age for Infants and Children
* Fix CRUD table content flickering
* Shrink navbar controls on mobile

### Features

* Inventory settings
* Rename "Restriction" user api key column to "Properties"
* Remove property modal: visual feedback for request

## 2023-04-18

### Features

* Add CutOffTime support
* Remove known mapping UI

## 2023-04-03

### Features

* Disable Sign Up for new users
* Improve import for Booking.com and children support
* Add OmniHotelier Channel
* Add Google Static map into emails
* Add option to select Airbnb booking amount type
* Restrict access to ChannelAdapters by User email
* OmniHotelier

### Bugfixes

* Open alteration request from messages on same screen

## 2023-02-22

### Features

* Add support for Room Spaces
* Filter API Users from responses
* Add position into Room Types
* Mask booking raw payload

## 2023-02-06

### Changes

* Remove old Sign In method

## 2023-02-01

### Features

* Add customer phone number into Property Booking notification
* Add payment collect into Property Booking notification
* Add rate plan title into Property Booking notification
* Improve Booking Confirmation email
* Improve Property Booking Notification email
* Connect HotelNabe PMS
* Add LiveFeed filtering by group\_id
* Sort booking room dates in price breakdown

### Performance

* Optimisation for rate plans rendering for rate association input

## 2023-01-23

### Features

* Return card token only for Channex PCI
* Migrate Wubook to independent channel logic
* Extract StateChanges consumer into separate library
* Associate cancellation policies and tax sets with rate plans
* New design for review app

### Bugfixes

* Fix problem with non-existing group in create property
* Fix search for Channel Events
* Fix logic to find by Groups
* Fix problem with syncs and Max Availability settings
* Disallow disable channel with Active Mappings for Airbnb and VRBO
* Add timestamps for system events at Channel Events
* Improve validation message for Disable channel
* Add flag to show Booking Notifications field

## 2023-01-16

### Features

* Allow force remove for taxes
* Migrate to new Airbnb web-hook API version
* Add mapping logs for Airbnb
* Airbnb Notifications support
* Add Campendium Channel
* State Changes Report
* Enable mapping on Hotelbeds channel after contract provided

### Bugfixes

* Fix Airbnb remove listing race condition
* Fix Booking.com fake credit card issue
* Ignore invalid credit cards
* Solve problem with image updates
* Solve problem with Ghost bookings at Airbnb Import
* Fix readiness check for Airbnb
* Fix Airbnb failed request handler

## 2022-12-06

### Features

* Connect Dream Ireland Channel
* Remove MaxSell support

## 2022-11-30

### Features

* Make remove property operation async
* Add PCI Application
* Add API to get Closed Dates per Rate for IBE
* Connect Tiket.com channel
* Connect Goibibo (Make My Trip)
* Add guest notes into Booking Notification Email
* Add code for RoomCloud channel
* Add IP address and Geo location into MFA Confirmation Email

### Bugfixes

* Fix mistake at change password scenario
* Fix Airbnb reservation request notifications
* Correctly sync if room type is known

## 2022-11-10

### Features

* Prevent webhook duplications
* Add OTASync channel
* Make remove channel operation async
* Add Room Type Codes
* Add ReservaCars channel
* Add Caren Rentalcars channel
* Connect Mitchel Corp OTA
* Add diff view for Mappings and Settings channel changes
* Fix occupancy options for VRBO mappings

### Bugfixes

* Change Airbnb mapping title

## 2022-10-27

### Features

* Allow to pass active group for IFrame
* Render children ages at booking UI
* Hide CreditCard info after Ack for API-Key users
* Add CreditCards retention policy
* Add Channels rentention policy
* Add Channel deactivation email
* Add Property retention policy
* Add guests\_ages handling for IBE
* Trigger Full Sync after Google channel tax update
* Improve room and rate title representation at mapping screen

## 2022-10-18

### Features

* Add MFA Support
* Add Tripla Channel
* Improve Cleaning Fee UI for Airbnb
* Remove VerticalBooking Channel
* Add Word Wrap for Channel Event logs

## 2022-10-11

### Features

* Decrease rate limits to update availability operation
* Channex Express content changed notifications
* Check hotel code uniqueness in settings for Applications
* Add retention logic for LiveFeedEvents
* Upgrade Airbnb API version
* Connect Shalom PMS
* Soft remove logic for Room Types
* Add UI for Booking Deposits
* Remove Facebook auth button

### Bugfixes

* Resolve problem with photo duplications
* Fix error on decrease adults occupancy at Room Type
* Fix rate plan titles at OpenShopping connection
* Fix problem with messages count update

## 2022-09-07

### Features

* Connected Wise PMS
* Allow float as number of bathrooms for Google Hotel Ads
* Added `agent` field into Bookings
* Hotelbeds channel we auto check for updated contract dates and sync
* Added logic to update property geo-coordinates on create and update

### Bugfixes

* Update Hostelworld channel rate plans with mapping data
* Improve logic for import bookings
* Fix problem with occupancy calculation with Booking.com modifications

## 2022-08-22

### Features

* Add Deposits support
* Improve Pull Future reservations method for Expedia
* Add support for excluded extras into OpenChannel API
* Add Channel List Options endpoint
* Improve UI loading performance
* Add Booking.com quick connect

### Bugfixes

* Fix sort by channels\_count for properties list
* Fix Properties Group filter for total count
* Fix channel name at Property email notification
* Fix reset password form
* Fix text for Empty Rate Plans at Rooms Page
* Fix Primary Rate icon position
* Fixes for Navigation Application dropdown
* Fix message for Readiness check

## 2022-07-19

### Features

* Connect Airbnb opportunity API
* Connect Airbnb cancel reservation API

### Bugfixes

* Fix policy sown at Booking at Channex UI
* Fix issue with airbnb future dates sync

## 2022-07-07

### Features

* Improve Review API
* Allow Inntopia connect multiple Properties
* Fix Agoda cancelled bookings
* Implement logic to remove account
* Add advanced search for Bookings
* Add advanced search for Channels
* Simplify Minimum Stay logic
* Add Group selector into UI

### Bugfixes

* Fix mistake with occupancy options on Per Room to Per Person derived option
* Fix Expedia data extraction logic to correctly work with phone number

## 2022-06-28

### Features

* Connect Spot2Nite
* Improve Auto Availability Update logic
* Mark expired reviews as replied
* Cancelled bookings show rooms with 0 rates for Booking.com
* Add paid parking rule into Hotel Policy
* Prevent remove default User Group
* Show pending status for GoogleHotelARI channels
* Airbnb: full sync on special offer webhook

### Bugfixes

* Fix removed rate plans representation
* Solve problem with ID filter at property options endpoint
* UI Bug Inventory Page
* Fix currency conversion at Derived Rates
* Solve problem with `nil` value passed to restrictions

## 2022-06-15

### Features

* Add Max Availability into Bulk Update operation
* Airbnb accept inquiry API
* Doesn't allow to change PropertyID at RatePlan Update API
* Doesn't allow to change PropertyID at Room Type Update API
* Connect Athena PMS
* Implement logic to recalculate nested rates with different currency

### Bugfixes

* Fix problem with currency conversion at Booking Stats
* Fix problem with current date at inventory page
* Fix problem with accept Alteration request
* Improve validation for OpenChannel

## 2022-06-01

### Features

* Implement force remove for RatePlans
* Implement force remove for RoomTypes
* Add support for MinStayThrough into is\_bookable method
* Allow to setup custom Announcements URL
* Add new White Label Feature flags
* Add fields into YieldPlannet Intall UI
* Review Application

## 2022-05-24

### Features

* Open / Close Thread at headless mode
* Remove Room / Rate improvements
* Improve inventory table rendering
* Add Message Sender into message webhook payload
* Convert currency for Bookings Stats
* Remove photos from CDN
* Pull calendar for Airbnb
* Golden Up integration
* Support for different dates in booking for OpenChannel
* Add ability to cancel booking for removed Reserva channel
* Cut off time for Google Hotel ARI
* Remove Room / Rate API improvements
* Add child ages into Google Hotel ARI
* Decrease Rate Limits for Restriction to 40 per minute

### Bugfixes

* Demo Property scenario fixes
* Fix arrival and departure date parsing for b.com

## 2022-04-26

### Features

* Per Property limit for ARI updates
* Child rates for Google Hotel IBE
* Add currency filter for HyperGuest mapping dialog
* Read Only Rate Plans
* Allow edit Stop Sell for Channel Rate Plans

### Bugfixes

* Fix problem with load listing details

## 2022-04-13

### Features

* Add Exact Match settings into OpenShopping
* Airbnb mapping API
* Limit ability to setup YieldPlanned application to specific user
* Restrict group management for non billed users
* Net Rates for CTrip
* Add independent channel Subscriber registering repeat
* Change date format at Booking confirmation email
* Add Legends into Hotel Policy drawer
* Hide Group management and Application install for non-billed users

### Bugfixes

* Fix for PricePerUnit at Booking.com
* Log shows success on error task
* Extend error handling for Agoda connection
* Filter out cancellations at Pull future reservations for Expedia and other channels

## 2022-04-06

### Features

* Connect stayforRewards
* Order booking\_revisions at feed from oldest to newest
* Hide count of bookings and max sell restrictions
* Hide FlipView for Hotelbeds Channel
* Hide FlipView for Inntopia Channel
* Improve System message representation
* Add translations for Billing details
* Exact Match settings translation

## 2022-02-28

### Features

* Show default group at properties page
* Added Travia channel

### Bugfixes

* Fixed problem with Request Full Sync at OpenChannel
* Solved problem with MinStay conversion at OpenChannel
* Fixed inquiry to only show one time

## 2022-02-15

### Features

* Convert Alteration Request into our Booking Message
* Add support for Airbnb inquiry
* Allow mark Billing Info as required at Booking Engine
* Allow edit restricted API Key
* Settings for Children and Infant Ages
* Inntopia channel

## 2022-01-26

### Features

* Improve performance for UpdateAvailability task
* Highlight not mapped rooms and rates
* Hide notification settings at Embedded mode
* Add Languages support
* Airbnb Pet Fee
* Add Standard Fee for Airbnb

### Bugfixes

* Fix Agoda max min stay
* Mark failed requests at CTrip
* Change currency code representation at emails
* Cancel Alteration request for Airbnb when booking is cancelled

## 2022-01-11

### Features

* Mute Expedia Temp error
* Support Min Stay for Hotelbeds
* Airbnb Cursor Based pagination
* Connect CTrip

### Bugfixes

* Fix problem with photo duplications
* Set default RoomType.count\_of\_rooms to 1

## 2021-12-20

### Features

* Add API Limits for VacationRental and change Billing logic
* Add AbodeConnect channel
* Implement Revision TTL based at first-seen action
* Add technical\_support\_email into BillingAccount
* NEW: Despegar OTA (Beta)

### Bugfixes

* Improve RoomType validation

## 2021-12-14

### Features

* Improve Webhooks and add logs
* Add Alteration Request into LiveFeedEvent filter
* Hide Create and Remove actions from Properties page at embedded mode

### Bugfixes

* Improve error handling for OpenChannel
* Fix bug at send invite to User
* Fix property name at select at Channel form
* Fix Airbnb connection flow
* Fix CRUD table height
* Fix Airbnb UI bug with filter

## 2021-11-24

### Features

* Improve backstage sync logic
* Add webhook management UI
* Add webhook tab into Property Drawer

## 2021-11-08

### Features

* Improve User API Key UI
* Add system messages into Chat UI
* Add resend booking button
* Add message.id and message.ota\_message\_id into Message Web Hook
* Improve Airbnb reservation request handlers
* Implement Airbnb alteration request support
* Pull messages when Reservation Request coming
* Add Fuota Channel
* Add support for System messages into Chat
* Trigger Full Sync after update Pricing Settings at Airbnb
* Add ttl for feed endpoint

### Fixed

* Add UI callback if remove Room operation failed
* Disable Inventory page when Property selection is removed
* Fix problem with infinity loading after close / open conversation
* Solve problem with remove Primary Occupancy Mapping
* Fix Agoda bookings room extra amount parsing
* Fix incorrect Message Thread channel association
* Fix Message Attachment URL

## 2021-10-27

### Features

* Add ability to create API Key to manage only selected Properties
* Improve UI for Airbnb Reservation Request
* Expose stop\_sell\_manual and user\_id into changes web-hook

### Fixed

* Fix URL in emails
* Fix card type representation at Agoda
* Fix dialog header at mobile devices

## 2021-10-20

### Features

* Upgrade Taxes library to work with multiple level taxes
* Add White Label Domain settings
* Deny ability to invite User as Property Owner
* Add Host ID into Airbnb UI

### Bugfixes

* Fix problem with Airbnb token override
* Allow open Profile page when account not have any Property
* Mute email notifications for imported bookings
* Solve problem with Airbnb mapping remove operation

## 2021-10-12

### Bugfixes

* Fix incorrect `null` value interpretation at incoming requests
* Fix error on update property operation
* Fix problem with loading billing information
* Fix problem with BackstageSync and dates from previous revision

## 2021-09-28

### Bugfixes

* Fix spelling mistakes at emails

## 2021-09-21

### Features

* Add Billing
* Add WebSocket communication for new Messages
* Improve Extra Channel calculations for HotelBeds

### Changed

* Update auto KnownMappings after channel mappings change

### Bugfixes

* Solve problem with imported Expedia bookings and prefix channel code

## 2021-09-06

### Features

* Add `booking_id` and `revision_id` into Booking View dialog
* Add button to open conversation
* Allow create booking with same unique\_id at different properties

### Changed

* Change OTA name for Open Channel, Open Shopping and Google Hotel Ads

### Bugfixes

* Correctly handle channel loading error
* Fix Channel name at Inventory Page
* Fix Channel link at Inventory Page
* Fix problem with `user-api-key` header and CORS request

## 2021-08-23

### Features

* Improve chat header UI
* Implement properties filter for messages page
* Allow User clear Property selection
* Save property set tax set to default for all rates
* Keep Airbnb token scope
* Generate default title if it is not provided for Channel
* Release HotelBeds

### Fixed

* Fix property page mobile view
* Show Airbnb Auth button only if new token is required
* Fix problem with `room_kind` default at RoomType API
* Trim spaces at Channel Settings
* Allow invited User to manage property channel
* Airbnb Reservation Request fixes
* Solve problem with retrieve thread\_id from Airbnb booking
* Fix message\_id extraction logic for Airbnb
* Solve problem with remove mapping at Airbnb

### Changed

* Add cover photo into RoomType options response
* Implement logic to launch Full Sync after failed Airbnb check\_availability request
* Improve error responses for Send Message operation

##
