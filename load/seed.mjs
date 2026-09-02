// Seeds a load-test tenant through the test hooks (PMS_TEST_HOOKS=1): sign up, 200 listings, one property with a webhook token.
const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const stamp = Date.now().toString(36);
const email = `load-${stamp}@example.com`;
const password = "correct horse battery staple";
const j = (r) => r.json();
const signup = await fetch(`${BASE}/api/v1/auth/signup`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    name: "Load",
    email,
    password,
    orgName: "Load Co",
    slug: `load-${stamp}`,
    country: "PT",
    currency: "EUR",
  }),
}).then(j);
const orgId = signup.orgId ?? signup.org?.id;
await fetch(`${BASE}/api/v1/test/seed-portfolio`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ orgId, count: 200, days: 120 }),
});
const prop = await fetch(`${BASE}/api/v1/test/property`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ orgId }),
}).then(j);
console.log(
  JSON.stringify({ email, password, orgId, propertyId: prop.propertyId, token: prop.token }),
);
