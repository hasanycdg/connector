import { randomBytes } from "crypto";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { decryptText } from "../lib/encryption.js";
import {
  createApprovalToken,
  createReview,
  findReviewByBusinessAndGoogleId,
  listBusinesses,
  updateReviewFields
} from "../lib/firestoreStore.js";
import type { BusinessRecord } from "../types/domain.js";
import { writeAuditLog } from "./auditLog.service.js";
import {
  fetchLocationReviews,
  refreshGoogleAccessToken,
  type GoogleReview
} from "./googleBusiness.service.js";
import { generateAiReplySuggestion } from "./openaiReply.service.js";
import { sendReviewApprovalMessage } from "./twilio.service.js";

interface PollSummary {
  businessesProcessed: number;
  newReviewsDetected: number;
  errors: number;
}

const sleep = async (ms: number): Promise<void> => {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
};

const createApprovalTokenString = async (
  reviewId: string,
  businessId: string
): Promise<string> => {
  const token = randomBytes(32).toString("hex");

  await createApprovalToken({
    reviewId,
    businessId,
    token,
    expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000)
  });

  return token;
};

const processReview = async (business: BusinessRecord, review: GoogleReview): Promise<boolean> => {
  const existingReview = await findReviewByBusinessAndGoogleId(business.id, review.reviewId);

  if (existingReview) {
    return false;
  }

  const createdReview = await createReview({
    businessId: business.id,
    googleReviewId: review.reviewId,
    reviewerName: review.reviewerName,
    rating: review.rating,
    comment: review.comment,
    createTime: new Date(review.createTime),
    updateTime: new Date(review.updateTime),
    status: "NEW"
  });

  try {
    await writeAuditLog({
      businessId: business.id,
      reviewId: createdReview.id,
      action: "REVIEW_NEW_DETECTED",
      metadata: {
        googleReviewId: review.reviewId,
        reviewerName: review.reviewerName,
        rating: review.rating
      }
    });

    const aiReply = await generateAiReplySuggestion({
      businessName: business.businessName,
      reviewerName: review.reviewerName,
      rating: review.rating,
      reviewComment: review.comment
    });

    await updateReviewFields(createdReview.id, {
      aiSuggestedReply: aiReply
    });

    await writeAuditLog({
      businessId: business.id,
      reviewId: createdReview.id,
      action: "AI_REPLY_GENERATED",
      metadata: {
        aiSuggestedReply: aiReply
      }
    });

    const approvalToken = await createApprovalTokenString(createdReview.id, business.id);

    await sendReviewApprovalMessage({
      to: business.whatsappNumber,
      businessName: business.businessName,
      rating: review.rating,
      reviewerName: review.reviewerName,
      reviewComment: review.comment,
      aiSuggestedReply: aiReply,
      approvalToken
    });

    await updateReviewFields(createdReview.id, {
      status: "SENT_TO_WHATSAPP"
    });

    await writeAuditLog({
      businessId: business.id,
      reviewId: createdReview.id,
      action: "WHATSAPP_NOTIFICATION_SENT",
      metadata: {
        approvalToken
      }
    });

    return true;
  } catch (error) {
    await updateReviewFields(createdReview.id, {
      status: "ERROR"
    });

    await writeAuditLog({
      businessId: business.id,
      reviewId: createdReview.id,
      action: "REVIEW_PROCESSING_ERROR",
      metadata: {
        error: error instanceof Error ? error.message : String(error)
      }
    });

    throw error;
  }
};

const processBusiness = async (business: BusinessRecord): Promise<number> => {
  const refreshToken = decryptText(business.googleRefreshTokenEncrypted);
  const accessToken = await refreshGoogleAccessToken(refreshToken);

  const reviews = await fetchLocationReviews(
    accessToken,
    business.googleAccountId,
    business.googleLocationId
  );

  let createdCount = 0;

  for (const review of reviews) {
    try {
      const created = await processReview(business, review);
      if (created) {
        createdCount += 1;
      }
    } catch (error) {
      logger.error(
        {
          err: error,
          businessId: business.id,
          googleReviewId: review.reviewId
        },
        "Failed to process a fetched review"
      );
    }
  }

  return createdCount;
};

export const pollReviewsForAllBusinesses = async (
  triggeredBy: "manual" | "cron"
): Promise<PollSummary> => {
  const businesses = await listBusinesses();

  const summary: PollSummary = {
    businessesProcessed: 0,
    newReviewsDetected: 0,
    errors: 0
  };

  for (let index = 0; index < businesses.length; index += 1) {
    const business = businesses[index];

    if (!business) {
      continue;
    }

    if (index > 0 && env.POLL_STAGGER_SECONDS > 0) {
      const jitterSeconds = Math.floor(Math.random() * env.POLL_STAGGER_SECONDS) + 1;
      await sleep(jitterSeconds * 1000);
    }

    try {
      const created = await processBusiness(business);
      summary.businessesProcessed += 1;
      summary.newReviewsDetected += created;

      await writeAuditLog({
        businessId: business.id,
        action: "POLL_COMPLETED",
        metadata: {
          triggeredBy,
          newReviews: created
        }
      });
    } catch (error) {
      summary.errors += 1;

      await writeAuditLog({
        businessId: business.id,
        action: "POLL_FAILED",
        metadata: {
          triggeredBy,
          error: error instanceof Error ? error.message : String(error)
        }
      });

      logger.error(
        {
          err: error,
          businessId: business.id,
          triggeredBy
        },
        "Failed while polling a business"
      );
    }
  }

  return summary;
};
