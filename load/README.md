# Load and soak

k6 scenarios for the spec 13 §13.7 budgets, run against a build with `PMS_TEST_HOOKS=1` and a
seeded 200-property portfolio on the FakeProvider:

```sh
k6 run -e BASE_URL=http://localhost:3100 -e EMAIL=… -e PASSWORD=… -e ORG_ID=… load/k6/reads.js
k6 run -e BASE_URL=http://localhost:3100 -e WEBHOOK_TOKEN=… load/k6/webhooks.js
k6 run -e BASE_URL=http://localhost:3100 -e PROPERTY_ID=… load/k6/booking-engine.js
```

`.github/workflows/load.yml` runs them weekly and on demand with a 10-minute soak.
