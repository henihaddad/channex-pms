# What hosts praise and resent in the competition, September 2026

Method: review sites (Capterra, G2, GetApp), 2026 comparison posts and host-community writing on
Guesty, Hostaway, Hospitable, Lodgify, Smoobu, Uplisting and OwnerRez, read for recurring praise and
recurring complaints rather than feature checklists. Framed with the competitive-analysis method of
the `lenny-skills` collection: the status quo is a competitor too, threats are features,
distribution or business model, and the response must build on what we hold that others cannot.

## The status quo we compete with

Most hosts under ten units run on Airbnb's own tools plus a spreadsheet. The B2B pattern holds
here: the usual outcome of an evaluation is "no decision", not a competitor. Every migration guide
puts moving active listings into a PMS at 40 to 60 operator hours, and Guesty and Hostaway charge
500 to 4,000 dollars of onboarding to do it for you. Time to first synced calendar is the number
that decides whether a trial becomes a customer.

## What people praise, by competitor

| Competitor     | Praised for                                                                                                                                                                         | Resented for                                                                                                                                                               |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Guesty**     | Everything in one place: channels, inbox, automation, native accounting, structured onboarding with a specialist. Widest channel reach (60+ direct).                                | Unpredictable hybrid pricing, 1,500 to 4,000 dollar onboarding, sales overpromising, patchwork of acquired products, slow support, automation rules that confuse.          |
| **Hostaway**   | 24/7 phone support with a 97% satisfaction score, strong AI reply engine, solid channel sync.                                                                                       | No published prices, 2 to 4 weeks of setup, commission on the "free" booking engine, billing after cancellation, third-party logins for pricing, screening and accounting. |
| **Hospitable** | The unified inbox "pays for the subscription on its own". AI answers routine questions in the host's tone. Review requests and host reviews drafted automatically. Support praised. | Only five channels, nothing native for money or owners; hosts outgrow it.                                                                                                  |
| **Smoobu**     | Simplicity, predictable 15 to 45 euro flat tiers, 14-day trial, a calendar that makes double bookings obvious.                                                                      | Thin on operations and owners.                                                                                                                                             |
| **Lodgify**    | Direct-booking website builder.                                                                                                                                                     | 1.9% commission on lower tiers, felt as hidden.                                                                                                                            |
| **Uplisting**  | Rock-solid multi-calendar, bulk editing, flat per-listing price with no commission, support that replies within the hour.                                                           | 100 dollar entry price, weak mobile app, limited accounting and reporting.                                                                                                 |
| **OwnerRez**   | Reliability, QuickBooks sync rated 4.9, responsive support, flexible per-unit pricing.                                                                                              | Complex to set up; owner statement formats "not very robust".                                                                                                              |

Across all of them the same five things decide sentiment: predictable pricing without hidden
commissions or onboarding fees; support that answers fast; a calendar that never double-books;
an inbox that removes repetitive typing; and how much of the day-to-day happens inside one
product rather than across third-party logins.

## Where OTAbridge already stands

- **Business model.** Per-unit pricing published on the site, no onboarding fee, no commission
  on direct bookings, fourteen days free without a card, self-hosting for free. This is the exact
  inverse of the Guesty and Hostaway complaints and must be said loudly, not left for the FAQ.
- **One product.** Owner statements, payouts, folios, invoices, turnover tasks, cleaner app and
  the booking engine are native. Hostaway and Hospitable route all of that to third parties.
- **Sync you can see.** Every calendar cell carries its state, drift is detected nightly, and
  the sync health page shows it. Uplisting's most praised trait is ours to prove.
- **Fair-code.** No competitor can be self-hosted or read. For managers who care about owning
  their data, this is the asymmetric advantage nobody in the table can copy.

## Gaps, ordered by how often the market rewards them

1. **Import from Airbnb.** Hostfully and Zeevou win migrations by importing listings with
   photos, descriptions, amenities and prices. Channex exposes exactly that for a connected host
   (listing details and the listing calendar). Building it turns our worst step, "add each
   property by hand, then map", into "connect Airbnb, tick your listings, done".
2. **Say the pricing promise on the product, not only the site.** No onboarding fee, no
   commission, cancel any time, export everything: the four things hosts check first.
3. **Help that answers.** Hostaway's phone line and Hospitable's support are the praised
   feature. We cannot staff a phone line; we can put a help entry in the console header that
   opens the operating guide and the support page, and answer within a day.
4. **Guest guide.** A per-property guide (Wi-Fi, check-in, house rules, parking, local tips)
   shown in the guest portal and usable as template variables removes the repetitive questions
   Hospitable's AI is praised for answering. Ours can start without an AI: the guide is the
   answer.
5. **Suggested replies.** After the guide exists, drafting a reply from the guide and the
   booking's facts is the next step; an AI provider behind a port, with a fake for self-hosters.
6. **Dynamic pricing connector.** PriceLabs and Wheelhouse are the integrations hosts ask for
   most. A rate-import port is a small piece of work once the Airbnb calendar import exists.
7. **Mobile.** Every competitor's weakest reviews mention the mobile app. The cleaner app is a
   PWA already; the console is not designed for phones. Not for this round.

Items 1 to 3 are implemented in this round. Items 4 to 7 go to the roadmap after v1.0.

## Sources

- Capterra and G2 review pages for Guesty, Hostaway, Hospitable, Uplisting, OwnerRez, Smoobu
  and Lodgify (2026).
