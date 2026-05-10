# Commerce Operations Checklist

- SEO: sitemap, robots, metadata, JSON-LD, canonical URL
- Notifications: order, payment, shipping, refund, marketing consent
- CS: inquiry, exchange, return, refund, review moderation
- Promotions: coupon, point, event, free shipping
- Compliance: terms, privacy, age policy, marketing consent
- Observability: logs, error tracking, audit logs, backups

## Cafe24-style Shopping Mall Fit

- Storefront: catalog, category/search, product detail, SKU options, client cart builder, checkout preview, checkout order boundary
- Customer account: signup/login provider pending, terms/privacy consent modeled, marketing consent modeled, address book in schema
- Admin catalog: product status, SKU/inventory dashboard, supplier candidate pipeline, category/product/image schema
- Admin orders: order/payment/shipment models, order status transition guards, fulfillment workflow labels
- Admin customers: customer/address schema, customer read/write permission boundary, CS inquiry helpers in `@commerce/ops`
- Promotions: coupon and point helpers exist in `@commerce/ops`; persistence-backed admin forms are still pending
- Supplier operations: connector validation, import batches, AI normalization, candidate-to-product draft helpers exist
- Reporting/audit: report aggregation and audit trail helpers exist; production observability integration is still pending

## Remaining Productization Work

- Replace local admin actor login with real admin authentication/session loading.
- Persist storefront carts for member checkout, guest checkout, and payment confirmation UI.
- Add persistence-backed admin CRUD for products, categories, variants, images, coupons, points, orders, customers, CS, and suppliers.
- Add production payment provider, webhook verification, refund API, and failure/retry handling.
- Add shipping carrier integration, tracking webhook/import, exchange/return shipment handling, and customer-facing order history.
- Add role assignment UI and audit logging around every admin mutation.
