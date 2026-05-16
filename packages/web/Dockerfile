# syntax=docker/dockerfile:1.7

# ---- Builder ----
FROM node:20-alpine AS builder
WORKDIR /repo

RUN corepack enable && corepack prepare pnpm@9 --activate

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY packages/game-core/package.json ./packages/game-core/
COPY packages/web/package.json ./packages/web/

RUN pnpm install --frozen-lockfile --filter @hockey/web... --filter @hockey/game-core

COPY packages/game-core ./packages/game-core
COPY packages/web ./packages/web

RUN pnpm --filter @hockey/game-core exec tsc --build --force

ARG VITE_TELEGRAM_BOT_USERNAME=""
ENV VITE_TELEGRAM_BOT_USERNAME=$VITE_TELEGRAM_BOT_USERNAME
ARG VITE_VK_APP_ID="54571497"
ENV VITE_VK_APP_ID=$VITE_VK_APP_ID
ARG APP_BUILD_SHA=""
ENV VITE_APP_BUILD_SHA=$APP_BUILD_SHA
RUN pnpm --filter @hockey/web build

# ---- Runner ----
FROM nginx:1.25-alpine AS runner
COPY packages/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /repo/packages/web/dist /usr/share/nginx/html

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1:8080/ || exit 1
