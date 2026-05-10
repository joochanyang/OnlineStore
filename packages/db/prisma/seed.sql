insert into "Category" ("id", "slug", "name", "createdAt")
values
  ('seed-category-shirts', 'shirts', 'Shirts', now()),
  ('seed-category-denim', 'denim', 'Denim', now())
on conflict ("slug") do nothing;

insert into "Product" ("id", "slug", "name", "description", "status", "createdAt", "updatedAt")
values
  (
    'seed-essential-shirt',
    'essential-cotton-shirt',
    'Essential Cotton Shirt',
    'A durable cotton shirt with sellable SKU and safety stock rules.',
    'ACTIVE',
    now(),
    now()
  ),
  (
    'seed-denim-pants',
    'daily-denim-pants',
    'Daily Denim Pants',
    'A baseline product used for reorder and fulfillment checks.',
    'ACTIVE',
    now(),
    now()
  )
on conflict ("slug") do nothing;

insert into "ProductCategory" ("productId", "categoryId")
values
  ('seed-essential-shirt', 'seed-category-shirts'),
  ('seed-denim-pants', 'seed-category-denim')
on conflict ("productId", "categoryId") do nothing;

insert into "ProductVariant" ("id", "productId", "sku", "color", "size", "price", "stock", "safetyStock")
values
  ('seed-variant-shirt-white-m', 'seed-essential-shirt', 'SHIRT-WHITE-M', 'white', 'M', 39000, 12, 3),
  ('seed-variant-shirt-black-l', 'seed-essential-shirt', 'SHIRT-BLACK-L', 'black', 'L', 39000, 8, 2),
  ('seed-variant-pants-denim-m', 'seed-denim-pants', 'PANTS-DENIM-M', 'denim', 'M', 59000, 1, 1)
on conflict ("sku") do nothing;

insert into "Customer" ("id", "email", "name", "phone", "createdAt")
values ('customer-seed', 'customer@example.com', 'Seed Customer', '01000000000', now())
on conflict ("email") do nothing;

insert into "AdminUser" ("id", "email", "name", "roles", "createdAt")
values ('admin-seed', 'ops@example.com', 'Seed Operator', array['OWNER']::"AdminRole"[], now())
on conflict ("email") do nothing;
