# What hosts say about channel managers on Reddit and X, November 2026

Method: Apify scrapes on 2026-11-07. Reddit: nine searches (channel manager, property management
software, Guesty, Smoobu, Hostaway, Hospitable, Lodgify, OwnerRez, Uplisting), relevance-sorted,
last year, 18 posts per search plus the top 5 comments per post: 151 posts, 613 comments, of which
about 100 threads and 520 comments are on topic. X: six searches since 2025, 233 tweets, of which
about 15 are genuine host voices; the rest is vendor marketing, affiliates, a Roblox character
called Guesty and penny-stock spam. Cost: 1.50 USD. Raw data is kept out of the repo (it is other
people's writing). Quotes below are verbatim, trimmed, with comment score and subreddit.

Read with care: most threads have single-digit scores, r/hostaway_official is partly vendor-seeded
("Feels like a lot of similar posts lately and Guesty spam", 4, r/ShortTermRentals), and several
Lodgify and Roomspilot posts are affiliate copy. The complaints are organic; much of the praise is
not. This is the opposite of the review sites, where the praise is organic and the complaints are
buried.

## 1. What decides sentiment, in order of how often it came up

1. **Support after go-live.** Guesty: "It can take days to get responses. Guesty Pay is even worse
   and can take a week" (3). Hospitable: "they have an AI bot that answers all the questions" (OP, 9);
   "I'm 196 in the queue for help" (7). Hostaway: "There is no telephone number to contact them" (1);
   "15 times with support, always foreign". Cheap tools win here: Hostex "customer service chat is
   very helpful" (5), Host Port "Support is really good too" (6). One commenter: "support is
   basically part of your operations" (1).
2. **Hidden and stacked fees.** Hostaway's "1.8% additional Hostaway fee" on direct bookings on top
   of Stripe (5, 3). Lodgify's per-booking fee on lower tiers and a one-year contract (3). Guesty
   "won't refund the year fees when their system doesnt work" (2). Lodgify's guest insurance:
   "refundable deposit or subscription to safely... What a scam" (5). On X: "You're paying anywhere
   from $20 to $40+ a unit and calling it 'fine'". The question a host now asks before buying:
   "what commission do they take on direct bookings?" (1).
3. **Onboarding that silently corrupts data.** Hostaway: "Bedrooms changed to '0' bedrooms. Emails
   were diverted to the wrong guests. Minimum night stays increased from '2-days' to '5-days'" (12).
   Lodgify: "None of the reservations in VRBO that were booked with us before the integration, or
   the dates 'blocked' on the calendar, synced", then "an immediate double booking" (2); two units
   "both got cross mapped to the wrong Vrbo listings during onboarding" (1). Guesty: "my Vrbo
   listing just vanished into thin air" after switching from Lodgify. Guesty, right before go-live:
   "they could not send payments to separate accounts for the different properties. Wasted weeks" (2).
4. **Money bugs.** Guesty: "you change a reservation amount but the scheduled payment does not
   automatically update to the correct amount" (5); the mobile app "autofills the nightly rate to £1"
   (2) and "has taken months for it to be acknowledged that it could even be a bug" (1). Hospitable's
   pricing set a "cleaning fee at 1000 USD instead of 1000 MXN" (2). Guesty "owner payment issues
   several times this year... directly cost us a couple of owners" (4).
5. **Vrbo is the channel that breaks.** Across Hostaway ("almost 2 months to have the vrbos fully
   integrated"), Lodgify ("vrbo won't sync"), Hospitable ("my property won't integrate with Vrbo"),
   Uplisting ("We've heard the Vrbo feedback"). Nobody is praised for Vrbo.
6. **Speed.** "The app is slow as dirt. Opening a message thread is 10x slower than the native Airbnb
   app" (Hospitable, 5-year customer). Hostaway's multicalendar zoom "just actually make what you see
   smaller and doesn't show more listings/dates" (1, 29 listings). "at 20+ listings, the UI matters
   way more than people expect" (1).
7. **The PMS strips channel features.** Connecting a PMS greys out Vrbo's guest-paid damage insurance
   (5); Smoobu "won't let you override anything, not even price" once Airbnb is connected (3); buffer
   days become "only the choice to have it on, or off"; Airbnb promotions "do not work well with
   pms" (1). Each vendor then blames the other: "Airbnb tells me I can't make this change directly...
   Smoobu tells me that I can't make this specific change in Smoobu either" (2).

## 2. Who recommends what, by size

| Size              | What the crowd says                                                          | Quote                                                                                                                                            |
| ----------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1 unit            | Don't buy a PMS. Airbnb + Vrbo direct, PriceLabs, Turno, scheduled messages. | "You absolutely should not get a PMS for one property" (4) · "Calendar sync + basic messaging automation covers most people under 5-6 units" (1) |
| 2 to 5            | Hospitable, Smoobu, Hostex, Lodgify, Guesty Lite                             | "1 to 5 units: Smoobu or Hospitable. Both keep things lightweight" (11) · Hostex "$6 per property and does what you ask for" (5)                 |
| 5 to 20           | Hostaway + PriceLabs + Turno                                                 | "pretty much the standard stack" (1) · "breaking point is usually around 3-4 properties" (1)                                                     |
| 20+               | Guesty                                                                       | "If you have over 20 properties... Guesty starts making sense" (4), yet the 50-unit Guesty thread is all bugs                                    |
| 80+ mixed STR/LTR | Streamline, Rent Manager                                                     | Track "2-3X as expensive"                                                                                                                        |

The meme that summarises the market: "Lodgify is what you start with. Guesty is what you pay for
when you think you've made it. Hostaway is what you switch to after Guesty's support team ghosts
you" (5). Price anchors: Hostex 5 to 6 USD per property, Host Port about 10 USD, Uplisting
"4 properties a year for £420", PriceLabs "like 1% of my booking rate" (5), Guesty "ridiculously
expensive", Guesty Lite "too expensive for us" (5).

## 3. Unmet needs, with the quote that names them

- **Combinable units.** Three units rentable "either separately or together... seven different
  configurations"; "avoid having to pay for seven separate listings" (6). Beds24 and Hostex are the
  only tools named as handling it.
- **Per-channel block.** OwnerRez: "Can't block the calendar because it will also block it on all
  other platforms. It feeds everywhere."
- **Payments that follow edits.** "open the scheduled payments and confirm the amount matches" is the
  workaround (3).
- **Owner payouts to separate accounts, with failure alerts** (4, 2). An owner portal is the reason
  one host left Hospitable for Hostaway, which "sucked" (4).
- **Simple owner reports.** "They don't want 12 tabs of data... revenue trends, occupancy, and
  month-over-month comparisons."
- **Cleaner without an app.** Hospitable praised for "alert my cleaner of new bookings via email AND
  text, and she doesn't have to download an app" (7).
- **Sub-accounts and roles.** Airbnb allows one PMS per account, so co-managed listings need "a pms
  with subaccount function" (2); a hostel runs a "universal volunteer account" because per-user
  setup is painful.
- **Booking extensions from the PMS.** "There is no way to extend booking from third-part software
  directly in Airbnb or BDC" (1).
- **Included e-signature.** Lodgify's agreement is "a check box"; "Docusign is too expensive" (1).
- **Guest ID verification** without an off-site form that makes guests say "seems weird" (OwnerRez,
  Hospitable).
- **Regulatory filings.** Italy: a one-apartment host picked a PMS because it files "schedine
  alloggiati e ISTAT" automatically; others do "Istat, dichiarazioni cedolare secca, schedine
  alloggiati" by hand.
- **Channel-specific markup** after Airbnb's host-only 15.5% fee: "Mark up your Airbnb specific
  fees 15% using your channel manager / PMS" (X); Airbnb's own tool "ONLY gives the option to
  automatically raise your prices by 15%" (48).
- **Google Vacation Rentals and Expedia messaging** (Smoobu users waiting "more than three years").
- **Messages in the property's local time**, lock codes from the guest's phone number, a daily
  check-in/out view ("Most people I know end up running a simple tracker on the side", 1).
- **A real API.** Guesty's is "not full featured and very rate limited" (4). The most sophisticated
  Guesty customer wants only "channel connections, messaging, and PriceLabs" and built the rest.
  "I don't need a good looking UI as long as I can connect to the api" (2).
- **Migration safety.** The one good migration story: "run both systems side by side for a couple
  weeks, re-check taxes and payment schedules on every listing, rebuild message templates" (3).

## 4. What nobody says

Channex: zero mentions in 997 items. Open source, self-hosting: zero. Nobody knows the layer under
their PMS exists. The nearest signals are "ask whether the Airbnb and Booking.com connections are
real API integrations or iCal" (1), "You retain ownership is the listing. This is key" (2), and the
Smoobu guest-data scare (phishing WhatsApps with real names, dates and apartment, reported by
several hosts and by a guest in r/Scams). Hosts are also building their own direct-booking sites
with ChatGPT and Claude (4, 3, 2) and embedding a PMS widget. Fair-code has to be sold through
those outcomes: your data in your database, your booking site on your domain, an API that is not
rate-limited, nothing you cannot export.

## 5. Where OTAbridge already answers this

- No onboarding fee, no commission on direct bookings, no payment surcharge, month to month. This
  answers complaint 2 directly and is the first thing to say.
- Local state is authoritative, the mirror is verified, sync health is a page. This answers
  complaints 3 and 5 if the import shows what it will write before it writes.
- Owner statements, portal and payouts are native. Only Guesty offers them to this crowd, badly.
- The cleaner app is a PWA; email and SMS to a cleaner without an app is the small step left.
- The guest guide feeding replies matches the one thing a leaving Hospitable customer would keep.

## 6. What to add, in order

1. **Import preview with a diff** before anything is written to a channel, and a side-by-side mode
   where the old PMS keeps running (spec 05, onboarding). This is the single most-told horror story.
2. **Per-channel markup** on top of the local rate, shown on the calendar popover as "Airbnb shows
   €154 incl. their fee". Airbnb's fee change made this urgent in October 2026.
3. **Payment schedule that recomputes on every edit**, with the diff shown on the reservation
   (spec 08, payment rules).
4. **Owner payouts to separate accounts with failure alerts** on Today (spec 11).
5. **Combinable units** in the room-type model (spec 04). Beds24-level, nobody else does it.
6. **Per-channel blocks** and per-channel restrictions, surfaced in the calendar panel's "Apply to".
7. **Sub-accounts and roles** that scale down to one volunteer (spec 13).
8. **Booking extension** from the reservation page for direct stays, and a change request for OTA
   stays (spec 07).
9. **Alloggiati and ISTAT exports** next to SEF (spec 10, check-in). It sells single apartments in
   Italy, where Rome4Guest is.
10. **Human support promise** on the first-run board: a named person, a reply within a day, during
    the trial. Guesty, Hospitable and Hostaway all lose customers here.

Items 1, 2, 3 and 10 are console design changes that belong on the canvas before code. Items 4 to 9
are schema and core work.

## 7. Competitor summary from this sample

| Product    | Praised for                                                                                     | Resented for                                                                                                                                                              |
| ---------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Guesty     | Implementation person, Lite is "great and cheap" for 3 units, multi-channel reach               | Support (days), weekly bugs at 50 units, £1 rate bug, payments not following edits, owner payout failures, rate-limited API, ugly booking site, non-refund, "beta tester" |
| Hostaway   | Real-time sync "saves me close to an hour a day", one dashboard                                 | 1.8% direct-booking fee, no phone support, Vrbo onboarding took 2 months, migration corrupted listings, weeks to learn, calendar zoom                                     |
| Hospitable | Easy for 1-5 units, integrations work, AI reads the house manual, cleaner alerts without an app | Slow app, AI-only support, queue of 196, ghost properties, currency pricing bugs, no sub-accounts, weak booking site                                                      |
| Lodgify    | Booking website, "built for smaller hosts"                                                      | Vrbo sync, cross-mapped units, year contract, per-booking fee, weak mobile, insurance upsell, astroturf reputation                                                        |
| Smoobu     | "generally happy", lightweight for 1-5                                                          | Suspected guest-data leak, no Expedia messaging after 3 years, no Google VR, cannot override Airbnb once connected                                                        |
| OwnerRez   | Flexible payments, cheap API, "zero issues after the learning curve"                            | No per-channel block, off-site ID form scares guests, lock integrations cost extra                                                                                        |
| Hostex     | 5 to 6 USD per property, instant sync, responsive chat, multi-unit configs                      | "may not be as polished visually"                                                                                                                                         |
| Uplisting  | Good value, responsive helpdesk                                                                 | Vrbo, "Complete disaster" (one host)                                                                                                                                      |

Sources: Reddit threads in r/ShortTermRentals, r/airbnb_hosts, r/AirBnBHosts, r/hostaway_official,
r/smoobu, r/vrbohosts, r/PropertyManagement, r/askhotels, r/ownerrez, r/LocationCourteDureeFR and
others, 2025-11 to 2026-11; X search results 2025-01 to 2026-11. Scraped with Apify actors
harshmaur/reddit-scraper and kaitoeasyapi/twitter-x-data-tweet-scraper.
