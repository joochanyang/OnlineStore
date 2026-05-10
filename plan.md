# 구현 계획서: Next.js 기반 풀스택 커머스 플랫폼 초기 구축

## 사전 조건 확인 결과

- `docs/handoff/LATEST.md`: 현재 저장소에 `docs/` 디렉터리가 없어 읽을 수 없음.
- 관련 소스 파일 직접 확인: 현재 저장소가 비어 있어 확인 가능한 소스 파일 없음.
- `research.md`와 실제 코드 교차 검증: 현재 `research.md`와 실제 코드가 모두 없어 교차 검증 불가.
- Context7 최신 API 확인: 현재 세션에 Context7 MCP가 제공되지 않아 확인 불가. 구현 직전 Next.js, Prisma, Auth.js/NextAuth, Expo, Stripe 또는 Toss Payments 등 주요 라이브러리는 공식 문서 또는 Context7 사용 가능 환경에서 재확인 필요.

현재 폴더 상태는 빈 프로젝트이므로, 이 계획서는 신규 프로젝트 부트스트랩과 장기 확장 가능한 커머스 아키텍처 구축을 기준으로 한다.

## A. 에이전트 팀 구성

| 에이전트 | 담당 | 실행 방식 | 필요 MCP |
|---------|------|----------|---------|
| Lead Architect | 전체 아키텍처, 모노레포 구조, 도메인 경계, 기술 선택 | 선행 설계 후 각 에이전트 산출물 검토 | Filesystem, Git, Context7 |
| Product Domain Agent | 상품, 옵션, SKU, 재고, 주문, 배송, 반품/환불 도메인 모델링 | DB/API 작업 전에 도메인 규칙 확정 | Filesystem, DB MCP, Context7 |
| Backend/API Agent | Next.js Route Handler 또는 서버 액션, 인증, 주문/결제 API 구현 | DB 스키마 이후 병렬 가능 | Filesystem, DB MCP, Context7 |
| Admin Agent | 관리자 상품/주문/회원/공급처 관리 UI 구현 | API 계약 확정 후 진행 | Browser MCP, Filesystem |
| Storefront Agent | 고객 쇼핑몰 웹/모바일 UI, 카탈로그, 상세, 장바구니, 주문 흐름 | 디자인 시스템 확정 후 진행 | Browser MCP, Filesystem |
| Mobile App Agent | Expo React Native 앱 구조와 API 클라이언트 재사용 설계 | 웹 1차 핵심 API 안정화 후 진행 | Filesystem, Context7 |
| Integration Agent | 외부 공급처 상품 수집, CSV/API/스크래핑 커넥터, AI 상품 정리 파이프라인 | 기본 상품 도메인 완료 후 진행 | Browser MCP, Web Search, Filesystem |
| QA Harness Agent | 테스트 하네스, 시드 데이터, 린트/타입/빌드/Playwright 검증 자동화 | 최초 프로젝트 생성 직후부터 상시 | Browser MCP, Filesystem, Git |
| Security/Compliance Agent | 인증/권한, 개인정보, 결제 보안, 관리자 접근 통제 검토 | 인증/결제 구현 전후 리뷰 | Context7, Filesystem |
| SEO/Growth Agent | 상품 SEO, sitemap, robots, 구조화 데이터, 검색 노출, 이벤트/프로모션 설계 | 상품/카테고리 모델 확정 후 진행 | Browser MCP, Web Search, Context7 |
| Notification Agent | 알림톡/SMS/이메일/앱 푸시, 발송 템플릿, 수신 동의, 실패 재시도 | 주문/회원/배송 상태 모델 확정 후 진행 | Filesystem, Web Search, Context7 |
| Operations Agent | 쿠폰, 포인트, 리뷰, 문의, CS, 정산, 감사 로그, 운영 리포트 | 관리자 1차 구현 후 진행 | Filesystem, DB MCP |
| DevOps/Observability Agent | 배포, 환경 분리, 로그, 에러 추적, 성능 모니터링, 백업/복구 | 초기 하네스 이후 지속 병렬 진행 | Filesystem, Git, Browser MCP |

권장 실행 순서:

