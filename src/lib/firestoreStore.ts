import { randomUUID, createHash } from "crypto";
import { collections, asDate, asNullableDate, firestoreServerTimestamp, nowTimestamp } from "../config/firebase.js";
import type {
  ApprovalTokenRecord,
  AuditLogRecord,
  BusinessRecord,
  ReviewRecord,
  ReviewStatus,
  UserRecord
} from "../types/domain.js";

const toStableHashId = (raw: string): string =>
  createHash("sha256").update(raw).digest("hex").slice(0, 32);

const normalizeBusinessKey = (googleAccountId: string, googleLocationId: string): string =>
  `biz_${toStableHashId(`${googleAccountId}|${googleLocationId}`)}`;

const mapUser = (id: string, data: Record<string, unknown>): UserRecord => ({
  id,
  email: String(data.email ?? ""),
  createdAt: asDate(data.createdAt)
});

const mapBusiness = (id: string, data: Record<string, unknown>): BusinessRecord => ({
  id,
  userId: String(data.userId ?? ""),
  googleAccountId: String(data.googleAccountId ?? ""),
  googleLocationId: String(data.googleLocationId ?? ""),
  businessName: String(data.businessName ?? ""),
  whatsappNumber: String(data.whatsappNumber ?? ""),
  googleRefreshTokenEncrypted: String(data.googleRefreshTokenEncrypted ?? ""),
  createdAt: asDate(data.createdAt)
});

const mapReview = (id: string, data: Record<string, unknown>): ReviewRecord => ({
  id,
  businessId: String(data.businessId ?? ""),
  googleReviewId: String(data.googleReviewId ?? ""),
  reviewerName: String(data.reviewerName ?? ""),
  rating: Number(data.rating ?? 0),
  comment: String(data.comment ?? ""),
  createTime: asDate(data.createTime),
  updateTime: asDate(data.updateTime),
  aiSuggestedReply: typeof data.aiSuggestedReply === "string" ? data.aiSuggestedReply : null,
  status: String(data.status ?? "NEW") as ReviewStatus,
  createdAt: asDate(data.createdAt)
});

const mapApprovalToken = (id: string, data: Record<string, unknown>): ApprovalTokenRecord => ({
  id,
  reviewId: String(data.reviewId ?? ""),
  token: String(data.token ?? ""),
  expiresAt: asDate(data.expiresAt),
  usedAt: asNullableDate(data.usedAt),
  createdAt: asDate(data.createdAt)
});

const mapAuditLog = (id: string, data: Record<string, unknown>): AuditLogRecord => ({
  id,
  businessId: String(data.businessId ?? ""),
  reviewId: data.reviewId ? String(data.reviewId) : null,
  action: String(data.action ?? ""),
  metadata: data.metadata ?? {},
  createdAt: asDate(data.createdAt)
});

const lowercaseEmail = (value: string): string => value.trim().toLowerCase();

export const upsertUserByEmail = async (email: string): Promise<UserRecord> => {
  const normalizedEmail = lowercaseEmail(email);
  const userId = `usr_${toStableHashId(normalizedEmail)}`;
  const reference = collections.users().doc(userId);
  const snapshot = await reference.get();

  if (snapshot.exists) {
    return mapUser(snapshot.id, snapshot.data() as Record<string, unknown>);
  }

  const createdAt = nowTimestamp();

  await reference.set({
    id: userId,
    email: normalizedEmail,
    createdAt,
    createdAtServer: firestoreServerTimestamp()
  });

  return {
    id: userId,
    email: normalizedEmail,
    createdAt
  };
};

