export const REVIEW_STATUS_VALUES = [
  "NEW",
  "SENT_TO_WHATSAPP",
  "APPROVED",
  "POSTED",
  "REJECTED",
  "ERROR"
] as const;

export type ReviewStatus = (typeof REVIEW_STATUS_VALUES)[number];

export interface UserRecord {
  id: string;
  email: string;
  createdAt: Date;
}

export interface BusinessRecord {
  id: string;
  userId: string;
  googleAccountId: string;
  googleLocationId: string;
  businessName: string;
  whatsappNumber: string;
  googleRefreshTokenEncrypted: string;
  createdAt: Date;
}

export interface ReviewRecord {
  id: string;
  businessId: string;
  googleReviewId: string;
  reviewerName: string;
  rating: number;
  comment: string;
  createTime: Date;
  updateTime: Date;
  aiSuggestedReply: string | null;
  status: ReviewStatus;
  createdAt: Date;
}

export interface ApprovalTokenRecord {
  id: string;
  reviewId: string;
  token: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
}

export interface AuditLogRecord {
  id: string;
  businessId: string;
  reviewId: string | null;
  action: string;
  metadata: unknown;
  createdAt: Date;
}