- Guesty, "Guesty vs Hostaway vs Hospitable" (2026); Hostaway, "Guesty alternatives";
  rakidzich.com, "Hostaway vs Guesty vs OwnerRez, 2026 pick for 5 to 50 units".
- thehoststack.com and hostersparadise.com reviews of Hospitable, Hostaway and Uplisting (2026).
- conduit.ai, "Lodgify vs Smoobu" and "Best PMS for Airbnb" (2026); boringhost.ai automation
  playbook (2026).
- Zeevou and Hostfully migration guides; RNS, "How to switch vacation rental PMS software".

---

# Addendum: a walk through Guesty Lite, September 2026

Twenty-three screens of a trial account, captured by the operator and read here. The account had
no listings connected, so most screens are their empty states, which is exactly the view a new
customer gets and the fairest comparison with our own first run.

## Their navigation

Ten items, in this order: Homepage, Inbox, Multi calendar, Properties overview, Reservations
report, PriceOptimizer, Operations (Tasks, Locks manager), Financials (Payment processing, Income
report, Payments automations, Analytics), Channels (Airbnb, Vrbo, Booking.com, Google vacation
rentals, Booking website), Integrations (Add-ons, Marketplace), Account (Settings, Company info,
User management, Billing). Sub-items expand in place under the parent, one level deep.

Ours is seven primary plus More plus Settings. Theirs is flatter at the top and deeper inside;
after the UX pass we are close, with two differences worth taking: **Financials as its own
section** (we scatter folios, invoices and payouts across reservations and owners) and
**everything about one channel under that channel's own page**.

## What they do that we should copy

| What                                                                                                                                                                                                                                                                                                                                    | Where it shows                                                                         | Our position                                                                                                                                                                                                        |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Onboarding as a scored programme.** Three named tracks ("Set up your channels", "Optimize business and increase revenue", "Automate tasks to save time"), twelve steps, a progress bar reading 1/12, each step with an expected duration ("About 1 minute") and its own primary button. Steps beyond the current track are padlocked. | Homepage, and a floating widget that follows you onto every other page                 | We have three steps and a header progress line. Theirs sets expectations per step and keeps the guide reachable everywhere. **Take: the per-step duration, the padlock on later tracks, and the follow-me widget.** |
| **"Book 1:1 setup", "Watch tutorial", "Help Center" as three buttons in the guide**                                                                                                                                                                                                                                                     | Homepage header                                                                        | We have one Help link. **Take: a help menu with the guide, the operate doc and a way to reach a human.**                                                                                                            |
| **Empty states that sell the feature and give the one action that unlocks it.** Every unconnected page shows an illustration of the working feature, a sentence of value, and "Import Airbnb listings".                                                                                                                                 | Inbox, Multi calendar, Properties overview, Analytics, Tasks, PriceOptimizer, Channels | Ours say "No channels connected yet." **Take: illustration or preview, one sentence of value, one primary action, on every empty page.**                                                                            |
| **Properties overview as photo cards** with the channel logos published on each (Airbnb, Vrbo, Booking.com, direct) and a PUBLISHED badge.                                                                                                                                                                                              | Properties overview                                                                    | We show a table with a state chip. **Take: photo cards with per-channel badges, which the Airbnb import now makes possible since we hold the photos.**                                                              |
| **Payment automations as first-class objects**: a table of rules with Type (event-based), Advance notice, Length-of-stay, Properties, Channels, Amount. Default rule "Collect 100% at booking confirmation".                                                                                                                            | Financials → Payments automations                                                      | We have a guarantee policy per property and manual charges. **Take: named payment rules, the strongest gap on the money side.**                                                                                     |
| **A marketplace of integrations** (Turno for cleaners, Minut for noise, locks, insurance), each a card with a Connect button.                                                                                                                                                                                                           | Integrations → Marketplace                                                             | We have a plugin interface and two reference plugins, no directory. **Take later: a directory page listing what exists, honest about what is built.**                                                               |
| **Search in the header with a keyboard hint** ("Type / to search").                                                                                                                                                                                                                                                                     | Every page                                                                             | We added header search this week. **Take: the / shortcut and the hint.**                                                                                                                                            |

## What we already do better, and should say so

- **Owners.** Guesty Lite has no owner statements, no owner portal, no expenses, no payouts.
  Their Financials is payment processing, an income report and analytics. For a manager running
  properties for other people, this is our whole reason to exist.
- **Pricing honesty.** Their booking website is "Subscriber-only" with a padlock inside the
  product, and the trial counts down in the corner of every screen. Ours is in every plan.
- **Channels.** Their Lite tier is Airbnb-only, with Vrbo, Booking.com and Google padlocked.
  Ours is every channel Channex reaches, from the first plan.
- **Sync visibility.** They show no cell states, no drift, no sync health. Ours is a page.
- **Locks.** They sell a "Guesty locks manager"; we have a lock port with credentials issued
  and revoked per booking, in the base product.

## Ordered plan from this walk

1. Empty states with a preview, a sentence and one action, on Inbox, Calendar, Properties,
   Channels, Reports and Operations. Cheap, and it is the difference between a demo that sells
   and a page that looks broken.
2. Getting-started card with per-step durations and a widget that follows the user.
3. Properties overview as photo cards with per-channel badges.
4. Payment rules (collect X at booking, remainder N days before arrival, deposit hold).
5. Financials as its own console section, gathering folios, invoices, payments and payouts.
6. Integrations directory listing the plugin interface and what is built.
