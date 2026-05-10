# Browser Smoke Checklist

## Automated Local Smoke

Run the end-to-end smoke harness from the repository root:

```bash
npm run smoke:e2e
```

The script starts the web and admin dev servers if they are not already running, then checks:

- Web home catalog rendering and SKU rows.
- `GET /api/v1/products`.
- `POST /api/v1/checkout/preview`.
- `POST /api/v1/checkout/orders`.
- Admin login session cookie flow.
- Admin home protected rendering.
- `GET /api/v1/dashboard`.
- `PATCH /api/v1/products/[id]/status`.
- `POST /api/v1/products`.

Override targets when needed:

```bash
WEB_ORIGIN=http://127.0.0.1:3000 ADMIN_ORIGIN=http://127.0.0.1:3001 npm run smoke:e2e
```

## Web

1. Open `http://localhost:3000`.
2. Confirm catalog cards render with SKU rows.
3. Submit the preview form or call:

```bash
curl -s -X POST http://localhost:3000/api/v1/checkout/preview \
  -H 'content-type: application/json' \
  -d '{"customerId":"customer-seed","lines":[{"sku":"SHIRT-WHITE-M","quantity":1}]}'
```

4. Create an order:

```bash
curl -s -X POST http://localhost:3000/api/v1/checkout/orders \
  -H 'content-type: application/json' \
  -d '{"customerId":"customer-seed","lines":[{"sku":"SHIRT-WHITE-M","quantity":1}],"paymentProvider":"mock"}'
```

## Admin

1. Open `http://localhost:3001`.
2. Confirm inventory, product status, order workflow, and customer boundary sections render.
3. Verify product status mutation:

```bash
curl -s -X PATCH http://localhost:3001/api/v1/products/seed-essential-shirt/status \
  -H 'content-type: application/json' \
  -H 'x-actor-id: admin-seed' \
  -d '{"status":"ACTIVE"}'
```

## Required Local Commands

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```