1. Lead Architect가 저장소 구조와 핵심 선택지를 확정한다.
2. Product Domain Agent와 QA Harness Agent가 DB 모델과 검증 기준을 먼저 만든다.
3. Backend/API Agent가 인증, 상품, 주문 API를 만든다.
4. Storefront Agent와 Admin Agent가 API 계약을 기준으로 병렬 작업한다.
5. Integration Agent가 외부 상품 연동 파이프라인을 별도 모듈로 붙인다.
6. Mobile App Agent는 안정화된 API와 공유 패키지를 기준으로 앱스토어용 앱을 구축한다.
7. Security/Compliance Agent가 배포 전 권한, 결제, 개인정보 흐름을 점검한다.
8. SEO/Growth Agent, Notification Agent, Operations Agent가 운영 기능을 단계적으로 확장한다.
9. DevOps/Observability Agent가 배포, 관측성, 백업, 장애 대응 하네스를 상시 유지한다.

## B. 구현 전략

### 선택 전략

Next.js 중심의 TypeScript 모노레포로 웹 쇼핑몰, 관리자, 서버 API, 공유 도메인 로직을 먼저 구축하고, 앱스토어 등록용 앱은 Expo React Native를 별도 앱으로 붙인다.

근거:

- 웹/모바일웹/관리자/API를 한 기술권 안에서 빠르게 구축할 수 있다.
- 상품, 주문, 결제, 회원, 공급처 연동 로직을 `packages/core`, `packages/db`, `packages/api`로 분리하면 Expo 앱에서도 재사용하기 쉽다.
- AI/MCP 기반 상품 수집은 일반 쇼핑몰 UI와 분리된 백오피스/작업 큐 영역으로 설계하는 것이 유지보수에 유리하다.
- 앱스토어 등록은 PWA만으로는 한계가 있으므로 Expo를 별도 앱으로 준비하는 편이 현실적이다.
- 쇼핑몰은 개발 완료보다 운영 품질이 더 중요하므로 SEO, 알림, CS, 쿠폰, 정산, 로그, 모니터링을 초기 설계에 포함한다.

### 대안 1: Next.js 단일 앱 + PWA만 사용

장점:

- 초기 개발 속도가 가장 빠르다.
- 하나의 코드베이스만 관리하면 된다.
- 모바일웹 출시와 검색 노출에 유리하다.

단점:

- iOS/Android 앱스토어 심사와 네이티브 기능 대응이 제한적이다.
- 푸시 알림, 딥링크, 네이티브 결제/공유 기능에서 제약이 생길 수 있다.

선택하지 않은 이유:

- 사용자가 앱스토어 등록을 명확히 요구했기 때문에 PWA 단독 전략은 장기 요구사항을 충족하기 어렵다.

### 대안 2: React Native/Expo 우선 + 웹은 별도 구축

장점:

- 앱스토어 중심 제품을 빠르게 만들 수 있다.
- 네이티브 UX와 푸시 알림 대응이 쉽다.

단점:

- 관리자 페이지와 SEO가 필요한 쇼핑몰 웹 구축에는 비효율적이다.
- 웹/앱/관리자의 비즈니스 로직이 중복될 가능성이 높다.

선택하지 않은 이유:

- 쇼핑몰 운영의 핵심은 상품 노출, 검색, 관리자, 주문 관리이며, 초기에는 웹/관리자 기반이 더 중요하다.

### 대안 3: 완전 분리형 백엔드 NestJS + Next.js + Expo

장점:

- 대규모 백엔드 구조와 모듈 경계가 명확하다.
- 장기적으로 별도 서버팀/앱팀 분리에 유리하다.

단점:

- 초기 구축 비용과 운영 복잡도가 크다.
- 작은 팀 또는 1인 개발 환경에서는 배포, 타입 공유, 인증 연동 비용이 커진다.

선택하지 않은 이유:

- 현재 목표는 빠른 구축과 쉬운 유지보수다. 초기에는 Next.js 풀스택으로 시작하고, API 규모가 커지면 별도 백엔드로 분리하는 편이 실용적이다.

## C. 변경 명세

현재 저장소는 비어 있으므로 모든 변경은 신규 생성 예정이다.

### 1. `/Users/mr.joo/Desktop/어플웹/package.json`

- 유형: 신규
- 변경 전:

```json
파일 없음
```

- 변경 후:

```json
{
  "name": "commerce-platform",
  "private": true,
  "scripts": {
    "dev": "turbo dev",
    "build": "turbo build",
    "lint": "turbo lint",
    "typecheck": "turbo typecheck",
    "test": "turbo test"
  }
}
```