export const upsertBusinessByGoogleMapping = async (input: {
  userId: string;
  googleAccountId: string;
  googleLocationId: string;
  businessName: string;
  whatsappNumber: string;
  googleRefreshTokenEncrypted: string;
}): Promise<BusinessRecord> => {
  const businessId = normalizeBusinessKey(input.googleAccountId, input.googleLocationId);
  const reference = collections.businesses().doc(businessId);
  const snapshot = await reference.get();
  const createdAt = snapshot.exists
    ? asDate((snapshot.data() as Record<string, unknown>).createdAt)
    : nowTimestamp();

  await reference.set({
    id: businessId,
    userId: input.userId,
    googleAccountId: input.googleAccountId,
    googleLocationId: input.googleLocationId,
    businessName: input.businessName,
    whatsappNumber: input.whatsappNumber,
    googleRefreshTokenEncrypted: input.googleRefreshTokenEncrypted,
    createdAt,
    updatedAt: nowTimestamp(),
    updatedAtServer: firestoreServerTimestamp()
  });

  return {
    id: businessId,
    userId: input.userId,
    googleAccountId: input.googleAccountId,
    googleLocationId: input.googleLocationId,
    businessName: input.businessName,
    whatsappNumber: input.whatsappNumber,
    googleRefreshTokenEncrypted: input.googleRefreshTokenEncrypted,
    createdAt
  };
};

export const listBusinesses = async (): Promise<BusinessRecord[]> => {
  const snapshot = await collections.businesses().get();

  return snapshot.docs
    .map((document) => mapBusiness(document.id, document.data() as Record<string, unknown>))
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
};

export const getBusinessById = async (businessId: string): Promise<BusinessRecord | null> => {
  const snapshot = await collections.businesses().doc(businessId).get();

  if (!snapshot.exists) {
    return null;
  }

  return mapBusiness(snapshot.id, snapshot.data() as Record<string, unknown>);
};

export const updateBusinessWhatsapp = async (
  businessId: string,
  whatsappNumber: string
): Promise<BusinessRecord | null> => {
  const existing = await getBusinessById(businessId);

  if (!existing) {
    return null;
  }

  await collections.businesses().doc(businessId).set(
    {
      whatsappNumber,
      updatedAt: nowTimestamp(),
      updatedAtServer: firestoreServerTimestamp()
    },
    {
      merge: true
    }
  );

  return {
    ...existing,
    whatsappNumber
  };
};

export const findUserById = async (userId: string): Promise<UserRecord | null> => {
  const snapshot = await collections.users().doc(userId).get();

  if (!snapshot.exists) {
    return null;
  }

  return mapUser(snapshot.id, snapshot.data() as Record<string, unknown>);
};

export const findReviewByBusinessAndGoogleId = async (
  businessId: string,
  googleReviewId: string
): Promise<ReviewRecord | null> => {
  const snapshot = await collections.reviews()
    .where("businessId", "==", businessId)
    .where("googleReviewId", "==", googleReviewId)
    .limit(1)
    .get();

  if (snapshot.empty) {
    return null;
  }

  const document = snapshot.docs[0];
  if (!document) {
    return null;
  }

  return mapReview(document.id, document.data() as Record<string, unknown>);
};

export const createReview = async (input: {
  businessId: string;
  googleReviewId: string;
  reviewerName: string;
  rating: number;
  comment: string;
  createTime: Date;
  updateTime: Date;
  status: ReviewStatus;
}): Promise<ReviewRecord> => {
  const id = randomUUID();
  const createdAt = nowTimestamp();

  await collections.reviews().doc(id).set({
    id,
    businessId: input.businessId,
    googleReviewId: input.googleReviewId,
    reviewerName: input.reviewerName,
    rating: input.rating,
    comment: input.comment,
    createTime: input.createTime,
    updateTime: input.updateTime,
    aiSuggestedReply: null,
    status: input.status,
    createdAt,
    createdAtServer: firestoreServerTimestamp(),
    updatedAt: nowTimestamp(),
    updatedAtServer: firestoreServerTimestamp()
  });

  return {
    id,
    businessId: input.businessId,
    googleReviewId: input.googleReviewId,
    reviewerName: input.reviewerName,
    rating: input.rating,
    comment: input.comment,
    createTime: input.createTime,
    updateTime: input.updateTime,
    aiSuggestedReply: null,
    status: input.status,
    createdAt
  };
};

