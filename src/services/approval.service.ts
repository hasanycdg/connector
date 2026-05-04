import { AppError } from "../lib/errors.js";
import { decryptText } from "../lib/encryption.js";
import {
  findApprovalTokenByToken,
  getBusinessById,
  getReviewById,
  markApprovalTokenUsed,
  updateReviewFields
} from "../lib/firestoreStore.js";
import { writeAuditLog } from "./auditLog.service.js";
import { postReviewReply, refreshGoogleAccessToken } from "./googleBusiness.service.js";

export type ApprovalAction = "APPROVE" | "REJECT";

interface HandleApprovalInput {
  action: ApprovalAction;
  token: string;
  whatsappFrom: string;
}

const normalizePhone = (phone: string): string =>
  phone.replace(/^whatsapp:/i, "").replace(/\s+/g, "").trim();

const assertAuthorizedPhone = (incomingPhone: string, registeredPhone: string): boolean =>
  normalizePhone(incomingPhone) === normalizePhone(registeredPhone);

export const handleApprovalAction = async ({
  action,
  token,
  whatsappFrom
}: HandleApprovalInput): Promise<string> => {
  const approvalToken = await findApprovalTokenByToken(token);

  if (!approvalToken) {
    return "Invalid token. Please request a new review notification.";
  }

  const review = await getReviewById(approvalToken.reviewId);

  if (!review) {
    return "Review not found for this token.";
  }

  const business = await getBusinessById(review.businessId);

  if (!business) {
    return "Business not found for this token.";
  }

  if (!assertAuthorizedPhone(whatsappFrom, business.whatsappNumber)) {
    await writeAuditLog({
      businessId: business.id,
      reviewId: review.id,
      action: "UNAUTHORIZED_WHATSAPP_APPROVAL_ATTEMPT",
      metadata: {
        from: whatsappFrom,
        token
      }
    });

    return "This WhatsApp number is not authorized for this business.";
  }

  if (approvalToken.usedAt) {
    return "This token was already used.";
  }

  if (approvalToken.expiresAt.getTime() < Date.now()) {
    return "This token has expired. Please wait for a fresh review notification.";
  }

  if (action === "REJECT") {
    await markApprovalTokenUsed(approvalToken.id);

    await updateReviewFields(review.id, {
      status: "REJECTED"
    });

    await writeAuditLog({
      businessId: business.id,
      reviewId: review.id,
      action: "REPLY_REJECTED",
      metadata: {
        token,
        from: whatsappFrom
      }
    });

    return "Reply suggestion rejected. Nothing was posted to Google.";
  }

  if (!review.aiSuggestedReply) {
    throw new AppError("Approved review has no stored AI reply suggestion.", 500);
  }

  await markApprovalTokenUsed(approvalToken.id);

  await updateReviewFields(review.id, {
    status: "APPROVED"
  });

  await writeAuditLog({
    businessId: business.id,
    reviewId: review.id,
    action: "REPLY_APPROVED",
    metadata: {
      approvedAt: new Date().toISOString(),
      from: whatsappFrom,
      token,
      replyText: review.aiSuggestedReply,
      googleReviewId: review.googleReviewId
    }
  });

  try {
    const refreshToken = decryptText(business.googleRefreshTokenEncrypted);
    const accessToken = await refreshGoogleAccessToken(refreshToken);

    await postReviewReply(
      accessToken,
      business.googleAccountId,
      business.googleLocationId,
      review.googleReviewId,
      review.aiSuggestedReply
    );

    await updateReviewFields(review.id, {
      status: "POSTED"
    });

    await writeAuditLog({
      businessId: business.id,
      reviewId: review.id,
      action: "REPLY_POSTED_TO_GOOGLE",
      metadata: {
        postedAt: new Date().toISOString(),
        googleReviewId: review.googleReviewId,
        replyText: review.aiSuggestedReply,
        approvedFromWhatsappNumber: whatsappFrom
      }
    });

    return "Approved. The exact stored reply was posted to Google.";
  } catch (error) {
    await updateReviewFields(review.id, {
      status: "ERROR"
    });

    await writeAuditLog({
      businessId: business.id,
      reviewId: review.id,
      action: "REPLY_POST_FAILED",
      metadata: {
        error: error instanceof Error ? error.message : String(error),
        googleReviewId: review.googleReviewId,
        approvedFromWhatsappNumber: whatsappFrom
      }
    });

    throw new AppError("Reply approval recorded but posting to Google failed.", 502);
  }
};
