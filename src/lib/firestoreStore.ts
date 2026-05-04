import { createHash, randomUUID } from "crypto";
import { supabase } from "../config/supabase.js";
import type {
  ApprovalTokenRecord,
  AuditLogRecord,
  BusinessRecord,
  ReviewRecord,
  ReviewStatus,
  UserRecord
} from "../types/domain.js";

const TABLE_USERS = "review_assistant_users";
const TABLE_BUSINESSES = "review_assistant_businesses";
const TABLE_REVIEWS = "review_assistant_reviews";
const TABLE_APPROVAL_TOKENS = "review_assistant_approval_tokens";
const TABLE_AUDIT_LOGS = "review_assistant_audit_logs";

interface UserRow {
  id: string;
  email: string;
  created_at: string;
}

interface BusinessRow {
  id: string;
  user_id: string;
  google_account_id: string;
  google_location_id: string;
  business_name: string;
  whatsapp_number: string;
  google_refresh_token_encrypted: string;
  created_at: string;
}

interface ReviewRow {
  id: string;
  business_id: string;
  google_review_id: string;
  reviewer_name: string;
  rating: number;
  comment: string;
  create_time: string;
  update_time: string;
  ai_suggested_reply: string | null;
  status: ReviewStatus;
  created_at: string;
}

interface ApprovalTokenRow {
  id: string;
  review_id: string;
  business_id: string;
  token: string;
  expires_at: string;
  used_at: string | null;
  created_at: string;
}

interface AuditLogRow {
  id: string;
  business_id: string;
  review_id: string | null;
  action: string;
  metadata: unknown;
  created_at: string;
}

const toStableHashId = (raw: string): string =>
  createHash("sha256").update(raw).digest("hex").slice(0, 32);

const normalizeBusinessKey = (googleAccountId: string, googleLocationId: string): string =>
  `biz_${toStableHashId(`${googleAccountId}|${googleLocationId}`)}`;

const lowercaseEmail = (value: string): string => value.trim().toLowerCase();

const asDate = (value: string | null | undefined, fallback = new Date()): Date => {
  if (!value) {
    return fallback;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return fallback;
  }

  return parsed;
};

const asNullableDate = (value: string | null | undefined): Date | null => {
  if (!value) {
    return null;
  }

  return asDate(value);
};

const assertNoError = (error: { message: string } | null, context: string): void => {
  if (error) {
    throw new Error(`Supabase query failed (${context}): ${error.message}`);
  }
};

const mapUser = (row: UserRow): UserRecord => ({
  id: row.id,
  email: row.email,
  createdAt: asDate(row.created_at)
});

const mapBusiness = (row: BusinessRow): BusinessRecord => ({
  id: row.id,
  userId: row.user_id,
  googleAccountId: row.google_account_id,
  googleLocationId: row.google_location_id,
  businessName: row.business_name,
  whatsappNumber: row.whatsapp_number,
  googleRefreshTokenEncrypted: row.google_refresh_token_encrypted,
  createdAt: asDate(row.created_at)
});

const mapReview = (row: ReviewRow): ReviewRecord => ({
  id: row.id,
  businessId: row.business_id,
  googleReviewId: row.google_review_id,
  reviewerName: row.reviewer_name,
  rating: Number(row.rating),
  comment: row.comment,
  createTime: asDate(row.create_time),
  updateTime: asDate(row.update_time),
  aiSuggestedReply: row.ai_suggested_reply,
  status: row.status,
  createdAt: asDate(row.created_at)
});

const mapApprovalToken = (row: ApprovalTokenRow): ApprovalTokenRecord => ({
  id: row.id,
  reviewId: row.review_id,
  token: row.token,
  expiresAt: asDate(row.expires_at),
  usedAt: asNullableDate(row.used_at),
  createdAt: asDate(row.created_at)
});

const mapAuditLog = (row: AuditLogRow): AuditLogRecord => ({
  id: row.id,
  businessId: row.business_id,
  reviewId: row.review_id,
  action: row.action,
  metadata: row.metadata,
  createdAt: asDate(row.created_at)
});

export const upsertUserByEmail = async (email: string): Promise<UserRecord> => {
  const normalizedEmail = lowercaseEmail(email);
  const userId = `usr_${toStableHashId(normalizedEmail)}`;

  const { data, error } = await supabase
    .from(TABLE_USERS)
    .upsert({
      id: userId,
      email: normalizedEmail
    }, { onConflict: "id" })
    .select("id, email, created_at")
    .single<UserRow>();

  assertNoError(error, "upsert user");
  if (!data) {
    throw new Error("Supabase query failed (upsert user): no row returned");
  }

  return mapUser(data);
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

  const { data, error } = await supabase
    .from(TABLE_BUSINESSES)
    .upsert(
      {
        id: businessId,
        user_id: input.userId,
        google_account_id: input.googleAccountId,
        google_location_id: input.googleLocationId,
        business_name: input.businessName,
        whatsapp_number: input.whatsappNumber,
        google_refresh_token_encrypted: input.googleRefreshTokenEncrypted
      },
      { onConflict: "id" }
    )
    .select(
      "id, user_id, google_account_id, google_location_id, business_name, whatsapp_number, google_refresh_token_encrypted, created_at"
    )
    .single<BusinessRow>();

  assertNoError(error, "upsert business");
  if (!data) {
    throw new Error("Supabase query failed (upsert business): no row returned");
  }

  return mapBusiness(data);
};