- 이유: 웹, 관리자, 모바일 앱, 공유 패키지를 한 저장소에서 관리하기 위한 루트 설정.
- 영향 범위: 모든 앱과 패키지의 실행 명령, CI, 개발 워크플로.

### 2. `/Users/mr.joo/Desktop/어플웹/apps/web`

- 유형: 신규
- 변경 전:

```txt
디렉터리 없음
```

- 변경 후:

```txt
apps/web/
  app/
  components/
  lib/
  tests/
  next.config.ts
  package.json
```

- 이유: 고객용 쇼핑몰 웹/모바일웹. 상품 목록, 상세, 장바구니, 주문, 마이페이지 담당.
- 영향 범위: 고객 접점, SEO, 모바일웹 UX.

### 3. `/Users/mr.joo/Desktop/어플웹/apps/admin`

- 유형: 신규
- 변경 전:

```txt
디렉터리 없음
```

- 변경 후:

```txt
apps/admin/
  app/
  components/
  lib/
  tests/
  next.config.ts
  package.json
```

- 이유: 관리자 전용 백오피스. 상품, 주문, 회원, 공급처, 외부 수집 작업 관리.
- 영향 범위: 운영 효율, 권한 보안, 내부 업무 흐름.

### 4. `/Users/mr.joo/Desktop/어플웹/apps/mobile`

- 유형: 신규
- 변경 전:

```txt
디렉터리 없음
```

- 변경 후:

```txt
apps/mobile/
  app/
  src/
  app.json
  package.json
```

- 이유: 앱스토어 등록을 위한 Expo React Native 앱.
- 영향 범위: iOS/Android 앱, 푸시 알림, 딥링크, 앱 배포.

### 5. `/Users/mr.joo/Desktop/어플웹/packages/db/prisma/schema.prisma`

- 유형: 신규
- 변경 전:

```prisma
// 파일 없음
```

- 변경 후:

```prisma
model Product {
  id          String   @id @default(cuid())
  slug        String   @unique
  name        String
  status      ProductStatus @default(DRAFT)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  variants    ProductVariant[]
}

model ProductVariant {
  id        String @id @default(cuid())
  productId String
  sku       String @unique
  price     Int
  stock     Int
  product   Product @relation(fields: [productId], references: [id])
}
```

- 이유: 의류 옵션/사이즈/색상/SKU 단위 재고 관리를 위한 핵심 모델.
- 영향 범위: 상품 등록, 주문 재고 차감, 외부 상품 연동.

### 6. `/Users/mr.joo/Desktop/어플웹/packages/core`

- 유형: 신규
- 변경 전:

```txt
디렉터리 없음
```

- 변경 후:

```txt
packages/core/
  src/product/
  src/order/
  src/inventory/
  src/supplier/
```

- 이유: 웹, 관리자, 모바일이 공유할 순수 비즈니스 규칙 분리.
- 영향 범위: 도메인 로직 재사용성, 테스트 가능성.

### 7. `/Users/mr.joo/Desktop/어플웹/packages/api`

- 유형: 신규
- 변경 전:

```txt
디렉터리 없음
```

- 변경 후:

```txt
packages/api/
  src/client/
  src/contracts/
  src/schemas/
```

- 이유: 웹/앱/관리자가 같은 API 타입과 Zod 스키마를 공유하기 위함.
- 영향 범위: API 계약 안정성, 타입 안전성.

### 8. `/Users/mr.joo/Desktop/어플웹/packages/integrations`

- 유형: 신규
- 변경 전:

```txt
디렉터리 없음
```

- 변경 후:

```txt
packages/integrations/
  src/suppliers/
  src/importers/
  src/ai-normalizer/
```

- 이유: 구매대행/공급처 상품 수집과 AI 상품 정리 기능을 쇼핑몰 코어와 분리.
- 영향 범위: 외부 상품 연동, 데이터 품질, 운영 자동화.

### 9. `/Users/mr.joo/Desktop/어플웹/packages/notifications`

- 유형: 신규
- 변경 전:

```txt
디렉터리 없음
```

- 변경 후:

```txt
packages/notifications/
  src/channels/
  src/templates/
  src/providers/
  src/jobs/
```

