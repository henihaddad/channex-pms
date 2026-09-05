# Console UX audit, September 2026

Method: heuristic evaluation with Krug's laws and Nielsen's ten heuristics (the `ux-heuristics`
skill) plus a navigation review with the `information-architecture` skill. Walked as a property
manager on a fresh organisation: sign up, create a property, wait for it to go live, connect
Airbnb. Severity 0 to 4 per the skill's scale; the score starts at 10 and loses about 2 per
failed diagnostic row with a major issue, 1 per minor one.

## Score

|                              | Before                                                                    | After this pass |
| ---------------------------- | ------------------------------------------------------------------------- | --------------- |
| Quick diagnostic rows failed | 6 of 10                                                                   | 1 of 10         |
| Highest severity             | 4 (task blocked: property stuck in "syncing", raw JSON on Connect Airbnb) | 2               |
| Score                        | **3 / 10**                                                                | **8 / 10**      |

The remaining row is "help and documentation": there is no in-product help beyond hints. It is
scheduled, not done.

## Findings and what changed

| #   | Finding                                                                                                                                                                                                                                   | Heuristic                                     | Sev. | Change                                                                                                                                                                                                                                                                                                             |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Sidebar listed 20 destinations in four groups; the daily ones and the rare ones had equal weight. Trunk test failed on "what are the major sections".                                                                                     | Krug 4, Nielsen 8, IA depth vs breadth        | 3    | Seven primary destinations with icons and labels (Dashboard, Calendar, Reservations, Inbox, Operations, Properties, Channels). Everything else under "More", collapsed until opened or until the current page lives inside it. Settings and Sign out are utility navigation at the bottom.                         |
| 2   | Six settings pages were six sidebar entries.                                                                                                                                                                                              | IA: utility nav, one place per concept        | 2    | One "Settings" entry; a section with local tabs (Organization, Members, Billing, Plugins, Audit log, Support).                                                                                                                                                                                                     |
| 3   | No search anywhere in the shell; a manager looking for a guest had to know the Reservations filter bar.                                                                                                                                   | Quick diagnostic "can I find the search"      | 2    | Header search on every console page, searching guests and reservations.                                                                                                                                                                                                                                            |
| 4   | Detail pages had no path back up: a property, channel or reservation page showed only its title.                                                                                                                                          | Krug 4, Nielsen 6                             | 2    | Breadcrumbs on the property pages (more detail pages follow the same component).                                                                                                                                                                                                                                   |
| 5   | The first-run checklist was a thin line of five links with two steps ("Organization created", "Connectivity configured") that were always done, so the real next action was buried.                                                       | Nielsen 1 and 8, "is the main action obvious" | 3    | The dashboard opens with a Getting started card: three steps a manager actually does (add a property, property live, connect a channel), the current one with a single primary button. A compact progress link stays in the header.                                                                                |
| 6   | "Property live" had no step at all, and in production the "first rates pushed" step could never complete (its source table is never written by the hosted worker). Setup looked unfinished forever.                                       | Nielsen 1                                     | 3    | The steps are computed from what exists: a live property completes the live step.                                                                                                                                                                                                                                  |
| 7   | The property wizard asked for currency and time zone as free text, the price "in minor units, e.g. 12000 = 120.00", a template name on every creation, and nothing said what happens after "Create". Labels were English in every locale. | Krug 1 and 3, Nielsen 2 and 5                 | 3    | Three numbered sections: what you list, name and place, prices. Country, time zone and currency are selects with the organisation's defaults. Price is typed per night in the property's currency. Templates and groups sit behind "Advanced". One line says what happens next. Translated into French and Arabic. |
| 8   | The property page led with a row of provisioning step codes, Channex ids and cell counts; the state was the raw enum ("syncing"); "Force resync" had no explanation.                                                                      | Nielsen 1, 2, 8                               | 3    | The page leads with the state in words and a "What's next" note: what is happening, how long it takes, or the one thing to do (connect a channel). The page refreshes itself while setup runs. Identifiers and step codes moved behind "Technical details". "Retry setup" appears only while setup is unfinished.  |
| 9   | Derived rate plans were entered in basis points ("percent (bp)", 1000 = 10%) and amounts in minor units.                                                                                                                                  | Nielsen 2                                     | 2    | Percent and amount are typed as people say them; the domain still stores basis points and minor units.                                                                                                                                                                                                             |
| 10  | Channels page had three buttons of equal weight: Connect Airbnb, Connect via Channex, Connect.                                                                                                                                            | Nielsen 8, one primary action                 | 2    | Connect Airbnb is the primary action, Connect a channel the secondary; the embedded Channex screen is a link next to the health board.                                                                                                                                                                             |
| 11  | Clicking Connect Airbnb without a live property returned a JSON problem document.                                                                                                                                                         | Nielsen 9                                     | 4    | Redirects back to Channels with a plain explanation and a link to Properties (shipped earlier this week).                                                                                                                                                                                                          |
| 12  | A push that raced provisioning marked a whole year of calendar cells as permanently failed with no way back but a manual database fix.                                                                                                    | Nielsen 1 and 9, reliability                  | 4    | Fixed in the worker: a "not found property" rejection retries; force resync re-enters failed cells (shipped earlier this week).                                                                                                                                                                                    |

## Navigation model

```
Global (sidebar)         Local (inside the section)              Utility
──────────────────       ────────────────────────────            ───────────
Dashboard                                                        Settings
Calendar                                                           Organization · Members · Billing
Reservations             All · Unmapped · New                       · Plugins · Audit log · Support
Inbox                    Inbox · Templates · Automation · KPI     Sign out
Operations               Today · Blocks · Crews                  Operator console (operators only)
Properties               List · Import · New · one property
Channels                 Health board · Connect · one connection
More ▸
  Front desk
  Direct bookings
  Owners                 Owners · Expenses · Statements · Payouts
  Reports
  Reviews
  Alerts
  Maintenance
  Sync health
```

Labels come from the manager's vocabulary (Reservations, Channels, Owners), never from the
module names in the code. "Sync health" is the one label that names a system concept; it stays
because the alert it explains uses the same words.

## Still open

- **Help and documentation**: contextual "how do I" links from each section to the operate guide.
- **Section tabs everywhere**: Inbox, Operations and Owners still render their sub-links inline;
  they should adopt the same `SectionTabs` as Settings.
- **Undo** on bulk calendar changes exists (inverse operation); channel activation and mapping
  saves still rely on confirmation instead of undo.
- **Usability test** with two real managers on the sign-up-to-first-booking path, per the skill's
  $0 protocol, before the next round.
