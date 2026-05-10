# 어플웹 — Commerce Platform 진행 상태

> **재개 명령어**: `/clear` 후 `어플웹 Phase 2 Slice C 이어서 작업` 입력 → 이 파일 자동 로드 → 부분 출고/환불 + 주문 history 진입.
> **GitHub 원격**: https://github.com/joochanyang/OnlineStore.git (main 브랜치)

---

## 0. 프로젝트 개요

- **위치**: `/Users/mr.joo/Desktop/어플웹`
- **목적**: 카페24 수준의 한국형 풀스택 커머스 플랫폼 (의류/가방/악세사리 등 다카테고리)
- **구성**: Turborepo 모노레포 (Next.js 16 + React 19 + Expo + Prisma 7)
- **프론트엔드**: 별도 Claude Design 트랙에서 진행 — 본 작업 범위에서 제외
- **본 작업 범위**: 백엔드 + AI + SEO + 운영 기능 (production-grade)

### 확정 스택 (v2)

| 영역 | 선택 |
|---|---|
| PG | **Toss Payments** (단일, 어댑터 인터페이스 유지) |
| DB / pgvector / 고객 OAuth | **Supabase Pro** ($25/mo) |
| 관리자 Auth | Auth.js v5 + 자체 AdminUser + TOTP MFA |
| 이미지·CDN | Cloudflare R2 + Cloudflare Images |
| 캐시·큐 | Upstash Redis + BullMQ |
| 워크플로우 | Inngest |
| 검색 | Meilisearch (Hetzner VPS) |
| 이메일 | Resend |
| 알림톡/SMS | Solapi (1순위) + NHN Cloud SENS (fallback) |
| 푸시 | Expo Push + FCM/APNs |
| 관측성 | Sentry + PostHog |
| AI | Claude Haiku/Sonnet + Gemini Flash·Vision·Embedding + GPT-4o-mini (월 10만원) |

---

## 1. Phase 1 완료 (2026-05-10)

### 1.1 신규 패키지

- **`@commerce/security`** — CSRF (HMAC 더블서밋), 보안 헤더, Rate limit (memory + Upstash REST via fetch)
- **`@commerce/auth`** — Argon2id, JWT (jose), RFC 6238 TOTP 자체구현, refresh token rotation + reuse detection, server primitives (cookie + JWT verify + rotate orchestrator)
- **`@commerce/config`** — Zod 환경변수 스키마 (Toss/Supabase/R2/Upstash/Resend/Solapi/AI 등) + `assertProductionEnv` production 가드

### 1.2 Prisma 스키마 신규 모델 (하위호환)

- `Customer.passwordHash`, `authProvider`, `providerUserId`, `emailVerifiedAt`, `phoneVerifiedAt`, `mfaSecret`, `mfaEnabledAt`, `lastLoginAt`, `dormantAt`, `disabledAt`
- `AdminUser.passwordHash`, `mfaSecret`, `mfaEnabledAt`, `lastLoginAt`, `disabledAt`
- 신규 모델: `RefreshToken`, `EmailVerification`, `PasswordReset`, `ConsentRecord`, `AuditLog`
- 신규 enum: `AuthProvider`, `ActorType`, `ConsentType`, `ConsentSource`

### 1.3 Auth 라우트 (전부 새로 작성)

#### Admin (`apps/admin/app/api/v1/auth`)
- `POST /login` — JSON + form-encoded 동시 지원 (form 시 303 redirect), MFA 토큰 인라인 검증
- `POST /logout` — refresh token 무효화 + audit row, **CSRF 면제** (의도적, 표준 OWASP)
- `POST /refresh` — rotation + reuse 감지 시 family 전소각
- `GET /me` — 현재 세션 + 워크스페이스 권한

#### Customer (`apps/web/app/api/v1/auth`)
- `POST /signup` — TERMS+PRIVACY 동의 필수, Argon2id, ConsentRecord 동시 기록
- `POST /login`, `POST /logout`, `POST /refresh`, `GET /me`

### 1.4 Wrapper / 세션 헬퍼

