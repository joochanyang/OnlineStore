# Phase 2 백엔드·AI·SEO 작업계획서 (v2)

프론트엔드(고객/관리자 UI)는 별도 Claude Design 트랙. 본 문서는 백엔드·AI·SEO·운영 기능을 production-grade로 끝내기 위한 작업계획서다.

## 0. 확정 스택

| 영역 | 선택 |
|---|---|
| PG | Toss Payments (단일, 어댑터 인터페이스 유지) |
| DB / pgvector / 고객 OAuth | Supabase Pro |
| 관리자 Auth | Auth.js v5 + 자체 AdminUser + TOTP MFA |
| 이미지·CDN | Cloudflare R2 + Cloudflare Images |
| 캐시·큐 | Upstash Redis + BullMQ |
| 워크플로우 | Inngest (webhook 재시도, 정기 sync, AI 배치) |
| 검색 | Meilisearch (Hetzner VPS 자체호스팅) |
| 이메일 | Resend |
| 알림톡/SMS | Solapi (1순위) + NHN Cloud SENS (fallback) |
| 푸시 | Expo Push (모바일) + Web Push |
| 관측성 | Sentry + PostHog |
| AI | Claude Haiku/Sonnet + Gemini Flash·Vision·Embedding + GPT-4o-mini |
| 호스팅 | Vercel (Web/Admin) + Hetzner VPS (검색·워커) |

## 1. AI 모델 라우팅 (월 예산 10만원 ≒ $72)

| Tier | 모델 | 단가 (입/출 per 1M) | 담당 작업 |
|---|---|---|---|
| T0 | Gemini 2.0 Flash | $0.10 / $0.40 | 번역, 1차 카테고리 분류, 태그 추출 |
| T0 | GPT-4o-mini | $0.15 / $0.60 | 1차 모더레이션, 검색 의도 파싱 |
| T1 | Claude Haiku 4.5 | $1 / $5 | 상품 설명, SEO 메타, 리뷰 요약 |
| T2 | Claude Sonnet 4.6 | $3 / $15 | 복잡 정규화, escalate, 챗봇 |
| 임베딩 | Gemini text-embedding-004 | $0.025 / 1M | 상품·검색·리뷰 임베딩 |
| 이미지 | Gemini 2.0 Flash Vision | $0.10 / $0.40 | 색상·소재·카테고리 추출 |

**예산 분배 (월)**: Anthropic $40 / OpenAI $10 / Gemini $15 / 버퍼 $7 = **$72**.

**가드레일**:
- `@commerce/ai` 단일 라우터 (`ai.route(purpose, input)`)
- `AiCallLog` ledger (model, tokens, costUsd, purpose, requestId)
- 일일 $3, 월 $80 하드 캡 → Tier 자동 강등
- Anthropic 프롬프트 캐싱 (카탈로그 컨텍스트 재사용)
- 배치화 (1회 호출에 묶기)
- Confidence < 0.7 만 Sonnet escalate
- dev 환경 결정론적 mock (무비용)

## 2. 설계 원칙 (모든 Phase 공통)

| 원칙 | 적용 |
|---|---|
| 트랜잭션 | 금전·재고는 항상 DB transaction + optimistic locking |
| Idempotency | 모든 mutation에 Idempotency-Key + DB unique 제약 |
| Outbox | 후행 작업(알림·검색·감사·정산)은 outbox → 워커 pull |
| Audit-by-default | 관리자 mutation 자동 audit_log (Prisma middleware) |
| 다카테고리 흡수 | `Product.attributes Json` + `Category.attributeSchema Json` (JSON Schema) |
| 환경 분리 | dev / staging / prod, provider는 mock\|sandbox\|live |
| Zod 1소스 | API 스키마 = Zod → TS 타입 = OpenAPI 자동 생성 |

## 3. Phase 단위 작업

### Phase 1 — 보안·인증 안전망 (1.5주)
- 고객 인증 (Email+Password + 카카오/네이버/구글/Apple OAuth + 휴대폰 OTP)
- 관리자 인증 교체 (Auth.js v5 + AdminUser + TOTP MFA)
- 권한 미들웨어 (`withAdminAuth(permission)`, `withCustomerAuth()`)
- CSRF / Rate limit (Upstash) / 보안 헤더
- AuditLog (Prisma middleware 자동 기록)
- RefreshToken rotation + 재사용 탐지

