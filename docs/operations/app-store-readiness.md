# App Store Readiness

## Current Expo Harness

- App config: `apps/mobile/app.json`
- EAS config: `apps/mobile/eas.json`
- Native build command: `npm --workspace @commerce/mobile run build:native`
- Public config validation: `npm --workspace @commerce/mobile run build`

## Required Before Submission

- production web URL
- privacy policy URL
- customer support email or phone
- app icon and splash assets
- push notification permission copy
- deep link scheme verification for `commerce://`
- real authentication provider configuration

## Smoke Flow

1. Open the Expo app.
2. Confirm the API contract version is visible.
3. Confirm product, login, and push readiness cards render.
4. Verify the app can reach the same product API used by web once the production API base URL is configured.