- `resolveAdminContext(request, { permission?, requireCsrf? })` — JWT 검증 + DB lookup + permission check + CSRF + audit
- `resolveCustomerContext(request, { requireCsrf? })`
- `getServerAdminSession()` — 서버 컴포넌트(page.tsx)용, `cookies()` from `next/headers` 사용

### 1.5 DB 헬퍼 (`@commerce/db`)

- `findAdminByEmail/ById`, `findCustomerByEmail/ById`, `createCustomerWithConsents`
- `updateAdminLastLogin`, `updateCustomerLastLogin`
- Refresh token CRUD: `storeRefreshToken`, `findRefreshTokenByHash`, `markRefreshTokenReplaced`, `revokeRefreshTokenById`, `revokeRefreshTokenFamily`
- `insertAuditLog` (AsyncLocalStorage ambient actor 자동 흡수)
- `withAuditContext`, `getAuditActor`, `requireAuditActor`

### 1.6 폐기/마이그레이션

- ❌ `apps/admin/app/lib/admin-session.ts` 삭제
- ❌ `ADMIN_DEV_ACTOR_ID` 폴백 제거
- ❌ 평문 쿠키 actorId 신뢰 제거
- ✅ dashboard, products list/create, products/:id/status 라우트 → `resolveAdminContext`로 교체
- ✅ Login page → email + password + MFA 폼

### 1.7 검증 (2026-05-10 기준)

| 항목 | 결과 |
|---|---|
| Lint | ✅ 13/13 |
| Typecheck | ✅ 13/13 |
| Test | ✅ **75 passing** (security 12, auth 37, config 5, core 16, ops 6, integrations 2, db 2, notifications 2, seo 1, admin 1, web 1) |
| Build | ✅ 13/13 |

### 1.8 Phase 1 잔여 (Phase 2 본진과 병행 또는 후행)

1. 실제 Postgres 통합 테스트 (forged cookie 401, replayed refresh → family burn, permission miss 403 + audit row)
2. 이메일 인증 + 비밀번호 재설정 (Resend 연동)
3. OAuth 콜백 (카카오/네이버/구글/Apple) — Auth.js v5
4. 관리자 MFA setup/verify 엔드포인트 (TOTP enroll, recovery codes)

---

## 1.9 Phase 2 Slice A 완료 (2026-05-11)

### 1.9.1 신규 Prisma 모델 (총 6개 + 2 enum)

`packages/db/prisma/schema.prisma`:

- `Cart(id, customerId? @unique, anonymousToken? @unique, expiresAt, lastActivityAt)` — Customer는 1:1, 게스트는 anonymousToken
- `CartItem(cartId, variantId, quantity, addedAt)` — `@@unique([cartId, variantId])`, ProductVariant `onDelete: Restrict`
- `OrderLineFulfillment(orderLineId, shipmentId?, quantity, status, …)` — 부분 출고
- `OrderLineRefund(orderLineId, paymentRefundId, quantity, status, …)` — 부분 환불 라인 매핑
- `PaymentRefund(paymentId, externalRefundId @unique, amount, reason, status, requestedAt, completedAt?)` — 환불 ledger
- `WebhookEvent(provider, externalId, payload Json, signatureVerifiedAt?, processedAt?, error?, receivedAt)` — `@@unique([provider, externalId])` (idempotency)
- 신규 enum: `FulfillmentStatus { PENDING, SHIPPED, DELIVERED, CANCELLED }`, `RefundStatus { PENDING, COMPLETED, FAILED, CANCELLED }`
- `Payment.idempotencyKey String? @unique` 추가
- `Customer.cart`, `ProductVariant.cartItems`, `OrderLine.fulfillments/refunds`, `Shipment.fulfillments`, `Payment.refunds` 백릴레이션 추가

`prisma generate` 통과. **마이그레이션은 사용자 액션 필요** (DATABASE_URL 설정 후 `npm run prisma:migrate`).

### 1.9.2 신규 패키지 `@commerce/payments`