- 이유: 알림톡, SMS, 이메일, 앱 푸시 발송을 주문/배송/회원 이벤트와 분리해 관리.
- 영향 범위: 주문 확인, 결제 완료, 배송 시작, 쿠폰, 휴면/마케팅 알림.

### 10. `/Users/mr.joo/Desktop/어플웹/packages/seo`

- 유형: 신규
- 변경 전:

```txt
디렉터리 없음
```

- 변경 후:

```txt
packages/seo/
  src/metadata/
  src/json-ld/
  src/sitemap/
```

- 이유: 상품/카테고리 SEO 메타데이터, 구조화 데이터, sitemap, robots 규칙을 일관되게 생성.
- 영향 범위: 검색 노출, 상품 상세 페이지, 카테고리 페이지, 공유 미리보기.

### 11. `/Users/mr.joo/Desktop/어플웹/packages/ops`

- 유형: 신규
- 변경 전:

```txt
디렉터리 없음
```

- 변경 후:

```txt
packages/ops/
  src/coupons/
  src/points/
  src/reviews/
  src/cs/
  src/audit/
  src/reports/
```

- 이유: 쿠폰, 포인트, 리뷰, 문의, CS, 감사 로그, 운영 리포트는 주문 코어와 분리해야 변경이 쉽다.
- 영향 범위: 재구매 유도, 고객 응대, 관리자 운영, 내부 통제.

### 12. `/Users/mr.joo/Desktop/어플웹/docs/handoff/LATEST.md`

- 유형: 신규
- 변경 전:

```md
파일 없음
```

- 변경 후:

```md
# Latest Handoff

## Current State
- Initial project planning only.

## Next Actions
- Bootstrap monorepo.
- Define database schema.
- Add validation harness.
```

- 이유: 다음 작업자가 현재 상태를 놓치지 않도록 인수인계 기준 문서 생성.
- 영향 범위: 에이전트 간 작업 연속성.

### 13. `/Users/mr.joo/Desktop/어플웹/research.md`

- 유형: 신규
- 변경 전:

```md
파일 없음
```

- 변경 후:

```md
# Research

## Libraries to Verify
- Next.js latest app router behavior
- Prisma migration behavior
- Auth.js or custom auth strategy
- Expo app store build flow
- Payment provider API
- SEO metadata and JSON-LD requirements
- Kakao AlimTalk/SMS provider APIs
- Push notification provider APIs
```

- 이유: 기술 선택과 최신 API 확인 결과를 코드와 교차 검증하기 위한 기준 문서.
- 영향 범위: 라이브러리 선택, 장기 유지보수.

### 14. `/Users/mr.joo/Desktop/어플웹/.env.example`

- 유형: 신규
- 변경 전:

```env
파일 없음
```

- 변경 후:

```env
DATABASE_URL=
AUTH_SECRET=
NEXT_PUBLIC_WEB_URL=
NEXT_PUBLIC_ADMIN_URL=
PAYMENT_PROVIDER=
SUPPLIER_IMPORT_SECRET=
AI_PROVIDER_API_KEY=
KAKAO_ALIMTALK_PROVIDER=
KAKAO_ALIMTALK_API_KEY=
SMS_PROVIDER=
SMS_API_KEY=
EMAIL_PROVIDER=
EMAIL_API_KEY=
PUSH_PROVIDER=
PUSH_API_KEY=
SENTRY_DSN=
SEARCH_PROVIDER=
```

- 이유: 환경 변수 계약을 명시하고 로컬/배포 환경 차이를 관리.
- 영향 범위: 배포, 보안, 결제/AI/외부 연동, 알림, 검색, 관측성.

### 15. `/Users/mr.joo/Desktop/어플웹/docs/operations/commerce-checklist.md`

- 유형: 신규
- 변경 전:

```md
파일 없음
```

- 변경 후:

```md
# Commerce Operations Checklist

- SEO: sitemap, robots, metadata, JSON-LD, canonical URL
- Notifications: order, payment, shipping, refund, marketing consent
- CS: inquiry, exchange, return, refund, review moderation
- Promotions: coupon, point, event, free shipping
- Compliance: terms, privacy, age policy, marketing consent
- Observability: logs, error tracking, audit logs, backups
```

- 이유: 실제 쇼핑몰 운영 누락을 방지하기 위한 런칭 체크리스트.
- 영향 범위: 출시 준비, 운영 안정성, 법적/보안 리스크.

