export type ActorType = "ADMIN" | "CUSTOMER" | "SYSTEM";

/**
 * Minimal authenticated session payload. Both admin and customer flows produce one of
 * these. Permission checks remain in `@commerce/core/auth` (admin) or downstream
 * customer-specific helpers.
 */
export type AuthenticatedSession = {
  actorType: ActorType;
  actorId: string;
  email: string;
  /** Opaque session id used for CSRF binding and refresh-token family. */
  sessionId: string;
  /** Whether MFA was satisfied for this session. */
  mfaVerified: boolean;
};
