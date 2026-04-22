# syntax=docker/dockerfile:1.7

# ---- Builder ----
FROM node:20-alpine AS builder
WORKDIR /repo

RUN corepack enable && corepack prepare pnpm@9 --activate

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY packages/game-core/package.json ./packages/game-core/
COPY packages/server/package.json ./packages/server/

RUN pnpm install --frozen-lockfile --filter @hockey/server... --filter @hockey/game-core

COPY packages/game-core ./packages/game-core
COPY packages/server ./packages/server

RUN pnpm --filter @hockey/game-core exec tsc --build --force
RUN pnpm --filter @hockey/server exec tsc --build --force

# ---- Runner ----
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN corepack enable && corepack prepare pnpm@9 --activate

COPY --from=builder /repo/pnpm-workspace.yaml /repo/package.json /repo/pnpm-lock.yaml ./
COPY --from=builder /repo/packages/game-core/package.json ./packages/game-core/
COPY --from=builder /repo/packages/game-core/dist ./packages/game-core/dist
COPY --from=builder /repo/packages/server/package.json ./packages/server/
COPY --from=builder /repo/packages/server/dist ./packages/server/dist
COPY --from=builder /repo/packages/server/db ./packages/server/db

RUN pnpm install --prod --frozen-lockfile --filter @hockey/server... --filter @hockey/game-core

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1:3000/health || exit 1

CMD ["node", "packages/server/dist/index.js"]
