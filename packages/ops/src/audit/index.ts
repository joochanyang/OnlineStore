export type AuditLogEntry = {
  actorId: string;
  action: string;
  targetId: string;
  createdAt: Date;
  before?: unknown;
  after?: unknown;
};

export function createAuditLogEntry(input: Omit<AuditLogEntry, "createdAt"> & { createdAt?: Date }): AuditLogEntry {
  assertRequired(input.actorId, "actorId");
  assertRequired(input.action, "action");
  assertRequired(input.targetId, "targetId");

  return {
    ...input,
    action: input.action.trim(),
    createdAt: input.createdAt ?? new Date(),
  };
}

export function filterAuditTrail(entries: AuditLogEntry[], targetId: string): AuditLogEntry[] {
  return entries
    .filter((entry) => entry.targetId === targetId)
    .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());
}

function assertRequired(value: string, field: string): void {
  if (!value.trim()) {
    throw new Error(`${field} is required`);
  }
}
