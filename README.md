# Syndicate Miner ⛏️

**Telegram Mini App** — симулятор виртуального майнинга с реальными выплатами в TON.

Игрок строит ферму из GPU и ASIC, управляет износом оборудования, торгует на P2P-маркетплейсе и получает долю от глобального пула наград пропорционально своей вычислительной мощности.

## Структура монорепозитория

```
/
├── backend/      # Node.js 20 + TypeScript + Fastify + PostgreSQL + Redis
├── frontend/     # React 18 + TypeScript + Vite + Telegram Web App SDK
└── contracts/    # TON Smart Contracts (Tact + Blueprint)
```

## Быстрый старт (Backend)

```bash
# 1. Запустить PostgreSQL и Redis локально
docker run -d --name pg    -e POSTGRES_PASSWORD=secret -p 5432:5432 postgres:15
docker run -d --name redis -p 6379:6379 redis:7
docker exec -it pg psql -U postgres -c "CREATE DATABASE ton_miner;"

# 2. Установить зависимости и настроить окружение
cd backend
npm install
cp .env.example .env    # заполни BOT_TOKEN и DATABASE_URL

# 3. Применить миграции и seed
npm run migrate
npm run seed

# 4. Запустить dev-сервер
npm run dev             # http://localhost:3000
```

## Фазы разработки

| Фаза | Описание | Статус |
|------|----------|--------|
| 0 | Архитектура и решения | ✅ Закрыта |
| 1 | Backend Core Engine | ✅ Закрыта |
| 2 | Smart Contracts (Tact + Blueprint) | 🔄 В работе |
| 3 | Frontend TMA (React + Telegram SDK) | ⬜ |
| 4 | Тестирование экономики | ⬜ |
| 5 | Soft Launch | ⬜ |

## Стек

- **Backend:** Node.js 20 · TypeScript · Fastify · PostgreSQL · Redis · node-cron
- **Frontend:** React 18 · TypeScript · Vite · @twa-dev/sdk · TON Connect 2.0
- **Contracts:** Tact · TON Blueprint
- **Инфра:** Supabase (DB) · Railway (Backend) · Vercel (Frontend)

## Документация

- [`CLAUDE.md`](CLAUDE.md) — полное руководство по архитектуре
- [`PLAN.md`](PLAN.md) — план разработки с чеклистами