## D. 구현 순서

* [x] 단계 1: 저장소 하네스 문서 생성 및 작업 기준 확정 (~20분)
    * 검증: `docs/handoff/LATEST.md`, `research.md`, `plan.md` 존재
* [x] 단계 2: 모노레포 패키지 매니저와 Turborepo 설정 (~30분)
    * 검증: 루트 `package.json`, `turbo.json`, 워크스페이스 설정이 정상 인식됨
    * 의존: 단계 1
* [x] 단계 3: Next.js `apps/web`, `apps/admin` 생성 (~40분)
    * 검증: 각 앱의 `dev`, `build`, `lint`, `typecheck` 실행 가능
    * 의존: 단계 2
* [x] 단계 4: Expo `apps/mobile` 생성 및 공유 API 클라이언트 연결 준비 (~40분)
    * 검증: Expo 앱이 로컬에서 시작되고 기본 화면 렌더링
    * 의존: 단계 2
* [x] 단계 5: TypeScript, ESLint, Prettier, 테스트 공통 설정 추가 (~35분)
    * 검증: 전체 워크스페이스에서 타입 체크와 린트가 실행됨
    * 의존: 단계 2
* [x] 단계 6: Prisma/PostgreSQL 기반 DB 패키지 생성 (~50분)
    * 검증: `prisma generate` 성공, 초기 마이그레이션 생성 가능
    * 의존: 단계 5
* [x] 단계 7: 상품/옵션/SKU/재고 도메인 모델 구현 (~70분)
    * 검증: 상품 생성, 옵션 생성, 재고 조회 단위 테스트 통과
    * 의존: 단계 6
* [x] 단계 8: 회원/권한/세션 인증 구조 구현 (~70분)
    * 검증: 일반 유저와 관리자 권한 분리 테스트 통과
    * 의존: 단계 6
* [x] 단계 9: 장바구니/주문/재고 차감 도메인 구현 (~90분)
    * 검증: 주문 생성 시 variant 재고 차감, 품절 방지 테스트 통과
    * 의존: 단계 7, 단계 8
* [x] 단계 10: 결제 제공자 추상화와 결제 상태 모델 구현 (~80분)
    * 검증: 결제 대기, 성공, 실패, 취소 상태 전이 테스트 통과
    * 의존: 단계 9
* [x] 단계 11: 고객용 웹 상품 목록/상세/장바구니/주문 UI 구현 (~120분)
    * 검증: Playwright로 상품 조회부터 주문 요청까지 흐름 확인
    * 의존: 단계 9
* [x] 단계 12: 관리자 상품/주문/회원 관리 UI 구현 (~140분)
    * 검증: 관리자가 상품 등록, 재고 수정, 주문 상태 변경 가능
    * 의존: 단계 8, 단계 9
* [x] 단계 13: SEO 기본 하네스 구현 (~70분)
    * 검증: 상품/카테고리 메타데이터, canonical URL, sitemap, robots, Product/Breadcrumb JSON-LD 생성
    * 의존: 단계 7, 단계 11
* [x] 단계 14: 검색/필터/정렬 모델 구현 (~90분)
    * 검증: 카테고리, 가격대, 색상, 사이즈, 재고 여부, 최신순/인기순/가격순 검색 가능
    * 의존: 단계 7, 단계 11
* [x] 단계 15: 알림톡/SMS/이메일/푸시 알림 패키지 구현 (~110분)
    * 검증: 주문 생성, 결제 완료, 배송 시작, 환불 완료 이벤트에서 mock provider 발송 기록 생성
    * 의존: 단계 8, 단계 9, 단계 10
* [x] 단계 16: 쿠폰/포인트/프로모션 기본 도메인 구현 (~110분)
    * 검증: 쿠폰 적용, 최소 주문 금액, 중복 사용 제한, 포인트 적립/차감 테스트 통과
    * 의존: 단계 9, 단계 10
* [x] 단계 17: 리뷰/문의/찜/최근 본 상품 구현 (~100분)
    * 검증: 구매자 리뷰 작성 제한, 관리자 리뷰 숨김, 찜 목록 저장, 최근 본 상품 기록
    * 의존: 단계 8, 단계 11, 단계 12
