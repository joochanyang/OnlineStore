import type { ApiEnvelope, ApiErrorEnvelope } from "@commerce/api/contracts";
import { clientIpFromRequest, userAgentFromRequest } from "@commerce/auth";
import type { ConsentType } from "@commerce/db";
import { NextResponse } from "next/server";
import { signupCustomer, type CustomerSignupConsent } from "../../../../lib/auth-context";

type SignupRequest = {
  email?: string;
  name?: string;
  phone?: string;
  password?: string;
  consents?: Array<{ type: string; granted: boolean }>;
};

const VALID_CONSENT_TYPES: readonly ConsentType[] = [
  "TERMS",
  "PRIVACY",
  "MARKETING_SMS",
  "MARKETING_EMAIL",
  "MARKETING_PUSH",
  "AGE_14_PLUS",
];

export async function POST(request: Request) {
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();

  let payload: SignupRequest;
  try {
    payload = (await request.json()) as SignupRequest;
  } catch {
    return error(requestId, 400, "INVALID_PAYLOAD", "request body must be JSON");
  }

  const email = payload.email?.trim();
  const name = payload.name?.trim();
  const password = payload.password ?? "";
  if (!email || !name || !password) {
    return error(requestId, 400, "MISSING_FIELDS", "email, name, password are required");
  }

  const consents: CustomerSignupConsent[] = (payload.consents ?? [])
    .filter((c) => VALID_CONSENT_TYPES.includes(c.type as ConsentType))
    .map((c) => ({ type: c.type as ConsentType, granted: Boolean(c.granted) }));

  const outcome = await signupCustomer({
    email,
    name,
    phone: payload.phone,
    password,
    consents,
    ip: clientIpFromRequest(request),
    userAgent: userAgentFromRequest(request),
  });

  if (!outcome.ok) {
    if (outcome.reason === "weak_password") {
      return error(requestId, 422, "WEAK_PASSWORD", "password does not meet policy");
    }
    if (outcome.reason === "missing_required_consent") {
      return error(requestId, 422, "CONSENT_REQUIRED", "TERMS and PRIVACY consents are required");
    }
    return error(requestId, 409, "EMAIL_IN_USE", "email already registered");
  }

  const body: ApiEnvelope<{ customer: { id: string; email: string; name: string } }> = {
    requestId,
    data: {
      customer: {
        id: outcome.account.id,
        email: outcome.account.email,
        name: outcome.account.name,
      },
    },
  };

  const response = NextResponse.json(body, { status: 201 });
  for (const cookie of outcome.cookies) {
    response.headers.append("set-cookie", cookie);
  }
  return response;
}

function error(requestId: string, status: number, code: string, message: string) {
  const body: ApiErrorEnvelope = { requestId, error: { code, message } };
  return NextResponse.json(body, { status });
}
