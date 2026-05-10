import { spawn } from "node:child_process";

const webOrigin = process.env.WEB_ORIGIN ?? "http://127.0.0.1:3000";
const adminOrigin = process.env.ADMIN_ORIGIN ?? "http://127.0.0.1:3001";
const adminActorId = process.env.ADMIN_SMOKE_ACTOR_ID ?? "admin-seed";
const startedProcesses = [];

async function main() {
  await ensureServer("web", webOrigin, ["--workspace", "@commerce/web", "run", "dev"]);
  await ensureServer("admin", adminOrigin, ["--workspace", "@commerce/admin", "run", "dev"]);

  const products = await smokeWeb();
  await smokeAdmin(products[0]?.id ?? "seed-essential-shirt");

  console.log("E2E smoke checks passed.");
}

async function smokeWeb() {
  const home = await fetchText(`${webOrigin}/`);
  assertIncludes(home, "상품 상세와 SKU 재고", "web home catalog section");
  assertIncludes(home, "SHIRT-WHITE-M", "web home seed SKU");

  const productsEnvelope = await fetchJson(`${webOrigin}/api/v1/products`);
  assert(Array.isArray(productsEnvelope.data), "products API returns an array");
  assert(productsEnvelope.data.length > 0, "products API returns at least one product");
  assert(
    productsEnvelope.data.some((product) =>
      product.variants?.some((variant) => variant.sku === "SHIRT-WHITE-M"),
    ),
    "products API exposes seed SKU variants",
  );

  const previewEnvelope = await postJson(`${webOrigin}/api/v1/checkout/preview`, {
    customerId: "customer-smoke",
    lines: [{ sku: "SHIRT-WHITE-M", quantity: 1 }],
  });
  assert(previewEnvelope.data.total.amount === 42000, "checkout preview total includes shipping");

  const orderEnvelope = await postJson(`${webOrigin}/api/v1/checkout/orders`, {
    customerId: "customer-smoke",
    lines: [{ sku: "SHIRT-WHITE-M", quantity: 1 }],
    paymentProvider: "mock",
    idempotencyKey: "smoke-web-order",
  }, 201);
  assert(orderEnvelope.data.status === "PENDING_PAYMENT", "checkout order starts pending payment");
  assert(orderEnvelope.data.payment.status === "READY", "checkout order creates a payment intent");

  return productsEnvelope.data;
}

