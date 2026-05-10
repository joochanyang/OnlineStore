import { AsyncLocalStorage } from "node:async_hooks";
import type { ActorType } from "../generated/client/client";

/**
 * Per-request actor context for audit logging. Routes wrap their work in
 * `withAuditContext({ actorType, actorId, ip, userAgent, requestId })` so DB writes
 * downstream can pick up actor identity without threading it through every call.
 *
 * `insertAuditLog` (in index.ts) consults this storage when its input omits actor
 * fields. This keeps individual `await insertAuditLog({ action })` calls terse.
 */

export type AuditActorContext = {
  actorType: ActorType;
  actorId?: string;
  ip?: string;
  userAgent?: string;
  requestId?: string;
};

const storage = new AsyncLocalStorage<AuditActorContext>();

export function withAuditContext<T>(actor: AuditActorContext, fn: () => Promise<T> | T): Promise<T> {
  return Promise.resolve(storage.run(actor, fn));
}

export function getAuditActor(): AuditActorContext | undefined {
  return storage.getStore();
}

export function requireAuditActor(): AuditActorContext {
  const actor = storage.getStore();
  if (!actor) {
    throw new Error("audit actor context is required (wrap call in withAuditContext)");
  }
  return actor;
}
