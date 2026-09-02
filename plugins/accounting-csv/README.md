# Accounting CSV export (reference plugin)

Appends one CSV row per issued invoice, sent owner statement and captured payment, in the
bank-line shape Xero and QuickBooks import. Apache-2.0, no dependencies.

```sh
PLUGIN_SECRET=<secret shown at install> CSV_PATH=./accounting.csv node plugins/accounting-csv/server.mjs
```

Then in the console: Settings → Plugins → install with the endpoint `http://<host>:8791/` and the
manifest at `/manifest`. Every delivery is signed (`x-pms-signature`, `x-pms-timestamp`); the
server rejects bad or stale signatures (five-minute window). See `docs/plugins.md`.
