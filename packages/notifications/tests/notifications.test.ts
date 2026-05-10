import { describe, expect, it } from "vitest";
import { canSendNotification } from "../src/channels";
import { createNotificationJob, dedupeJobs, markJobAttempt } from "../src/jobs";
import { createMockProvider, sendWithFallback } from "../src/providers";
import { renderTemplate } from "../src/templates";

describe("notifications", () => {
  it("renders templates and respects consent", () => {
    expect(renderTemplate({ id: "paid", channel: "sms", purpose: "transactional", body: "{{name}} paid" }, { name: "Kim" })).toBe(
      "Kim paid",
    );
    expect(
      canSendNotification("push", "marketing", {
        transactional: true,
        marketing: true,
        push: false,
      }),
    ).toBe(false);
  });

  it("dedupes jobs and falls back between providers", async () => {
    const job = createNotificationJob({
      idempotencyKey: "order-1:paid",
      templateId: "paid",
      recipient: "01000000000",
    });
    const result = await sendWithFallback([createMockProvider("primary", true), createMockProvider("backup")], {
      idempotencyKey: job.idempotencyKey,
      recipient: job.recipient,
      body: "paid",
    });

    expect(result.accepted).toBe(true);
    expect(result.provider).toBe("backup");
    expect(markJobAttempt(job, result.accepted).status).toBe("SENT");
    expect(dedupeJobs([job, job])).toHaveLength(1);
  });
});
