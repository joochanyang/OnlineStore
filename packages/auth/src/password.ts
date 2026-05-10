import { hash as argon2Hash, verify as argon2Verify } from "@node-rs/argon2";

/**
 * OWASP-recommended Argon2id parameters as of 2025. Targeted at ~50 ms per hash on
 * commodity x86_64. Tune `memoryCost` upward as hardware improves.
 *
 * Algorithm defaults to Argon2id in @node-rs/argon2 v2; we leave it implicit to avoid
 * importing the const enum (incompatible with `isolatedModules`).
 */
const ARGON2_PARAMS = {
  memoryCost: 19_456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
} as const;

const MIN_PASSWORD_LENGTH = 10;
const MAX_PASSWORD_LENGTH = 256;

export type PasswordPolicyViolation =
  | "too_short"
  | "too_long"
  | "common_password"
  | "missing_letter"
  | "missing_number";

export type PasswordPolicyResult =
  | { ok: true }
  | { ok: false; violations: PasswordPolicyViolation[] };

const COMMON_PASSWORDS = new Set([
  "password",
  "password1",
  "password123",
  "qwerty",
  "qwerty123",
  "12345678",
  "123456789",
  "1234567890",
  "111111",
  "letmein",
  "iloveyou",
  "admin1234",
]);

export function validatePasswordPolicy(password: string): PasswordPolicyResult {
  const violations: PasswordPolicyViolation[] = [];

  if (password.length < MIN_PASSWORD_LENGTH) {
    violations.push("too_short");
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    violations.push("too_long");
  }
  if (!/[a-zA-Z]/.test(password)) {
    violations.push("missing_letter");
  }
  if (!/[0-9]/.test(password)) {
    violations.push("missing_number");
  }
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    violations.push("common_password");
  }

  return violations.length === 0 ? { ok: true } : { ok: false, violations };
}

export async function hashPassword(plain: string): Promise<string> {
  const policy = validatePasswordPolicy(plain);
  if (!policy.ok) {
    throw new Error(`weak password: ${policy.violations.join(",")}`);
  }
  return argon2Hash(plain, ARGON2_PARAMS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  if (!hash) {
    return false;
  }
  try {
    return await argon2Verify(hash, plain);
  } catch {
    return false;
  }
}

/**
 * Returns true if the stored hash was generated with weaker params and should be
 * re-hashed on the next successful login. Detects parameter drift over time.
 */
export function passwordNeedsRehash(hash: string): boolean {
  if (!hash.startsWith("$argon2id$")) {
    return true;
  }
  const memoryMatch = hash.match(/m=(\d+)/);
  const timeMatch = hash.match(/t=(\d+)/);
  if (!memoryMatch || !timeMatch) {
    return true;
  }
  const m = Number(memoryMatch[1]);
  const t = Number(timeMatch[1]);
  return m < ARGON2_PARAMS.memoryCost || t < ARGON2_PARAMS.timeCost;
}
