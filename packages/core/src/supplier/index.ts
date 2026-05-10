export type SupplierImportStatus = "IMPORTED" | "NEEDS_REVIEW" | "APPROVED" | "REJECTED";

export type SupplierProductCandidate = {
  externalId: string;
  name: string;
  status: SupplierImportStatus;
};