- `src/types.ts` — `PaymentProvider` 인터페이스 (createIntent / confirm / cancel / refund / verifyWebhookSignature) + 결제수단/상태 타입 + `PaymentError`
- `src/toss/signature.ts` — HMAC-SHA256 (timestamp + body) + 5분 윈도우 + nonce 재사용 차단 (`__resetSeenNoncesForTests` export)
- `src/toss/provider.ts` — `TossPaymentsProvider` 클래스. 모드별 분기: `mock`(인메모리 ledger, 외부 호출 0) / `sandbox` / `live`(Toss v2 REST: `/v1/payments`, `/v1/payments/confirm`, `/v1/payments/{key}/cancel`). idempotencyKey는 mock에서 인덱스로, live에서 `Idempotency-Key` 헤더로
- `src/factory.ts` — `createPaymentProvider(env)` → 환경변수 기반 인스턴스화
- exports: `.`, `./types`, `./toss`, `./toss/signature`, `./factory`

### 1.9.3 Webhook 라우트

`apps/web/app/api/v1/webhooks/payments/toss/route.ts`:

- POST 전용, `runtime = nodejs`, `dynamic = force-dynamic`
- 헤더: `x-tosspayments-signature`, `x-tosspayments-timestamp`, `x-tosspayments-nonce`
- raw body 보존 → `verifyWebhookSignature` → 거부 시 400/401/409 (이유별)
- 통과 시 `recordWebhookEvent` (P2002 catch → 중복 → 200 + `status: "duplicate"`) → 신규 row면 `markWebhookProcessed` 후 200 + `status: "accepted"`
- CSRF 면제 (서명이 인증 역할)
- DB 미연결 (no_database) 시에도 200 응답하지 않고 throw → 500 (운영에서 빠르게 감지)

### 1.9.4 DB 헬퍼

`packages/db/src/index.ts`:

- `recordWebhookEvent({ provider, externalId, payload, signatureVerifiedAt? })` → `{ inserted, event }` (P2002 → 기존 row 조회 후 inserted:false)
- `markWebhookProcessed(id, error?)`

### 1.9.5 검증 (2026-05-11)

| 항목 | 결과 |
|---|---|
| Lint | ✅ 14/14 |
| Typecheck | ✅ 14/14 |
| Test | ✅ **93 passing** (기존 75 + payments mock 6 + payments signature 7 + web webhook 5) |
| Build | ✅ 14/14 (web에 `ƒ /api/v1/webhooks/payments/toss` 등록) |

### 1.9.6 Slice A 잔여 (Slice B 진입 전 사용자 액션)

1. `.env` 작성 (Supabase DATABASE_URL + DIRECT_URL, AUTH_JWT_SECRET/CSRF_SECRET 64hex, TOSS_CLIENT_KEY/SECRET_KEY/WEBHOOK_SECRET, PAYMENT_MODE=sandbox)
2. `npm run prisma:migrate` (마이그레이션 이름: `phase2_slice_a_cart_refund_webhook`)
3. Toss 가맹점 콘솔에서 `/api/v1/webhooks/payments/toss` URL 등록 + 시크릿 발급

---

## 1.10 Phase 2 Slice B 완료 (2026-05-11)

### 1.10.1 신규 DB 헬퍼 (`packages/db/src/cart-repository.ts`)

- `getOrCreateCart(identity)` — 회원/게스트 식별자로 카트 조회 또는 생성. 반환: `CartView` (items + subtotal + 만료일)
- `addCartItem` — 동일 variantId 재추가 시 quantity 합산. 재고/활성 상태/최대 99개 제한 검증. CartError throw
- `updateCartItemQuantity` — quantity ≤ 0이면 자동 삭제로 위임
- `removeCartItem`
- `mergeCart({ anonymousToken, customerId })` — 게스트→회원 카트 병합. 동일 variant는 합산(stock/MAX_QTY 캡), 게스트 카트 삭제
- `expireOldCarts(now)` — `expiresAt < now` cascade 삭제
- `reserveCheckoutInventory({ cartId, items, ttlMs?, groupId? })` — 트랜잭션으로 variant당 활성 reservation 합산 후 stock 비교, 부족하면 INSUFFICIENT_STOCK throw, 통과 시 `InventoryReservation` 생성 (reason=`checkout:${groupId}`, expiresAt=10분 후)
- `releaseReservationGroup(groupId)` — group의 모든 reservation 삭제
- `createOrderFromReservation` — reservation 기반 Order/OrderLine 생성 (status=PENDING_PAYMENT). 재고 차감은 webhook에서
- `recordPaymentIntent` — `idempotencyKey` 기반 dedup. 같은 키 재호출 시 기존 Payment 반환, orderId 불일치 시 throw

