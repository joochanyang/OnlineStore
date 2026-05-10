# CI Checks

Run these commands on every pull request or deployment candidate:

```bash
npm ci
npm run prisma:generate
npm run lint
npm run typecheck
npm run test
npm run build
```

When a database is available, also run:

```bash
npm run prisma:migrate
psql "$DATABASE_URL" -f packages/db/prisma/seed.sql
```

Manual browser smoke coverage is documented in `docs/operations/e2e-smoke.md`.
