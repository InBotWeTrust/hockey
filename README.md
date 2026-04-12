# Ultimate Hockey

Мобильная хоккейная PWA-игра: тайминг-механика «поймай окно между вратарём и воротами», лестница боссов-вратарей, минимальная экипировка, соревновательный рейтинг.

## Структура

- `packages/game-core` — чистая TS-библиотека с детерминированным движком игры
- `packages/server` — Fastify бэкенд (Node.js 20)
- `packages/web` — React + Vite + PixiJS PWA клиент
- `docs/superpowers/specs` — дизайн-документы
- `docs/superpowers/plans` — имплементационные планы

## Быстрый старт

**Требования:** Node.js 20+, pnpm 9+, Docker.

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm --filter @hockey/game-core build
pnpm dev:server     # http://localhost:3000/health
pnpm dev:web        # http://localhost:5173
```

## Полный стек через Docker

```bash
cp .env.example .env
docker compose -f docker-compose.yml -f docker-compose.dev.yml build
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
curl http://localhost:3000/health
```

## Команды

| Команда | Описание |
|---|---|
| `pnpm build` | Сборка всех пакетов |
| `pnpm test` | Прогон тестов во всех пакетах |
| `pnpm typecheck` | TypeScript проверка типов |
| `pnpm lint` | ESLint |
| `pnpm format` | Prettier auto-fix |
| `pnpm dev:server` | Dev-сервер `server` (watch) |
| `pnpm dev:web` | Dev-сервер `web` (vite) |

## Деплой

Main ветка деплоится автоматически в GitHub Actions (`.github/workflows/deploy.yml` — будет добавлен в Task 11 после подготовки VPS).

## Документация

- [MVP Design Spec](docs/superpowers/specs/2026-04-12-ultimate-hockey-pwa-mvp-design.md) — полный дизайн-документ
- [Plan 1: Skeleton](docs/superpowers/plans/2026-04-12-01-skeleton.md) — скелет инфраструктуры