### 1.10.2 카트 라우트 5종 (`apps/web/app/api/v1/me/cart/`)

- `GET /me/cart` — 게스트면 `cart_token` 쿠키 자동 발급 (HttpOnly, SameSite=Lax, 30일)
- `POST /me/cart/items` — variantId + quantity, CSRF 필수
- `PATCH /me/cart/items/[id]` — quantity 변경 (≤0이면 삭제)
- `DELETE /me/cart/items/[id]`
- `POST /me/cart/merge` — 인증 필수 (회원만), 게스트 토큰 기반 병합 후 cart_token 쿠키 만료

`apps/web/app/lib/cart-context.ts` — `resolveCartIdentity(request, { requireCsrf? })` 헬퍼: 회원이면 customer 컨텍스트, 아니면 cart_token 발급/재사용. CSRF는 회원 세션 기반 또는 `cart:<token>` sessionId 기반 검증

`apps/web/app/lib/cart-response.ts` — 응답 envelope (CartDto 프로젝션 + Set-Cookie 첨부 + CartError → HTTP status 매핑: 404/410/409/422/503)

### 1.10.3 체크아웃 재작성

- `POST /api/v1/checkout/preview` (재작성) — 카트 식별자만 받음. 재고 예약 후 `{ groupId, expiresAt, lines, subtotal, shippingFee, discount, total }` 반환. **PG 외부 호출 0건** (어댑터 unmount)
- `POST /api/v1/checkout/orders` (재작성) — `{ groupId, idempotencyKey, successUrl, failUrl, paymentMethod? }` 받음. 흐름: reservation → Order/OrderLine → Toss createIntent → Payment 저장(idempotencyKey unique). 같은 idempotencyKey로 재호출 시 기존 Payment 반환. 결제 provider 실패 시 reservation 즉시 release.

### 1.10.4 검증 (2026-05-11 새벽)

| 항목 | 결과 |
|---|---|
| Lint | ✅ 14/14 |
| Typecheck | ✅ 14/14 |
| Test | ✅ **119 passing** (Slice A 93 + Slice B: cart-repository 9, cart-routes 5, checkout-preview 2 = +16) |
| Build | ✅ 14/14, 신규 라우트 4개 + checkout 2개 + webhook 1개 web 빌드에 등록 |

### 1.10.5 Slice B 잔여 (Slice C 진입 전)

1. 사용자 액션: `.env` 작성 + `npm run prisma:migrate` (Slice A에서 동일)
2. 통합 테스트 (실제 Postgres + Toss sandbox): 동시 100건 주문 → 재고 음수 0 / Toss 실제 결제 완료 → webhook → reservation→stock 차감 / idempotencyKey 동일 호출 5회 → Payment 1건만 / Toss 실패 → reservation 즉시 해제
3. 가격 race condition 방어: `InventoryReservation`에 `unitPrice` 컬럼 추가 또는 lock-and-snapshot 패턴 (Phase 2.5 고려)

---

## 2. Phase 2 작업계획 (다음 슬라이스)

### 2.1 목표

운영 가능한 결제·주문·카트 파이프라인. **mock 결제 → Toss Payments live 연동**, **클라이언트 카트 → 영속 카트**, **즉시 재고 차감 → TTL 예약 기반 재고**.

### 2.2 슬라이스 분할 (작업 순서)

#### Slice A — 영속화 모델 + Toss 어댑터 (1주)

