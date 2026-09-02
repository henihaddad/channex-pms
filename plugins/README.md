# Reference plugins

Out-of-process plugins for Channex PMS (spec 12 §12.7, ADR-0004). Each is a single Node
script with no dependencies that receives signed event deliveries from the platform:

| Plugin                               | Events                                                       | Extension point   |
| ------------------------------------ | ------------------------------------------------------------ | ----------------- |
| [`accounting-csv`](./accounting-csv) | `invoice.issued`, `statement.sent`, `payment.captured`       | event subscriber  |
| [`slack-notify`](./slack-notify)     | `booking.revision_applied`, `alert.raised`, `statement.sent` | notification sink |

Verification helpers for other languages and runtimes live in `@channex-pms/sdk`
(`signPluginDelivery`, `verifyPluginDelivery`). These files are Apache-2.0 (LICENSE.md, "SDK,
plugin interfaces").
