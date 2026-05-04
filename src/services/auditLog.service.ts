import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

interface AuditLogInput {
  businessId: string;
  reviewId?: string;
  action: string;
  metadata: Prisma.InputJsonValue;
}

export const writeAuditLog = async ({
  businessId,
  reviewId,
  action,
  metadata
}: AuditLogInput): Promise<void> => {
  await prisma.auditLog.create({
    data: {
      businessId,
      reviewId,
      action,
      metadata
    }
  });
};
