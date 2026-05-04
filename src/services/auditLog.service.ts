import { createAuditLog } from "../lib/firestoreStore.js";

interface AuditLogInput {
  businessId: string;
  reviewId?: string;
  action: string;
  metadata: unknown;
}

export const writeAuditLog = async ({
  businessId,
  reviewId,
  action,
  metadata
}: AuditLogInput): Promise<void> => {
  await createAuditLog({
    businessId,
    reviewId,
    action,
    metadata
  });
};
