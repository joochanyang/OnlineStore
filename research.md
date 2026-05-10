# Research

## Verified During Initial Scaffold

- Next.js App Router supports TypeScript configuration via `next.config.ts`.
- Next.js TypeScript projects should include `next-env.d.ts` and app/source paths in `tsconfig.json`.
- Prisma 7 `prisma-client` generator requires an explicit `output` path in `schema.prisma`.
- SEO, notification, operations, supplier import, and AI normalization helpers are currently implemented as local deterministic domain contracts so they can be verified without production provider credentials.

## Libraries to Verify Before Production Integration

- Auth.js or custom auth strategy
- Expo app store build flow
- Payment provider API
- SEO metadata and JSON-LD requirements
- Kakao AlimTalk/SMS provider APIs
- Push notification provider APIs
