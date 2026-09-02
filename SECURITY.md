# Security Policy

Channex PMS handles guest personal data, payment references and access codes for real properties.
We treat security reports as the highest-priority work in the project.

## Reporting a vulnerability

**Please do not open a public issue for security problems.**

Use GitHub's private vulnerability reporting:
[Report a vulnerability](https://github.com/henihaddad/channex-pms/security/advisories/new).
It reaches the maintainers only.

Include what you can of:

- affected component (web app, worker, booking engine, a package) and version or commit
- steps to reproduce, or a proof of concept
- impact as you understand it (data exposure, privilege escalation, availability)

## What to expect

| Step | Target |
|---|---|
| Acknowledgement | within 3 business days |
| Triage and severity | within 7 days |
| Fix for critical or high severity | within 30 days, sooner where possible |
| Public advisory and credit | after the fix ships, with your agreement |

We will keep you informed while the report is open and credit you in the advisory unless you prefer
otherwise.

## Scope

In scope: everything in this repository, the published container images and the hosted service.

Out of scope: vulnerabilities in [Channex.io](https://channex.io) itself (report those to Channex),
third-party OTAs, and denial-of-service findings that need volumetric attacks.

## Supported versions

While the project is pre-1.0, only the latest release and `main` receive security fixes. From 1.0
onward this table will list the supported release lines.

## Safe harbour

Good-faith research that follows this policy, avoids privacy violations and service degradation, and
gives us reasonable time to fix before disclosure will not lead to legal action from the project.