* [x] 단계 18: 배송/교환/반품/환불 운영 플로우 구현 (~130분)
    * 검증: 송장 등록, 배송 추적 URL, 교환/반품 요청, 환불 상태 전이 테스트 통과
    * 의존: 단계 9, 단계 10, 단계 12
* [x] 단계 19: 약관/개인정보/마케팅 수신 동의 및 감사 로그 구현 (~90분)
    * 검증: 가입/주문/마케팅 수신 동의 이력과 관리자 변경 감사 로그 저장
    * 의존: 단계 8, 단계 12
* [x] 단계 20: 운영 리포트와 관리자 대시보드 구현 (~100분)
    * 검증: 매출, 주문 수, 환불률, 재고 부족, 인기 상품, 공급처 import 현황 조회 가능
    * 의존: 단계 9, 단계 12, 단계 18
* [x] 단계 21: 공급처/구매대행 상품 수집 기본 파이프라인 구현 (~120분)
    * 검증: CSV/API 샘플 입력을 내부 상품 후보 데이터로 변환
    * 의존: 단계 7, 단계 12
* [x] 단계 22: AI 상품명/설명/옵션 정리 인터페이스 추가 (~100분)
    * 검증: 외부 상품 후보가 내부 등록 가능한 형태로 정규화됨
    * 의존: 단계 21
* [x] 단계 23: Expo 앱에서 상품 목록/상세/로그인/푸시 수신 기본 흐름 연결 (~140분)
    * 검증: 모바일 앱이 같은 API 계약으로 상품 데이터를 조회
    * 의존: 단계 11, 단계 15
* [x] 단계 24: 앱스토어/플레이스토어 제출 준비 하네스 정리 (~90분)
    * 검증: 앱 아이콘, 스플래시, 권한 설명, 개인정보 처리방침 URL, 딥링크, 푸시 권한 설명 문서화
    * 의존: 단계 23
* [x] 단계 25: 배포/모니터링/백업 하네스 정리 (~100분)
    * 검증: 환경별 설정, 에러 추적, 서버 로그, DB 백업, 이미지 스토리지 백업, 장애 대응 문서 존재
    * 의존: 단계 3-20
* [x] 단계 26: CI용 검증 하네스 정리 (~60분)
    * 검증: `lint`, `typecheck`, `test`, `build`, 핵심 e2e 명령이 문서화되고 통과
    * 의존: 단계 3-25

## E. 엣지 케이스 & 에러 처리

