# Multi-target image: migrate (one-shot), web (Next.js), worker (BullMQ). Built from the monorepo root.
FROM node:22-slim AS base
RUN corepack enable && corepack prepare pnpm@10 --activate
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages
COPY scripts ./scripts
COPY tsconfig.scripts.json ./
RUN pnpm install --frozen-lockfile
RUN pnpm turbo run build --filter=@pms/web... --filter=@pms/worker...

FROM base AS migrate
CMD ["pnpm", "--filter", "@pms/db", "db:migrate"]

FROM base AS web
ENV NODE_ENV=production
EXPOSE 3000
CMD ["pnpm", "--filter", "@pms/web", "start"]

FROM base AS worker
ENV NODE_ENV=production
CMD ["node", "apps/worker/dist/index.js"]