export const listBusinesses = async (): Promise<BusinessRecord[]> => {
  const { data, error } = await supabase
    .from(TABLE_BUSINESSES)
    .select(
      "id, user_id, google_account_id, google_location_id, business_name, whatsapp_number, google_refresh_token_encrypted, created_at"
    )
    .order("created_at", { ascending: true });

  assertNoError(error, "list businesses");

  return (data ?? []).map((row) => mapBusiness(row as BusinessRow));
};

export const getBusinessById = async (businessId: string): Promise<BusinessRecord | null> => {
  const { data, error } = await supabase
    .from(TABLE_BUSINESSES)
    .select(
      "id, user_id, google_account_id, google_location_id, business_name, whatsapp_number, google_refresh_token_encrypted, created_at"
    )
    .eq("id", businessId)
    .maybeSingle<BusinessRow>();

  assertNoError(error, "get business by id");

  return data ? mapBusiness(data) : null;
};

export const updateBusinessWhatsapp = async (
  businessId: string,
  whatsappNumber: string
): Promise<BusinessRecord | null> => {
  const { data, error } = await supabase
    .from(TABLE_BUSINESSES)
    .update({
      whatsapp_number: whatsappNumber
    })
    .eq("id", businessId)
    .select(
      "id, user_id, google_account_id, google_location_id, business_name, whatsapp_number, google_refresh_token_encrypted, created_at"
    )
    .maybeSingle<BusinessRow>();

  assertNoError(error, "update business whatsapp");

  return data ? mapBusiness(data) : null;
};

export const findUserById = async (userId: string): Promise<UserRecord | null> => {
  const { data, error } = await supabase
    .from(TABLE_USERS)
    .select("id, email, created_at")
    .eq("id", userId)
    .maybeSingle<UserRow>();

  assertNoError(error, "find user by id");

  return data ? mapUser(data) : null;
};

export const findReviewByBusinessAndGoogleId = async (
  businessId: string,
  googleReviewId: string
): Promise<ReviewRecord | null> => {
  const { data, error } = await supabase
    .from(TABLE_REVIEWS)
    .select(
      "id, business_id, google_review_id, reviewer_name, rating, comment, create_time, update_time, ai_suggested_reply, status, created_at"
    )
    .eq("business_id", businessId)
    .eq("google_review_id", googleReviewId)
    .maybeSingle<ReviewRow>();

  assertNoError(error, "find review by business and google id");

  return data ? mapReview(data) : null;
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

  const { data, error } = await supabase
    .from(TABLE_REVIEWS)
    .insert({
      id,
      business_id: input.businessId,
      google_review_id: input.googleReviewId,
      reviewer_name: input.reviewerName,
      rating: input.rating,
      comment: input.comment,
      create_time: input.createTime.toISOString(),
      update_time: input.updateTime.toISOString(),
      ai_suggested_reply: null,
      status: input.status
    })
    .select(
      "id, business_id, google_review_id, reviewer_name, rating, comment, create_time, update_time, ai_suggested_reply, status, created_at"
    )
    .single<ReviewRow>();

  assertNoError(error, "create review");
  if (!data) {
    throw new Error("Supabase query failed (create review): no row returned");
  }

  return mapReview(data);
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
  const payload: Record<string, unknown> = {};

  if (patch.aiSuggestedReply !== undefined) {
    payload.ai_suggested_reply = patch.aiSuggestedReply;
  }

  if (patch.status !== undefined) {
    payload.status = patch.status;
  }

  if (patch.updateTime !== undefined) {
    payload.update_time = patch.updateTime.toISOString();
  }

  if (patch.comment !== undefined) {
    payload.comment = patch.comment;
  }

  if (patch.reviewerName !== undefined) {
    payload.reviewer_name = patch.reviewerName;
  }

  if (patch.rating !== undefined) {
    payload.rating = patch.rating;
  }

  if (Object.keys(payload).length === 0) {
    return;
  }

  const { error } = await supabase
    .from(TABLE_REVIEWS)
    .update(payload)
    .eq("id", reviewId);

  assertNoError(error, "update review fields");
};

export const getReviewById = async (reviewId: string): Promise<ReviewRecord | null> => {
  const { data, error } = await supabase
    .from(TABLE_REVIEWS)
    .select(
      "id, business_id, google_review_id, reviewer_name, rating, comment, create_time, update_time, ai_suggested_reply, status, created_at"
    )
    .eq("id", reviewId)
    .maybeSingle<ReviewRow>();

  assertNoError(error, "get review by id");

  return data ? mapReview(data) : null;
};