**스키마 추가**:
- `Cart(id, customerId?, anonymousToken?, expiresAt, lastActivityAt)` + `CartItem(cartId, variantId, quantity, addedAt)` (`@@unique [cartId, variantId]`)
- `OrderLineFulfillment(orderLineId, quantity, shipmentId?, status)` — 부분 출고
- `OrderLineRefund(orderLineId, quantity, paymentRefundId, status)` — 부분 환불
- `PaymentRefund(paymentId, externalRefundId @unique, amount, reason, requestedAt, completedAt?)` — 환불 ledger
- `WebhookEvent(provider, externalId @unique, signatureVerifiedAt, payload Json, processedAt?)` — 웹훅 idempotency
- `InventoryReservation` 활성화 + TTL 인덱스
- `Payment.idempotencyKey String @unique` 추가

**신규 패키지 `@commerce/payments`**:
- `interface PaymentProvider`: `createIntent`, `confirm`, `capture`, `cancel`, `refund(partial?)`, `verifyWebhookSignature`
- `TossPaymentsProvider` 어댑터 — v2 API (카드/계좌이체/카카오페이/네이버페이/토스페이/가상계좌)
- 모드: `mock | sandbox | live` (env `PAYMENT_MODE`)
- Webhook 검증: HMAC + nonce + timestamp window

**라우트**:
- `POST /api/v1/webhooks/payments/toss` — 서명 검증 → WebhookEvent insert (idempotency) → outbox 등록 → 200 OK 즉시 반환

#### Slice B — 카트·체크아웃 영속화 (1주)

**라우트** (`apps/web/app/api/v1`):
- `GET /me/cart` — 현재 카트 (게스트는 anonymousToken 쿠키 기반)
- `POST /me/cart/items` — 추가 (서버 사이드 가격 검증, 재고 확인)
- `PATCH /me/cart/items/:id` — 수량 변경
- `DELETE /me/cart/items/:id` — 삭제
- `POST /me/cart/merge` — 로그인 시 게스트→회원 카트 병합 (충돌 정책: 합산)
- 기존 `POST /checkout/preview`, `POST /checkout/orders` — 카트 기반으로 재작성, **InventoryReservation TTL 10분**

**예약 흐름**:
1. 체크아웃 시작 → 모든 라인을 `InventoryReservation`에 TTL 10분으로 예약 (atomic check + insert)
2. 결제 성공 webhook → reservation → `stock` 차감 트랜잭션
3. 결제 실패 / 타임아웃 / 사용자 취소 → reservation 자동 해제 (cron + 즉시 webhook 모두)

#### Slice C — 부분 출고·환불 + 주문 history (1주)

**라우트**:
- `GET /api/v1/me/orders` — 본인 주문 목록 (페이지네이션 + 상태 필터)
- `GET /api/v1/me/orders/:id` — 상세
- `POST /api/v1/me/orders/:id/cancel` — 미발송 한정 취소 (자동 환불)
- `POST /api/v1/admin/orders/:id/fulfillments` — 부분 출고 등록 (관리자)
- `POST /api/v1/admin/orders/:id/refunds` — 부분 환불 (관리자, Toss API 호출)

**감사 로그**: 주문 상태 변경, 환불, 출고 등록 모두 audit 자동 기록 (withAuditContext 활용)

### 2.3 작업 선후 의존성

```
Slice A (스키마 + Toss 어댑터 + webhook)
   │
   ├─► Slice B (카트 영속화 + 체크아웃 재작성)
   │
   └─► Slice C (부분 출고/환불 + 주문 history)
```

A는 직렬 필수. B와 C는 A 끝나면 병렬 가능.

### 2.4 보안/신뢰성 체크리스트 (Phase 2 종결 조건)

- [ ] 결제 webhook: Toss 서명 검증 100% 통과, 재전송 5회 → 1건만 처리 (WebhookEvent.externalId unique)
- [ ] 동시 100건 주문: 재고 음수 0, 차감 합 = 주문 합
- [ ] 부분 환불 후 잔액 합산 = `Payment.amount - sum(PaymentRefund.amount)`
- [ ] 게스트 카트 → 로그인 → 회원 카트 충돌 시 합산 정책 일관
- [ ] 결제 실패 시 reservation 즉시 해제, 5초 내 재고 표시 갱신
- [ ] Toss `PAYMENT_MODE=mock` 에선 외부 호출 0 (테스트 안전망)