export const updateReviewFields = async (
  reviewId: string,
  patch: Partial<
    Pick<
      ReviewRecord,
      "aiSuggestedReply" | "status" | "updateTime" | "comment" | "reviewerName" | "rating"
    >
  >
): Promise<void> => {
  const payload: Record<string, unknown> = {
    updatedAt: nowTimestamp(),
    updatedAtServer: firestoreServerTimestamp()
  };

  if (patch.aiSuggestedReply !== undefined) {
    payload.aiSuggestedReply = patch.aiSuggestedReply;
  }

  if (patch.status !== undefined) {
    payload.status = patch.status;
  }

  if (patch.updateTime !== undefined) {
    payload.updateTime = patch.updateTime;
  }

  if (patch.comment !== undefined) {
    payload.comment = patch.comment;
  }

  if (patch.reviewerName !== undefined) {
    payload.reviewerName = patch.reviewerName;
  }

  if (patch.rating !== undefined) {
    payload.rating = patch.rating;
  }

  await collections.reviews().doc(reviewId).set(payload, { merge: true });
};

export const getReviewById = async (reviewId: string): Promise<ReviewRecord | null> => {
  const snapshot = await collections.reviews().doc(reviewId).get();

  if (!snapshot.exists) {
    return null;
  }

  return mapReview(snapshot.id, snapshot.data() as Record<string, unknown>);
};

export const listReviews = async (): Promise<ReviewRecord[]> => {
  const snapshot = await collections.reviews().get();

  return snapshot.docs
    .map((document) => mapReview(document.id, document.data() as Record<string, unknown>))
    .sort((a, b) => b.createTime.getTime() - a.createTime.getTime());
};

export const listReviewsByBusinessId = async (businessId: string): Promise<ReviewRecord[]> => {
  const snapshot = await collections.reviews().where("businessId", "==", businessId).get();

  return snapshot.docs
    .map((document) => mapReview(document.id, document.data() as Record<string, unknown>))
    .sort((a, b) => b.createTime.getTime() - a.createTime.getTime());
};

export const createApprovalToken = async (input: {
  reviewId: string;
  businessId: string;
  token: string;
  expiresAt: Date;
}): Promise<ApprovalTokenRecord> => {
  const id = randomUUID();
  const createdAt = nowTimestamp();

  await collections.approvalTokens().doc(id).set({
    id,
    reviewId: input.reviewId,
    businessId: input.businessId,
    token: input.token,
    expiresAt: input.expiresAt,
    usedAt: null,
    createdAt,
    createdAtServer: firestoreServerTimestamp()
  });

  return {
    id,
    reviewId: input.reviewId,
    token: input.token,
    expiresAt: input.expiresAt,
    usedAt: null,
    createdAt
  };
};

export const findApprovalTokenByToken = async (
  token: string
): Promise<(ApprovalTokenRecord & { businessId: string }) | null> => {
  const snapshot = await collections.approvalTokens().where("token", "==", token).limit(1).get();

  if (snapshot.empty) {
    return null;
  }

  const document = snapshot.docs[0];
  if (!document) {
    return null;
  }

  const mapped = mapApprovalToken(document.id, document.data() as Record<string, unknown>);

  return {
    ...mapped,
    businessId: String(document.data().businessId ?? "")
  };
};

export const markApprovalTokenUsed = async (tokenId: string): Promise<void> => {
  await collections.approvalTokens().doc(tokenId).set(
    {
      usedAt: nowTimestamp(),
      usedAtServer: firestoreServerTimestamp()
    },
    {
      merge: true
    }
  );
};

export const listApprovalTokensByReviewId = async (
  reviewId: string,
  limit = 1
): Promise<ApprovalTokenRecord[]> => {
  const snapshot = await collections.approvalTokens().where("reviewId", "==", reviewId).get();

  return snapshot.docs
    .map((document) => mapApprovalToken(document.id, document.data() as Record<string, unknown>))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, limit);
};

export const listAuditLogsByBusinessId = async (businessId: string): Promise<AuditLogRecord[]> => {
  const snapshot = await collections.auditLogs().where("businessId", "==", businessId).get();

  return snapshot.docs
    .map((document) => mapAuditLog(document.id, document.data() as Record<string, unknown>))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
};

export const countUsers = async (): Promise<number> => {
  const snapshot = await collections.users().count().get();
  return snapshot.data().count;
};

export const countReviews = async (): Promise<number> => {
  const snapshot = await collections.reviews().count().get();
  return snapshot.data().count;
};
