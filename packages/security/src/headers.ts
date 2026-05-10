/**
 * Security headers builder. Returns a flat Record<string,string> safe to pass into
 * Next.js `headers()` config or to set via `NextResponse.headers.set()`.
 *
 * The CSP is opinionated for a Next.js storefront/admin: allows self + Vercel/Sentry +
 * Toss Payments domains. Override `contentSecurityPolicy` directly when a stricter or
 * looser policy is needed.
 */

export type SecurityHeadersOptions = {
  isProduction: boolean;
  /** Extra hosts allowed for `connect-src` (analytics, AI APIs, etc.). */
  connectExtra?: string[];
  /** Extra hosts allowed for `img-src` (CDN, R2, supplier images). */
  imgExtra?: string[];
  /** Override the full CSP string when needed. */
  contentSecurityPolicy?: string;
};

const DEFAULT_CONNECT = [
  "'self'",
  "https://api.tosspayments.com",
  "https://*.supabase.co",
  "https://*.supabase.in",
  "https://*.sentry.io",
  "https://*.upstash.io",
];

const DEFAULT_IMG = [
  "'self'",
  "data:",
  "blob:",
  "https://*.cloudflarestorage.com",
  "https://imagedelivery.net",
  "https://*.supabase.co",
];

export function buildSecurityHeaders(options: SecurityHeadersOptions): Record<string, string> {
  const csp = options.contentSecurityPolicy ?? buildContentSecurityPolicy(options);

  const headers: Record<string, string> = {
    "Content-Security-Policy": csp,
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(self)",
    "X-DNS-Prefetch-Control": "off",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
  };

  if (options.isProduction) {
    headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains; preload";
  }

  return headers;
}

export function buildContentSecurityPolicy(options: SecurityHeadersOptions): string {
  const connectSrc = unique([...DEFAULT_CONNECT, ...(options.connectExtra ?? [])]);
  const imgSrc = unique([...DEFAULT_IMG, ...(options.imgExtra ?? [])]);

  const directives: Array<[string, string[]]> = [
    ["default-src", ["'self'"]],
    ["base-uri", ["'self'"]],
    ["frame-ancestors", ["'none'"]],
    ["form-action", ["'self'", "https://*.tosspayments.com"]],
    ["object-src", ["'none'"]],
    [
      "script-src",
      [
        "'self'",
        options.isProduction ? "" : "'unsafe-eval'",
        "https://js.tosspayments.com",
        "https://*.vercel-scripts.com",
      ].filter(Boolean),
    ],
    ["style-src", ["'self'", "'unsafe-inline'"]],
    ["img-src", imgSrc],
    ["font-src", ["'self'", "data:"]],
    ["connect-src", connectSrc],
    ["frame-src", ["'self'", "https://*.tosspayments.com"]],
    ["worker-src", ["'self'", "blob:"]],
    ["manifest-src", ["'self'"]],
  ];

  return directives.map(([key, values]) => `${key} ${values.join(" ")}`).join("; ");
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}
