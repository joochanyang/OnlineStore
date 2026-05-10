export type NotificationJob = {
  idempotencyKey: string;
  templateId: string;
  recipient: string;
  variables?: Record<string, string | number>;
  attempts: number;
  status: "PENDING" | "SENT" | "FAILED" | "SKIPPED";
};

export function createNotificationJob(input: Omit<NotificationJob, "attempts" | "status">): NotificationJob {
  assertRequired(input.idempotencyKey, "idempotencyKey");
  assertRequired(input.templateId, "templateId");
  assertRequired(input.recipient, "recipient");

  return {
    ...input,
    attempts: 0,
    status: "PENDING",
  };
}

export function markJobAttempt(job: NotificationJob, accepted: boolean): NotificationJob {
  return {
    ...job,
    attempts: job.attempts + 1,
    status: accepted ? "SENT" : "FAILED",
  };
}

export function dedupeJobs(jobs: NotificationJob[]): NotificationJob[] {
  const seen = new Set<string>();

  return jobs.filter((job) => {
    if (seen.has(job.idempotencyKey)) {
      return false;
    }

    seen.add(job.idempotencyKey);
    return true;
  });
}

function assertRequired(value: string, field: string): void {
  if (!value.trim()) {
    throw new Error(`${field} is required`);
  }
}
