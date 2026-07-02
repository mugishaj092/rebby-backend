# Local Setup

## 1. Start PostgreSQL

Use Docker Compose to run a local PostgreSQL 16 instance:

```bash
docker compose up -d
```

This starts Postgres on `localhost:5432` (user `postgres`, password `postgres`, database `reby`), persisted in the named volume `reby_postgres_data`.

If you already have a PostgreSQL server running locally (any recent major version), you can skip Docker and point `DATABASE_URL` at that instance instead — just make sure the target database exists (`createdb reby`).

## 2. Configure environment

Copy `.env.example` to `.env` and set `DATABASE_URL` to match your Postgres instance, e.g.:

```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/reby
```

## 3. Run migrations

```bash
npx prisma generate
npx prisma migrate dev
```

This applies all migrations in `prisma/migrations` and regenerates the Prisma Client into `src/generated/prisma`. Running it again with no pending schema changes reports the database as already in sync.

## 4. Start the app

```bash
npm run dev
```

`GET /health` should respond `{ "success": true, "data": { "status": "ok" } }`.