async function smokeAdmin(productId) {
  const loginResponse = await fetchWithTimeout(`${adminOrigin}/api/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ actorId: adminActorId }),
    redirect: "manual",
  });
  assert(loginResponse.status === 303, "admin login redirects after success");

  const sessionCookie = loginResponse.headers.get("set-cookie")?.split(";")[0];
  assert(sessionCookie, "admin login sets a session cookie");

  const home = await fetchText(`${adminOrigin}/`, { cookie: sessionCookie });
  assertIncludes(home, "SKU 재고 관리", "admin home inventory section");
  assertIncludes(home, "상품 상태 변경", "admin home product status section");
  assertIncludes(home, "상품 신규 등록", "admin home product create section");

  const dashboardEnvelope = await fetchJson(`${adminOrigin}/api/v1/dashboard`, {
    cookie: sessionCookie,
  });
  assert(dashboardEnvelope.data.actor.actorId === adminActorId, "admin dashboard resolves smoke actor");
  assert(dashboardEnvelope.data.inventory.length > 0, "admin dashboard returns inventory");

  const statusEnvelope = await patchJson(
    `${adminOrigin}/api/v1/products/${productId}/status`,
    { status: "ACTIVE" },
    { authorization: `Bearer ${adminActorId}` },
  );
  assert(statusEnvelope.data.status === "ACTIVE", "admin product status mutation succeeds");

  const productSlug = `smoke-product-${Date.now()}`;
  const createEnvelope = await postJson(
    `${adminOrigin}/api/v1/products`,
    {
      name: "Smoke Product",
      slug: productSlug,
      description: "Created by the automated smoke harness.",
      status: "DRAFT",
      categorySlugs: ["smoke"],
      imageUrls: ["/products/smoke-product.jpg"],
      variants: [
        {
          sku: `${productSlug}-white-m`,
          color: "white",
          size: "M",
          price: 1000,
          stock: 2,
          safetyStock: 1,
        },
      ],
    },
    201,
    { authorization: `Bearer ${adminActorId}` },
  );
  assert(createEnvelope.data.slug === productSlug, "admin product create returns the created product");
  assert(createEnvelope.data.variants[0]?.sku === `${productSlug.toUpperCase()}-WHITE-M`, "admin product create normalizes SKU");
}

async function ensureServer(name, origin, args) {
  if (await isHealthy(origin)) {
    console.log(`${name} server already running at ${origin}`);
    return;
  }

  console.log(`Starting ${name} server at ${origin}`);
  const child = spawn("npm", args, {
    cwd: new URL("..", import.meta.url),
    env: { ...process.env, HOSTNAME: "127.0.0.1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  startedProcesses.push(child);
  let exitStatus;
  child.once("exit", (code, signal) => {
    exitStatus = { code, signal };
  });

  child.stdout.on("data", (chunk) => {
    const line = chunk.toString().trim();
    if (line) {
      console.log(`[${name}] ${line}`);
    }
  });
  child.stderr.on("data", (chunk) => {
    const line = chunk.toString().trim();
    if (line) {
      console.error(`[${name}] ${line}`);
    }
  });

  await waitForHealthy(origin, 45_000, () => exitStatus);
}

async function isHealthy(origin) {
  try {
    const response = await fetchWithTimeout(origin, { redirect: "manual" });
    return response.status < 500;
  } catch {
    return false;
  }
}

async function waitForHealthy(origin, timeoutMs, getExitStatus = () => undefined) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const exitStatus = getExitStatus();
    if (exitStatus) {
      throw new Error(
        `Server process for ${origin} exited before becoming healthy: code=${exitStatus.code}, signal=${exitStatus.signal}`,
      );
    }

    if (await isHealthy(origin)) {
      return;
    }

    await sleep(500);
  }

  throw new Error(`Timed out waiting for ${origin}`);
}

async function fetchText(url, headers = {}) {
  const response = await fetchWithTimeout(url, { headers });
  assert(response.ok, `${url} responded with ${response.status}`);

  return response.text();
}

async function fetchJson(url, headers = {}) {
  const response = await fetchWithTimeout(url, { headers });
  assert(response.ok, `${url} responded with ${response.status}`);

  return response.json();
}

async function postJson(url, body, expectedStatus = 200, headers = {}) {
  const response = await fetch(url, {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5_000),
  });
  assert(response.status === expectedStatus, `${url} responded with ${response.status}`);

  return response.json();
}

async function patchJson(url, body, headers = {}) {
  const response = await fetch(url, {
    method: "PATCH",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5_000),
  });
  assert(response.ok, `${url} responded with ${response.status}`);

  return response.json();
}

async function fetchWithTimeout(url, options = {}) {
  return fetch(url, {
    ...options,
    signal: options.signal ?? AbortSignal.timeout(5_000),
  });
}

function assertIncludes(value, expected, label) {
  assert(value.includes(expected), `${label} should include "${expected}"`);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function cleanup() {
  await Promise.all(
    startedProcesses.map(
      (child) =>
        new Promise((resolve) => {
          if (child.killed) {
            resolve();
            return;
          }

          child.once("exit", resolve);
          child.kill("SIGTERM");
          setTimeout(() => {
            if (!child.killed) {
              child.kill("SIGKILL");
            }
            resolve();
          }, 2_000).unref();
        }),
    ),
  );
}

process.on("SIGINT", async () => {
  await cleanup();
  process.exit(130);
});
process.on("SIGTERM", async () => {
  await cleanup();
  process.exit(143);
});

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(cleanup);
