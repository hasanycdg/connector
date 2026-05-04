CREATE TYPE review_status AS ENUM (
  'NEW',
  'SENT_TO_WHATSAPP',
  'APPROVED',
  'POSTED',
  'REJECTED',
  'ERROR'
);

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE businesses (
  id TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "googleAccountId" TEXT NOT NULL,
  "googleLocationId" TEXT NOT NULL,
  "businessName" TEXT NOT NULL,
  "whatsappNumber" TEXT NOT NULL,
  "googleRefreshTokenEncrypted" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE ("googleAccountId", "googleLocationId")
);

CREATE TABLE reviews (
  id TEXT PRIMARY KEY,
  "businessId" TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  "googleReviewId" TEXT NOT NULL,
  "reviewerName" TEXT NOT NULL,
  rating INTEGER NOT NULL,
  comment TEXT NOT NULL,
  "createTime" TIMESTAMPTZ NOT NULL,
  "updateTime" TIMESTAMPTZ NOT NULL,
  "aiSuggestedReply" TEXT,
  status review_status NOT NULL DEFAULT 'NEW',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE ("businessId", "googleReviewId")
);

CREATE TABLE approval_tokens (
  id TEXT PRIMARY KEY,
  "reviewId" TEXT NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "usedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY,
  "businessId" TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  "reviewId" TEXT REFERENCES reviews(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  metadata JSONB NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX businesses_user_id_idx ON businesses("userId");
CREATE INDEX reviews_business_status_idx ON reviews("businessId", status);
CREATE INDEX approval_tokens_review_id_idx ON approval_tokens("reviewId");
CREATE INDEX approval_tokens_expires_at_idx ON approval_tokens("expiresAt");
CREATE INDEX audit_logs_business_created_idx ON audit_logs("businessId", "createdAt");
CREATE INDEX audit_logs_review_id_idx ON audit_logs("reviewId");