---

## 3. Phase 2 시작 전 사용자 액션 (필수)

다음 항목을 **세션 재개 전에 준비**해 주세요. 필요 시 클로드가 단계별로 도와줄 수 있습니다.

### 3.1 인프라 셋업

1. **Supabase 프로젝트 생성**
   - region: `ap-northeast-2 (Seoul)` 권장
   - DB password 메모 → `DATABASE_URL`, `DIRECT_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` 채우기
2. **Toss Payments 가입 + 테스트 키 발급**
   - https://developers.tosspayments.com/
   - `TOSS_CLIENT_KEY`, `TOSS_SECRET_KEY` (테스트 모드) → `.env`에
   - `TOSS_WEBHOOK_SECRET` (관리자 페이지 → Webhook → 시크릿 키)
   - `PAYMENT_MODE=sandbox` 로 시작
3. **Auth secret 생성**
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
   를 두 번 실행해 `AUTH_JWT_SECRET`, `AUTH_CSRF_SECRET`에 채우기 (각 64 hex chars)
4. **Upstash Redis** (선택, Phase 2 후반)
   - 무료티어 OK
   - `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`

### 3.2 DB 마이그레이션

```bash
cd /Users/mr.joo/Desktop/어플웹
npm run prisma:generate
npm run prisma:migrate     # 첫 실행 시 마이그레이션 이름: phase1_auth_audit
psql "$DATABASE_URL" -f packages/db/prisma/seed.sql
```

### 3.3 관리자 시드 계정

`packages/db/prisma/seed.sql` 의 admin 시드는 `passwordHash`가 비어 있어 로그인 불가. Phase 2 진입 시 클로드가 password 시드 마이그레이션 + CLI 도구를 자동으로 추가할 예정.

임시 우회: Phase 2 첫 작업으로 `npm run admin:create -- --email ops@example.com --password "강력한비번"` CLI를 만들어 사용.

---

## 4. 알려진 함정 / 주의

| 함정 | 대응 |
|---|---|
| `@node-rs/argon2` `Algorithm` enum이 `isolatedModules`와 충돌 | 직접 import 안 하고 default 사용 (이미 처리됨) |
| Logout 라우트 CSRF 면제 (의도적) | refresh cookie SameSite=Strict로 충분히 보호 |
| 결제 webhook은 `200`을 즉시 반환해야 Toss가 재전송 안 함 | WebhookEvent insert 후 outbox에 push, 후속 작업은 워커가 처리 |
| Prisma 7 `prisma-client` generator는 `output` 명시 필수 | `schema.prisma`에 `output = "../generated/client"` 이미 설정 |
| `@prisma/adapter-pg`는 connection pool 직접 관리 안 함 | Supabase의 PgBouncer URL을 `DATABASE_URL`에, direct URL을 `DIRECT_URL`에 |
| dev 페이지의 form action은 CSRF 헤더 못 보냄 | 페이지가 frontend 트랙 도착 후 client-side fetch로 재구성 예정 |

---

## 5. 핵심 파일 맵

```
docs/
  plan-v2-backend.md       # 전체 작업계획서 v2
  handoff/LATEST.md        # 세션별 변경 이력
  operations/              # 운영 런북 (DB, e2e, app store)
PROGRESS.md                # ← 이 파일

packages/
  api/        contracts + schemas (ApiEnvelope/ApiErrorEnvelope)
  auth/       Argon2id + JWT + TOTP + refresh + server primitives
  config/     Zod env schema
  core/       product / order / inventory / payment / supplier 도메인
  db/         Prisma schema + repository helpers + audit ALS
  integrations/  공급처 커넥터 + AI normalizer
  notifications/ 알림 템플릿/잡/공급자
  ops/        쿠폰/포인트/리뷰/CS/감사/리포트 (helper만, 영속화 미구현)
  security/   CSRF + headers + rate limit
  seo/        메타데이터 + sitemap + JSON-LD

apps/
  admin/  (Next.js, :3001) 관리자
    app/lib/auth-context.ts  # resolveAdminContext, loginAdmin, logoutAdmin, refreshAdminSession, getServerAdminSession
    app/api/v1/auth/         # login/logout/refresh/me
    app/api/v1/dashboard/
    app/api/v1/products/
  web/    (Next.js, :3000) 고객
    app/lib/auth-context.ts  # resolveCustomerContext, signupCustomer, loginCustomer, logoutCustomer, refreshCustomerSession
    app/api/v1/auth/         # signup/login/logout/refresh/me
    app/api/v1/products/
    app/api/v1/checkout/     # ← Phase 2 Slice B 에서 카트 기반으로 재작성
  mobile/ (Expo) — placeholder
```

