export type CustomerInquiryStatus = "OPEN" | "ANSWERED" | "CLOSED";

export type CustomerInquiry = {
  id: string;
  customerId: string;
  subject: string;
  body: string;
  status: CustomerInquiryStatus;
  createdAt: Date;
  answeredAt?: Date;
};

export function createInquiry(input: Omit<CustomerInquiry, "status" | "createdAt">): CustomerInquiry {
  assertRequired(input.id, "id");
  assertRequired(input.customerId, "customerId");
  assertRequired(input.subject, "subject");
  assertRequired(input.body, "body");

  return {
    ...input,
    subject: input.subject.trim(),
    body: input.body.trim(),
    status: "OPEN",
    createdAt: new Date(),
  };
}

export function transitionInquiry(
  inquiry: CustomerInquiry,
  nextStatus: CustomerInquiryStatus,
  now = new Date(),
): CustomerInquiry {
  if (inquiry.status === "CLOSED" && nextStatus !== "CLOSED") {
    throw new Error("closed inquiries cannot be reopened");
  }

  if (inquiry.status === "OPEN" && nextStatus === "CLOSED") {
    throw new Error("open inquiries must be answered before closing");
  }

  return {
    ...inquiry,
    status: nextStatus,
    answeredAt: nextStatus === "ANSWERED" ? now : inquiry.answeredAt,
  };
}

function assertRequired(value: string, field: string): void {
  if (!value.trim()) {
    throw new Error(`${field} is required`);
  }
}
