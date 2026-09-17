# Channex documentation, vendored

A verbatim copy of https://docs.channex.io, one Markdown file per page, named
`<section>__<page>.md` (the URL path with `/` replaced by `__`). `_index.json` lists the pages
with their size; `_fetched.txt` is the UTC date of the copy.

Why it is in the repository: every Channex call in `packages/connectivity/src/channex/provider.ts`
is written from one of these pages and cites it in a `// docs: <page>` comment;
`scripts/check-channex-docs-refs.mjs` (part of `pnpm check`) fails when a call has no citation.
The audit in `docs/audits/2026-09-17-channex-request-audit.md` is the record of the last full
comparison. Agents and people working on the integration read the page here, not from memory.

Refresh: `node scripts/channex-docs-sync.mjs` (Channex serves each page as Markdown by appending
`.md` to its URL, and lists them in `llms.txt`); `--check` exits 1 when the copy is stale. Refresh
before touching a provider call, and commit the refreshed pages with the change that used them.

The content is Channex's, reproduced for development against their API; it is not covered by
this repository's licence.