### Phase 2 — 카트·결제·주문 영속화 (2.5주)
- 카트 영속화 (게스트→로그인 병합)
- 재고 예약 (TTL 10분, 결제 성공 시 deduct)
- Toss Payments v2 어댑터 (카드/계좌이체/카카오페이/네이버페이/토스페이/가상계좌)
- Webhook 엔드포인트 (서명 검증 + idempotency + outbox)
- 부분 출고/환불 (`OrderLineFulfillment`, `OrderLineRefund`)
- 고객 주문 API (`/api/v1/me/orders`)

### Phase 3 — 배송·교환·반품·CS (1.5주)
- 택배사 5종 트래킹 API + 송장 import
- 배송 정책 (지역/무게/부피/무료배송 임계)
- RMA (반품/교환) 흐름
- 1:1 문의, 상품 Q&A, SLA 알림

### Phase 4 — 상품·재고·공급처 (2주)
- 카테고리 attributeSchema (의류/가방/악세사리)
- 옵션·SKU·번들·세트
- 다창고 재고 (Warehouse, StockMovement ledger)
- 공급처 커넥터 (AliExpress/CJ/도매꾹/도매매/1688)
- 환율(한국은행) + 마진 룰
- 이미지 파이프라인 (R2 + Sharp + WebP/AVIF)

### Phase 5 — 프로모션·로열티·감사 (1.5주)
- Coupon + CouponIssuance ledger
- PointLedger (만료/사용제한/적립정책)
- MemberTier (재계산 배치)
- Review (구매 1회 제한, 사진리뷰)
- 프로모션 엔진 (N+1, 타임세일, 회원전용)

### Phase 6 — 알림 (1주)
- Solapi/SENS 알림톡·SMS, Resend 이메일, Expo/FCM/APNs 푸시
- 템플릿 + 이벤트 매핑 (order.paid 등)
- BullMQ 큐 + dead-letter

### Phase 7 — 검색·SEO·피드 (1.5주)
- Meilisearch (한국어 형태소·동의어·자동완성)
- Sitemap (상품/카테고리/이미지)
- 구조화 데이터 (Product/Offer/Review/Breadcrumb 등)
- 네이버쇼핑 / 구글쇼핑 / 카카오 / 다나와 피드
- 301 redirect / slug history

### Phase 8 — AI (2.5주)
- `@commerce/ai` 라우터 + AiCallLog
- 상품 등록 자동화 (이미지→속성, 설명, 카테고리, 옵션)
- 번역 (중→한, 영→한)
- 검색 의도, 추천 (pgvector hybrid), 시각 검색
- 리뷰 모더레이션 + 요약
- 챗봇, 트렌드 분석, 이상주문 탐지

### Phase 9 — 관측성·보안·런북 (1주)
- Pino + OpenTelemetry, Sentry, PostHog
- 백업 (PG WAL + R2 versioning)
- 개인정보 암호화 (envelope encryption, KMS)
- 휴면 회원 분리 저장
- 카오스 테스트 + 런북

### Phase 10 — 모바일 백엔드 + 출시 (1주)
- 모바일 API contract 호환
- 딥링크 / Universal Links
- 푸시 토큰 관리
- OAuth 모바일 콜백

## 4. 일정

| Phase | 공수 | 누적 |
|---|---|---|
| P1 | 1.5주 | 1.5주 |
| P2 | 2.5주 | 4주 |
| P3 | 1.5주 | 5.5주 |
| P4 | 2주 | 7.5주 |
| P5 | 1.5주 | 9주 |
| P6 | 1주 | 10주 |
| P7 | 1.5주 | 11.5주 |
| P8 | 2.5주 | 14주 |
| P9 | 1주 | 15주 |
| P10 | 1주 | 16주 |

1인 풀타임 약 4개월. 프론트(Claude Design)와 병렬 시 P2 후반부터 통합 가능.

## 5. 비용 추정 (월)

- Supabase Pro $25
- Vercel Hobby→Pro $0–20
- Cloudflare R2+Images $5–10
- Upstash Redis $1–5
- Hetzner CX22 $5
- Resend $0–20
- Solapi 사용량 (알림톡 9원/건, SMS 22원/건)
- AI $72 (10만원)

**합계**: 초기 약 25–30만원/월.
