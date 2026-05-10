import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Self-contained RFC 6238 TOTP (HMAC-SHA1, 30s step, 6 digits) for admin MFA.
 * Compatible with Google Authenticator, 1Password, Authy, etc.
 *
 * No external dependency: HMAC + Buffer arithmetic only.
 */

const DEFAULT_STEP_SECONDS = 30;
const DEFAULT_DIGITS = 6;
const RFC4648_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export type TotpAlgorithm = "SHA1" | "SHA256" | "SHA512";

export type TotpConfig = {
  algorithm?: TotpAlgorithm;
  stepSeconds?: number;
  digits?: number;
};

export function generateTotpSecret(byteLength = 20): string {
  return base32Encode(randomBytes(byteLength));
}

export function buildOtpAuthUrl(input: {
  issuer: string;
  account: string;
  secretBase32: string;
  config?: TotpConfig;
}): string {
  const algorithm = input.config?.algorithm ?? "SHA1";
  const digits = input.config?.digits ?? DEFAULT_DIGITS;
  const step = input.config?.stepSeconds ?? DEFAULT_STEP_SECONDS;

  const params = new URLSearchParams({
    secret: input.secretBase32,
    issuer: input.issuer,
    algorithm,
    digits: String(digits),
    period: String(step),
  });

  const label = `${encodeURIComponent(input.issuer)}:${encodeURIComponent(input.account)}`;
  return `otpauth://totp/${label}?${params.toString()}`;
}

export type TotpVerifyInput = {
  token: string;
  secretBase32: string;
  /** Accept previous + next windows to absorb clock drift. Default 1 window each side. */
  window?: number;
  config?: TotpConfig;
  /** Override `Date.now()` for testing. */
  now?: number;
};

export function verifyTotp(input: TotpVerifyInput): boolean {
  const stepSeconds = input.config?.stepSeconds ?? DEFAULT_STEP_SECONDS;
  const digits = input.config?.digits ?? DEFAULT_DIGITS;
  const algorithm = input.config?.algorithm ?? "SHA1";
  const window = input.window ?? 1;
  const nowSec = Math.floor((input.now ?? Date.now()) / 1000);
  const counter = Math.floor(nowSec / stepSeconds);

  const trimmed = input.token.replace(/\s+/g, "");
  if (!/^\d+$/.test(trimmed) || trimmed.length !== digits) {
    return false;
  }

  const secret = base32Decode(input.secretBase32);

  for (let offset = -window; offset <= window; offset++) {
    const candidate = generateTotp(secret, counter + offset, algorithm, digits);
    if (constantTimeStringEqual(candidate, trimmed)) {
      return true;
    }
  }

  return false;
}

export function generateCurrentTotp(secretBase32: string, config?: TotpConfig): string {
  const stepSeconds = config?.stepSeconds ?? DEFAULT_STEP_SECONDS;
  const algorithm = config?.algorithm ?? "SHA1";
  const digits = config?.digits ?? DEFAULT_DIGITS;
  const counter = Math.floor(Date.now() / 1000 / stepSeconds);
  return generateTotp(base32Decode(secretBase32), counter, algorithm, digits);
}

function generateTotp(secret: Buffer, counter: number, algorithm: TotpAlgorithm, digits: number): string {
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeBigUInt64BE(BigInt(counter));

  const hmacAlgo =
    algorithm === "SHA512" ? "sha512" : algorithm === "SHA256" ? "sha256" : "sha1";
  const hmac = createHmac(hmacAlgo, secret).update(counterBuf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const truncated =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  const code = truncated % 10 ** digits;
  return code.toString().padStart(digits, "0");
}

function constantTimeStringEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";

  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += RFC4648_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += RFC4648_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

function base32Decode(input: string): Buffer {
  const cleaned = input.replace(/=+$/, "").replace(/\s+/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (const char of cleaned) {
    const idx = RFC4648_ALPHABET.indexOf(char);
    if (idx === -1) {
      throw new Error(`invalid base32 character: ${char}`);
    }
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}
