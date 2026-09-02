# Slack notifications (reference plugin)

Posts one line per booking change, alert or sent statement to a Slack incoming webhook. It
forwards references and amounts only, never guest names or message bodies. Apache-2.0.

```sh
PLUGIN_SECRET=<secret shown at install> SLACK_WEBHOOK_URL=https://hooks.slack.com/services/… node plugins/slack-notify/server.mjs
```

Install it in the console under Settings → Plugins with the endpoint `http://<host>:8792/`.
