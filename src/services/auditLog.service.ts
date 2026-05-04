import { randomUUID } from "crypto";
import { collections, firestoreServerTimestamp, nowTimestamp, toFirestoreMetadata } from "../config/firebase.js";

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
  const id = randomUUID();

  await collections.auditLogs().doc(id).set({
    id,
    businessId,
    reviewId: reviewId ?? null,
    action,
    metadata: toFirestoreMetadata(metadata),
    createdAt: firestoreServerTimestamp(),
    createdAtClient: nowTimestamp()
  });
};
