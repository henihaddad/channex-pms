<!-- https://docs.channex.io/guides/channex-retention-periods.md -->
> For the complete documentation index, see [llms.txt](https://docs.channex.io/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://docs.channex.io/guides/channex-retention-periods.md).

# Channex Retention Periods

We describe our logic of how long we keep information in Channex

**Bookings**

* 3 months after checkout (Booking is removed)

**Credit Card**

* 7 Days after checkout (Remove Credit Card)
* 7 Days after cancellation (Remove Credit Card)
* if booking is acknowledged no CC provided via API

**Logs**

* 3 Months property log retention
* 3 Months Channel log retention
* 7 Days Webhook log retention

**Live Feed**

* 1 Month Retention

**Property**

* 90 Days of property without a channel, it is removed

**Channels**

* 1 Month in disabled state it is removed<br>
