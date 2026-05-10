# Database Runbook

## Environment

Set `DATABASE_URL` to a PostgreSQL connection string before running migration commands.

```bash
export DATABASE_URL="postgresql://user:password@localhost:5432/commerce"
```

## Generate Client

```bash
npm run prisma:generate
```

## Create Or Apply Migrations

```bash
npm run prisma:migrate
```

## Seed Baseline Data

The checked-in seed is SQL-only so it can run in any PostgreSQL console or CI job after migrations.

```bash
psql "$DATABASE_URL" -f packages/db/prisma/seed.sql
```

Seed data creates:

- active product catalog with SKU variants
- category links
- one seed customer for checkout API testing
- one owner admin user for admin API testing

## Pre-Migration Backup

```bash
pg_dump "$DATABASE_URL" > backups/pre_migration_$(date +%Y%m%d_%H%M%S).sql
```