---

## 6. Phase 2 Slice C 시작 지점 (다음 세션)

**Slice A·B는 2026-05-11 완료**. Slice C에서 즉시 다음 단계:

1. **사용자 액션 선행 확인**: `.env` + `npm run prisma:migrate` (Toss webhook 서명 검증을 실제로 동작시키려면 필수)
2. **고객 주문 history 라우트** (`apps/web/app/api/v1/me/orders/`)
   - `GET /me/orders` — 페이지네이션 + 상태 필터
   - `GET /me/orders/[id]` — 상세 (lines + payments + shipments + refunds)
   - `POST /me/orders/[id]/cancel` — 미발송 한정. PaymentProvider.cancel + reservation 해제 (이미 차감된 stock은 `tx.productVariant.update increment`로 복원)
3. **관리자 fulfillment/refund 라우트** (`apps/admin/app/api/v1/orders/[id]/`)
   - `POST /api/v1/orders/[id]/fulfillments` — 라인별 quantity 부분 출고 등록 → `OrderLineFulfillment` + Shipment 생성/연결
   - `POST /api/v1/orders/[id]/refunds` — 라인별 quantity 부분 환불 → Toss `cancel(cancelAmount)` → `PaymentRefund` + `OrderLineRefund` 생성. 누적 환불액 ≤ Payment.amount 보장
4. **Webhook 후처리 강화** — Toss webhook이 결제 완료 이벤트 받으면 reservation → stock 차감 + Order.status PAID + paidAt 기록 (현재는 단순 markWebhookProcessed만 처리)
5. **감사 로그**: 주문 상태 변경 (cancel/fulfill/refund) 모두 `withAuditContext` + `insertAuditLog` 자동 기록
6. **테스트**: 환불 합계 = Payment.amount, 같은 fulfillment 두 번 → 멱등성 (단순 dedup 또는 conflict)

**예상 공수**: Slice C ≒ 5–7일.

---

## 7. Phase 3 이후 미리보기

- Phase 3: 배송·CS (택배사 5종 트래킹, RMA, 1:1 문의)
- Phase 4: 상품·재고·공급처 본격화 (카테고리 attributeSchema, 다창고, AliExpress/CJ/도매꾹 커넥터)
- Phase 5: 프로모션·로열티·감사 영속화 (쿠폰 ledger, PointLedger, MemberTier, Review)
- Phase 6: 알림 (Solapi/SES/FCM/APNs + BullMQ 큐)
- Phase 7: 검색·SEO·피드 (Meilisearch + 네이버쇼핑/구글쇼핑 피드)
- Phase 8: AI (라우터 + AiCallLog + 상품 자동 등록 + 추천 + 시각 검색 + 챗봇)
- Phase 9: 관측성·보안·런북
- Phase 10: 모바일 백엔드 + 출시

상세는 `docs/plan-v2-backend.md` 참조.

---

**마지막 갱신**: 2026-05-11 새벽 — Phase 2 Slice B 완료 (카트 헬퍼 8개 + 카트 라우트 5종 + 체크아웃 2종 재작성 + 16 신규 테스트, 누적 119 tests / 14 builds 모두 통과). Slice C 진입은 사용자 `.env` 작성 후 또는 mock 모드로 즉시 가능.