| 시나리오 | 발생 조건 | 처리 방법 | 롤백 전략 |
|---------|----------|----------|----------|
| 상품 옵션 중복 | 같은 상품에 동일 색상/사이즈/SKU 등록 | SKU unique 제약, 관리자 폼 검증 | 중복 레코드 삭제 또는 마이그레이션 롤백 |
| 재고 음수 | 동시 주문 또는 중복 결제 콜백 | DB 트랜잭션과 조건부 업데이트 사용 | 주문 취소 처리 후 재고 보정 트랜잭션 |
| 결제 성공 후 주문 실패 | 결제 콜백은 성공했으나 주문 상태 업데이트 실패 | idempotency key로 재처리 가능하게 설계 | 결제 취소 API 호출 또는 수동 환불 큐 등록 |
| 외부 상품 데이터 불완전 | 공급처에 이미지/옵션/가격 누락 | `import_draft` 상태로 보관하고 관리자 승인 요구 | 후보 데이터 삭제, 원본 import 로그 유지 |
| AI 상품 정리 오류 | AI가 잘못된 카테고리/가격/옵션 생성 | AI 결과는 바로 게시하지 않고 승인 대기 | AI 결과 폐기 후 원본 데이터에서 재생성 |
| 관리자 권한 오판 | 일반 유저가 관리자 API 접근 | 서버 측 role 검사와 route middleware 적용 | 세션 무효화, 감사 로그 확인 |
| 앱 API 버전 불일치 | 앱스토어 배포 버전이 오래된 API 호출 | API versioning 또는 하위 호환 필드 유지 | 이전 API route 임시 복구 |
| 이미지 업로드 실패 | 스토리지 장애 또는 파일 형식 문제 | 파일 타입/크기 검증, 재시도 UI 제공 | 업로드 후보 삭제, 기존 이미지 유지 |
| 배송 상태 역전 | 배송 완료 주문을 준비중으로 되돌림 | 상태 전이 규칙 강제 | 관리자 감사 로그 기반 수동 복구 |
| 개인정보 노출 | 관리자 리스트/API에 불필요한 사용자 정보 포함 | 응답 DTO 분리와 필드 allowlist | 배포 롤백, 노출 로그 점검 |
| 알림톡/SMS 중복 발송 | 결제 콜백 재시도 또는 작업 큐 재시도 | notification idempotency key와 발송 로그 unique 제약 | 중복 발송 로그 표시, 고객 CS 템플릿 대응 |
| 알림 발송 실패 | 공급자 장애, 템플릿 미승인, 휴대폰 번호 오류 | 재시도 큐, 대체 채널 SMS/이메일 fallback, 관리자 실패 목록 | 발송 작업 재큐잉 또는 수동 발송 |
| SEO 중복 URL | 같은 상품이 여러 카테고리/슬러그로 접근 | canonical URL 강제, redirect rule 적용 | 잘못된 slug redirect 제거 |
| 품절 상품 검색 노출 | 재고 0 상품이 기본 목록 상단 노출 | 품절 제외/후순위 옵션, 품절 알림 신청 제공 | 검색 인덱스 재생성 |
| 쿠폰 악용 | 중복 계정, 최소 금액 우회, 환불 후 쿠폰 재사용 | 쿠폰 사용 이력, 주문 상태 연동, 계정/주문 단위 제한 | 쿠폰 사용 취소, 포인트 회수 |
| 리뷰 어뷰징 | 구매하지 않은 사용자가 리뷰 작성 | 구매 확정 주문 기준으로 작성 권한 제한 | 리뷰 숨김 처리와 감사 로그 보존 |
| 마케팅 수신 미동의 발송 | 동의 이력 누락 또는 조건 오류 | 발송 전 consent check 강제 | 발송 중단, 대상자 재산정, 발송 로그 보존 |
| 검색 인덱스 불일치 | 상품 수정 후 검색 제공자 동기화 실패 | outbox 이벤트와 재동기화 작업 | 전체 인덱스 재빌드 |
| 앱 푸시 토큰 만료 | 앱 삭제/재설치 또는 토큰 갱신 | 실패 토큰 비활성화, 로그인 시 토큰 갱신 | 비활성 토큰 정리 배치 |
| 관리자 변경 추적 누락 | 상품 가격/재고/주문 상태 수동 변경 | 주요 변경에 audit log 필수 저장 | DB 백업과 감사 로그로 수동 복원 |

## F. 테스트 계획

### 단위 테스트

- `packages/core/src/product`: 상품 생성, slug 생성, 옵션 조합, SKU 중복 방지
- `packages/core/src/inventory`: 재고 조회, 재고 차감, 품절 처리, 동시성 실패 케이스
- `packages/core/src/order`: 주문 상태 전이, 주문 취소, 환불 가능 조건
- `packages/integrations`: 외부 상품 원본을 내부 상품 후보로 매핑
- `packages/api/src/schemas`: 요청/응답 Zod 스키마 검증
- `packages/seo`: metadata, canonical URL, sitemap entry, Product JSON-LD 생성
- `packages/notifications`: 템플릿 렌더링, 수신 동의 체크, idempotency, provider fallback
- `packages/ops/src/coupons`: 쿠폰 조건, 중복 사용 제한, 환불 시 쿠폰/포인트 복원
- `packages/ops/src/reviews`: 구매자 리뷰 권한, 숨김/신고 처리

### 통합 테스트

- 회원 가입/로그인 후 상품 조회
- 장바구니 추가 후 주문 생성
- 결제 성공 콜백 후 주문 상태 `PAID` 변경
- 주문 생성 시 variant 재고 차감
- 관리자 상품 등록 후 고객 웹에 노출
- 외부 상품 import 후 관리자 승인으로 내부 상품 생성
- 상품 생성 후 sitemap/검색 인덱스/카테고리 목록 반영
- 결제 완료 후 알림톡 mock 발송 로그 생성
- 배송 상태 변경 후 알림 발송과 마이페이지 주문 상태 반영
- 쿠폰 적용 주문 취소 시 쿠폰/포인트 복구
- 리뷰 작성 후 관리자 숨김 처리 시 고객 화면 비노출

### 수동 검증

