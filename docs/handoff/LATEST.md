# Latest Handoff

> **다음 세션 재개 단일 진실원**: 프로젝트 루트의 `PROGRESS.md` 를 먼저 읽으세요.
> 이 파일은 세션별 변경 이력 누적용입니다.


## Current State

- Initial monorepo scaffold from `plan.md` is complete and the first operational domain layer is in place.
- The project targets a Next.js TypeScript commerce platform with shared domain packages and a later Expo app.
- Prisma schema uses the current Prisma 7 `prisma-client` generator shape with an explicit output path.
- Product, category, image, inventory reservation, order payment/shipment, admin user, and supplier candidate models are represented in Prisma.
- Shared core domain packages now cover product validation, SKU normalization, safety stock, batch stock reservations, reorder candidates, order draft totals, status transitions, and admin role permissions.
- API contract packages include product summaries, checkout request/preview envelopes, normalized list queries, and versioned API path helpers.
- `@commerce/db` now exposes a Prisma 7 client factory plus repository-style helpers for catalog products, checkout variants, admin dashboard data, admin session lookup, and product status updates.
- Web API routes now expose `GET /api/v1/products` and `POST /api/v1/checkout/preview`.
- Admin API routes now expose `GET /api/v1/dashboard` and `PATCH /api/v1/products/[id]/status`, with the mutation route enforcing `product:write`.
- Web and admin home pages now load through the shared DB data access layer instead of inline demo constants. Without `DATABASE_URL`, they use seed fallback data so local build/dev stays available.
- Mobile has `eas.json` plus a `build:native` EAS command; the monorepo `build` validates Expo config without requiring native credentials.
- SEO helpers now generate canonical metadata, sitemap entries, robots.txt content, Product JSON-LD, and Breadcrumb JSON-LD with tests.
- Notification helpers now cover channel consent checks, template rendering, idempotent job creation/deduping, mock providers, and provider fallback with tests.
- Operations helpers now cover coupon application/duplicate-use checks, point ledger earn/spend, review purchase gating/moderation, CS inquiry transitions, audit trails, and report aggregation with tests.
- Supplier integration helpers now validate connector configuration, create import batches, map raw supplier items to reviewable candidates, and normalize supplier candidates into internal product drafts with tests.
- Payment domain now covers intent creation, terminal transition guards, and a mock provider.
- Web checkout now has both preview and order creation API boundaries. Order creation validates SKU stock, persists orders through the DB layer when `DATABASE_URL` is present, and creates a mock payment intent.
- Web home now includes catalog SKU detail, cart preview entry point, and checkout order workflow notes.
- Admin home now includes inventory table, product status mutation form, order workflow states, and customer/role boundary sections.
- Admin home now includes a Cafe24-style workspace map for catalog, inventory, orders, customers, promotions, suppliers, CS, and reports based on role permissions.
- Web home now includes a customer shopping journey map covering browse, account, cart, checkout, fulfillment, and support ownership boundaries.
- Admin now has a local cookie-backed operator login/logout flow and protected dashboard/product status APIs.
- Web checkout now has a client-side cart builder that calls the existing preview and order creation APIs.
- `@commerce/core/auth` now maps admin roles to commerce workspaces and exposes the customer shopping steps used by the storefront.
- Mobile home now shows product, login, and push readiness checkpoints tied to the shared API contract.
- Database and app-store runbooks were added under `docs/operations/`.
- Product search/filter/sort, wishlist/recent views, tracking URL generation, refund state transitions, consent records, and CI check documentation are now covered.
- Automated E2E smoke coverage is now available through `npm run smoke:e2e`; it starts local web/admin dev servers when needed and checks catalog browsing, checkout preview/order creation, admin login, admin dashboard, and product status mutation.
- Admin product registration is now wired end-to-end with `POST /api/v1/products`, shared product validation, Prisma-backed product/category/image/variant creation when `DATABASE_URL` is present, fallback preview creation without a database, and an admin catalog create form.
- Web app runs on `http://localhost:3000`.
- Admin app runs on `http://localhost:3001`.

## Verification

- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm run test`: passed.
- `npm run prisma:generate`: passed.
- `npm run build`: passed.
- `npm run smoke:e2e`: passed.
- Product registration smoke coverage now includes the admin create API.
- Added package-level regression coverage for `@commerce/integrations`, `@commerce/notifications`, `@commerce/ops`, and `@commerce/seo`.
- Local HTTP checks for web and admin returned `200 OK`.
- `npm audit --audit-level=moderate` still reports 8 moderate findings through Prisma/Next/Expo transitive dependencies; no forced audit fix was applied because npm reports breaking downgrades.

## Phase 1 Progress (2026-05-10)

Backend Phase 1 (security & auth foundation) — initial slice landed:

- `docs/plan-v2-backend.md` written: Toss Payments + Supabase + Cloudflare R2 + Upstash + Meilisearch + Solapi + AI routing.
- Prisma schema extended (backwards-compatible): `Customer` and `AdminUser` got auth fields (passwordHash, MFA, dormant). New models: `RefreshToken`, `EmailVerification`, `PasswordReset`, `ConsentRecord`, `AuditLog`. New enums: `AuthProvider`, `ActorType`, `ConsentType`, `ConsentSource`.
- New package `@commerce/security`: CSRF (HMAC double-submit), security headers (CSP/HSTS/Permissions-Policy + Toss/Supabase/R2 allowlist), rate limiter (in-memory + Upstash REST via fetch only).
- New package `@commerce/auth`: Argon2id password hashing + policy, JWT (HS256 via `jose`), self-contained RFC 6238 TOTP (no extra deps), refresh-token rotation with reuse detection.
- New package `@commerce/config`: Zod-validated env schema covering Supabase, Toss, R2, Upstash, Meilisearch, Resend, Solapi/SENS, Expo/FCM/APNs, Anthropic/OpenAI/Gemini, Sentry/PostHog/Inngest. `assertProductionEnv` enforces critical keys when `NODE_ENV=production`.
- `.env.example` rewritten to match the new schema.
- `tsconfig.base.json` paths registered for `@commerce/auth`, `@commerce/security`, `@commerce/config`.
- 40 new unit tests added across the three packages; all 13 workspace builds + tests + lint pass.

## Phase 1 Routes Slice (2026-05-10)

Auth wiring landed end-to-end:

- `@commerce/db` extended with auth/audit helpers: `findAdminByEmail/ById`, `findCustomerByEmail/ById`, `createCustomerWithConsents`, refresh-token CRUD (`storeRefreshToken`, `findRefreshTokenByHash`, `markRefreshTokenReplaced`, `revokeRefreshTokenById`, `revokeRefreshTokenFamily`), `insertAuditLog`. AsyncLocalStorage-based `withAuditContext`/`getAuditActor`/`requireAuditActor` lets routes wrap a request and have `insertAuditLog` pick up actor identity automatically.
- `@commerce/auth/server` (new): cookie helpers (`buildAccessCookie` Lax+HttpOnly+Secure, `buildRefreshCookie` Strict+HttpOnly, `buildSessionIdCookie`, `buildClearAuthCookies`), `readAccessToken`/`readRefreshToken`, `authenticateAccessToken` (JWT verify), `rotateRefreshToken` (handles rotation + reuse-detection-burns-family). `clientIpFromRequest` honors `cf-connecting-ip` → `x-real-ip` → `x-forwarded-for`.
- Admin auth routes (replace existing): `POST /api/v1/auth/login` (JSON + form-encoded → 303 redirect), `POST /api/v1/auth/logout`, `POST /api/v1/auth/refresh`, `GET /api/v1/auth/me`. Login enforces password verify (Argon2id), MFA when `mfaEnabledAt` is set, and writes `admin.login`/`admin.logout`/`admin.permission_denied` audit rows.
- Customer auth routes (new on web): `POST /api/v1/auth/signup` (TERMS + PRIVACY consent required, password policy enforced), `POST /api/v1/auth/login`, `POST /api/v1/auth/logout`, `POST /api/v1/auth/refresh`, `GET /api/v1/auth/me`.
- `apps/admin/app/lib/admin-session.ts` deleted. `resolveAdminContext(request, { permission, requireCsrf })` is the single entry point; `getServerAdminSession()` powers server pages. All existing protected routes (dashboard, products list/create, products/:id/status) migrated. `ADMIN_DEV_ACTOR_ID` fallback removed.
- Login page rewritten for email + password + optional MFA token; error states surfaced via `?error=...` query.
- Test counts (75 passing across 13 packages): security 12, auth 37 (incl. cookies/access-token-verify/refresh-rotation/CSRF), config 5, core 16, ops 6, integrations 2, db 2, notifications 2, seo 1, admin 1, web 1.

## Next Actions

Phase 1 close-out:
- Real-DB integration tests (forged cookie 401, replayed refresh → family burn, permission missing 403 + audit row, login → mutate → logout end-to-end). Requires a Postgres test DB; will land alongside Phase 2 DB infra.
- Email verification + password reset flows (separate sub-slice).
- OAuth callbacks (Kakao/Naver/Google/Apple) using Auth.js v5 + Supabase Auth.
- Admin MFA setup/verify endpoints (TOTP enroll, recovery codes).

Then Phase 2: cart persistence (Cart/CartItem models + guest→member merge), Toss Payments live adapter (createIntent/confirm/cancel/refund + webhook with HMAC verification + idempotency-key uniqueness), partial fulfillment/refund, and customer order history APIs.