export const listReviews = async (): Promise<ReviewRecord[]> => {
  const { data, error } = await supabase
    .from(TABLE_REVIEWS)
    .select(
      "id, business_id, google_review_id, reviewer_name, rating, comment, create_time, update_time, ai_suggested_reply, status, created_at"
    )
    .order("create_time", { ascending: false });

  assertNoError(error, "list reviews");

  return (data ?? []).map((row) => mapReview(row as ReviewRow));
};

export const listReviewsByBusinessId = async (businessId: string): Promise<ReviewRecord[]> => {
  const { data, error } = await supabase
    .from(TABLE_REVIEWS)
    .select(
      "id, business_id, google_review_id, reviewer_name, rating, comment, create_time, update_time, ai_suggested_reply, status, created_at"
    )
    .eq("business_id", businessId)
    .order("create_time", { ascending: false });

  assertNoError(error, "list reviews by business id");

  return (data ?? []).map((row) => mapReview(row as ReviewRow));
};

export const createApprovalToken = async (input: {
  reviewId: string;
  businessId: string;
  token: string;
  expiresAt: Date;
}): Promise<ApprovalTokenRecord> => {
  const id = randomUUID();

  const { data, error } = await supabase
    .from(TABLE_APPROVAL_TOKENS)
    .insert({
      id,
      review_id: input.reviewId,
      business_id: input.businessId,
      token: input.token,
      expires_at: input.expiresAt.toISOString()
    })
    .select("id, review_id, business_id, token, expires_at, used_at, created_at")
    .single<ApprovalTokenRow>();

  assertNoError(error, "create approval token");
  if (!data) {
    throw new Error("Supabase query failed (create approval token): no row returned");
  }

  return mapApprovalToken(data);
};

export const findApprovalTokenByToken = async (
  token: string
): Promise<(ApprovalTokenRecord & { businessId: string }) | null> => {
  const { data, error } = await supabase
    .from(TABLE_APPROVAL_TOKENS)
    .select("id, review_id, business_id, token, expires_at, used_at, created_at")
    .eq("token", token)
    .maybeSingle<ApprovalTokenRow>();

  assertNoError(error, "find approval token by token");

  if (!data) {
    return null;
  }

  return {
    ...mapApprovalToken(data),
    businessId: data.business_id
  };
};

export const markApprovalTokenUsed = async (tokenId: string): Promise<void> => {
  const { error } = await supabase
    .from(TABLE_APPROVAL_TOKENS)
    .update({
      used_at: new Date().toISOString()
    })
    .eq("id", tokenId);

  assertNoError(error, "mark approval token used");
};

export const listApprovalTokensByReviewId = async (
  reviewId: string,
  limit = 1
): Promise<ApprovalTokenRecord[]> => {
  const { data, error } = await supabase
    .from(TABLE_APPROVAL_TOKENS)
    .select("id, review_id, business_id, token, expires_at, used_at, created_at")
    .eq("review_id", reviewId)
    .order("created_at", { ascending: false })
    .limit(limit);

  assertNoError(error, "list approval tokens by review id");

  return (data ?? []).map((row) => mapApprovalToken(row as ApprovalTokenRow));
};

export const listAuditLogsByBusinessId = async (businessId: string): Promise<AuditLogRecord[]> => {
  const { data, error } = await supabase
    .from(TABLE_AUDIT_LOGS)
    .select("id, business_id, review_id, action, metadata, created_at")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false });

  assertNoError(error, "list audit logs by business id");

  return (data ?? []).map((row) => mapAuditLog(row as AuditLogRow));
};

const toJsonSafeValue = (value: unknown): unknown => {
  if (value === undefined) {
    return null;
  }

  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((item) => toJsonSafeValue(item));
  }

  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).reduce<Record<string, unknown>>(
      (acc, [key, item]) => {
        acc[key] = toJsonSafeValue(item);
        return acc;
      },
      {}
    );
  }

  return String(value);
};

export const createAuditLog = async (input: {
  businessId: string;
  reviewId?: string;
  action: string;
  metadata: unknown;
}): Promise<void> => {
  const id = randomUUID();

  const { error } = await supabase
    .from(TABLE_AUDIT_LOGS)
    .insert({
      id,
      business_id: input.businessId,
      review_id: input.reviewId ?? null,
      action: input.action,
      metadata: (toJsonSafeValue(input.metadata) as Record<string, unknown>) ?? {}
    });

  assertNoError(error, "create audit log");
};

export const countUsers = async (): Promise<number> => {
  const { count, error } = await supabase
    .from(TABLE_USERS)
    .select("id", { count: "exact", head: true });

  assertNoError(error, "count users");

  return count ?? 0;
};

export const countReviews = async (): Promise<number> => {
  const { count, error } = await supabase
    .from(TABLE_REVIEWS)
    .select("id", { count: "exact", head: true });

  assertNoError(error, "count reviews");

  return count ?? 0;
};