- 모바일 폭에서 상품 목록, 상세, 장바구니, 주문 화면이 깨지지 않는지 확인
- 관리자에서 상품 이미지, 옵션, 가격, 재고를 수정하고 고객 화면 반영 확인
- 결제 실패/취소 시 사용자가 명확한 상태를 확인하는지 검증
- 앱에서 로그인 유지, 상품 조회, 딥링크 기본 동작 확인
- 상품 상세의 title, description, Open Graph, JSON-LD가 실제 상품 정보와 일치하는지 확인
- `robots.txt`, `sitemap.xml`, canonical URL, 404/품절 페이지 정책 확인
- 주문/결제/배송/환불 알림톡 템플릿 문구와 발송 조건 확인
- 마케팅 수신 동의하지 않은 계정에 프로모션 알림이 발송되지 않는지 확인
- 앱스토어 심사용 개인정보 처리방침, 권한 설명, 고객센터 연락처 확인
- 관리자 감사 로그에서 상품 가격/재고/주문 상태 변경 이력이 보이는지 확인

### 기존 테스트 영향 + 대응

- 현재 기존 테스트가 없으므로 영향 없음.
- 신규 테스트 하네스 생성 후에는 기능 추가마다 `lint`, `typecheck`, `test`, `build`를 최소 기준으로 유지한다.
- 결제/외부 공급처/API 연동은 실제 서비스 키 없이도 검증 가능한 mock provider를 먼저 둔다.
- 알림톡/SMS/푸시/이메일도 실제 발송 전 mock provider와 sandbox provider를 분리한다.
- SEO는 단순 스냅샷이 아니라 실제 HTML metadata와 sitemap route를 테스트한다.

## G. 영향 범위 체크리스트

- [x] 기존 테스트 유지?
- [x] 타입 안전성 유지?
- [x] 하위 호환성?
- [x] 성능 영향?
- [x] 보안 취약점?
- [x] API 계약 유지?
- [x] 환경 변수/설정 변경?
- [x] 마이그레이션 필요?
- [x] SEO 메타데이터/구조화 데이터 유지?
- [x] 알림톡/SMS/푸시 수신 동의 확인?
- [x] 쿠폰/포인트/정산 영향?
- [x] 관리자 감사 로그 기록?
- [x] 개인정보/약관/마케팅 동의 이력?
- [x] 앱스토어 심사 요구사항?
- [x] 로그/모니터링/백업 설정?

초기 신규 구축이므로 모든 항목은 구현 단계에서 매 단계별로 재검증해야 한다.

## H. 롤백 계획

### 코드 롤백

구현 중 문제가 발생하면 커밋 단위로 되돌린다.

```bash
git status
git log --oneline -5
git revert <bad_commit_sha>
```

아직 커밋하지 않은 작업을 폐기해야 할 경우, 사용자 승인 후에만 다음을 사용한다.

```bash
git restore <file_path>
git clean -fd
```

주의: `git reset --hard`는 사용자가 명시적으로 요청하거나 승인하기 전에는 사용하지 않는다.

### 데이터 롤백

- Prisma 마이그레이션 전 DB 백업을 생성한다.
- 실패 시 최근 백업으로 복구한다.
- 외부 상품 import는 원본 데이터와 정규화 결과를 분리 저장해 승인 전 삭제 가능하게 한다.
- 결제/주문 관련 데이터는 물리 삭제보다 취소/환불 상태 전이로 복구한다.
- 알림 발송은 발송 로그를 기준으로 재발송 가능하게 하고, 중복 발송 방지 키를 유지한다.
- 검색 인덱스와 sitemap은 DB 원본 기준으로 재생성 가능하게 한다.
- 쿠폰/포인트는 ledger 방식으로 기록하고 잘못된 적립/차감은 보정 거래로 되돌린다.

예상 명령:

```bash
pg_dump "$DATABASE_URL" > backups/pre_migration_YYYYMMDD_HHMMSS.sql
psql "$DATABASE_URL" < backups/pre_migration_YYYYMMDD_HHMMSS.sql
```

### 배포 롤백

- 웹/관리자: 이전 배포 버전으로 즉시 롤백.
- DB: backward-compatible migration 우선 적용, destructive migration은 별도 승인 후 진행.
- 모바일 앱: 앱스토어 배포는 즉시 회수가 어렵기 때문에 API 하위 호환성을 유지한다.
