# Channex PMS website

The landing page, built with Next.js and Tailwind CSS, the same stack as
[neon.com](https://github.com/neondatabase/website).

```sh
npm install
npm run dev     # http://localhost:3000
npm run lint
npm run build
```

Copy lives in `src/components/*.tsx`; links in `src/lib/site.ts`. Keep the page honest about the
project status: it is a design-phase project and says so.

## Hosting

The site is a static export (`output: "export"`) served by Cloudflare Pages as the project
`otabridge`, reachable at https://otabridge.com and https://www.otabridge.com (DNS: proxied
CNAMEs to `otabridge.pages.dev`). Deploy by hand with

```sh
npm run build
npx wrangler@4 pages deploy out --project-name otabridge --branch main
```

using `CLOUDFLARE_API_TOKEN` (a token with Pages edit rights) and `CLOUDFLARE_ACCOUNT_ID`, or let
the `Website` workflow deploy on every push to `main` once those two repository secrets exist.
