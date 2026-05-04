import { AppError } from "../lib/errors.js";
import {
  countReviews,
  countUsers,
  findUserById,
  getBusinessById,
  listApprovalTokensByReviewId,
  listAuditLogsByBusinessId,
  listBusinesses,
  listReviews,
  listReviewsByBusinessId,
  updateBusinessWhatsapp
} from "../lib/firestoreStore.js";
import type { ReviewStatus } from "../types/domain.js";
import { REVIEW_STATUS_VALUES } from "../types/domain.js";
import { writeAuditLog } from "./auditLog.service.js";

const REVIEW_STATUSES: ReviewStatus[] = [...REVIEW_STATUS_VALUES];

const initializeStatusCounts = (): Record<ReviewStatus, number> => ({
  NEW: 0,
  SENT_TO_WHATSAPP: 0,
  APPROVED: 0,
  POSTED: 0,
  REJECTED: 0,
  ERROR: 0
});

export interface DashboardBusinessSummary {
  id: string;
  businessName: string;
  whatsappNumber: string;
  googleAccountId: string;
  googleLocationId: string;
  createdAt: Date;
  userEmail: string;
  reviewCount: number;
  statusCounts: Record<ReviewStatus, number>;
}

export interface DashboardOverview {
  totals: {
    businesses: number;
    users: number;
    reviews: number;
    pendingApprovals: number;
    posted: number;
    errors: number;
  };
  businesses: DashboardBusinessSummary[];
}

export interface DashboardBusinessDetail {
  business: {
    id: string;
    businessName: string;
    userEmail: string;
    whatsappNumber: string;
    googleAccountId: string;
    googleLocationId: string;
    createdAt: Date;
  };
  reviews: Array<{
    id: string;
    googleReviewId: string;
    reviewerName: string;
    rating: number;
    comment: string;
    aiSuggestedReply: string | null;
    status: ReviewStatus;
    createTime: Date;
    updateTime: Date;
    createdAt: Date;
    latestApprovalToken: {
      token: string;
      expiresAt: Date;
      usedAt: Date | null;
      createdAt: Date;
    } | null;
  }>;
  auditLogs: Array<{
    id: string;
    action: string;
    metadata: unknown;
    createdAt: Date;
  }>;
  statusCounts: Record<ReviewStatus, number>;
}

export const getDashboardOverview = async (): Promise<DashboardOverview> => {
  const [businesses, usersCount, reviewsCount, allReviews] = await Promise.all([
    listBusinesses(),
    countUsers(),
    countReviews(),
    listReviews()
  ]);

  const userMap = new Map<string, string>();
  const statusMapByBusiness = new Map<string, Record<ReviewStatus, number>>();
  const reviewsCountByBusiness = new Map<string, number>();

  const uniqueUserIds = [...new Set(businesses.map((business) => business.userId))];
  const users = await Promise.all(uniqueUserIds.map((userId) => findUserById(userId)));

  for (let index = 0; index < uniqueUserIds.length; index += 1) {
    const userId = uniqueUserIds[index];
    const user = users[index];

    if (!userId) {
      continue;
    }

    userMap.set(userId, user?.email ?? "unknown@example.com");
  }

  for (const review of allReviews) {
    const currentStatusCounts =
      statusMapByBusiness.get(review.businessId) ?? initializeStatusCounts();
    currentStatusCounts[review.status] += 1;
    statusMapByBusiness.set(review.businessId, currentStatusCounts);

    const currentReviewCount = reviewsCountByBusiness.get(review.businessId) ?? 0;
    reviewsCountByBusiness.set(review.businessId, currentReviewCount + 1);
  }

  const mappedBusinesses: DashboardBusinessSummary[] = businesses
    .map((business) => ({
      id: business.id,
      businessName: business.businessName,
      whatsappNumber: business.whatsappNumber,
      googleAccountId: business.googleAccountId,
      googleLocationId: business.googleLocationId,
      createdAt: business.createdAt,
      userEmail: userMap.get(business.userId) ?? "unknown@example.com",
      reviewCount: reviewsCountByBusiness.get(business.id) ?? 0,
      statusCounts: statusMapByBusiness.get(business.id) ?? initializeStatusCounts()
    }))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const totals = {
    businesses: businesses.length,
    users: usersCount,
    reviews: reviewsCount,
    pendingApprovals: 0,
    posted: 0,
    errors: 0
  };

  for (const business of mappedBusinesses) {
    totals.pendingApprovals +=
      business.statusCounts.NEW +
      business.statusCounts.SENT_TO_WHATSAPP +
      business.statusCounts.APPROVED;
    totals.posted += business.statusCounts.POSTED;
    totals.errors += business.statusCounts.ERROR;
  }

  return {
    totals,
    businesses: mappedBusinesses
  };
};

export const getDashboardBusinessDetail = async (
  businessId: string
): Promise<DashboardBusinessDetail> => {
  const business = await getBusinessById(businessId);

  if (!business) {
    throw new AppError("Business not found.", 404);
  }

  const user = await findUserById(business.userId);
  const reviews = await listReviewsByBusinessId(businessId);
  const auditLogs = await listAuditLogsByBusinessId(businessId);

  const statusCounts = initializeStatusCounts();

  for (const review of reviews) {
    statusCounts[review.status] += 1;
  }

  const reviewRows = await Promise.all(
    reviews.slice(0, 100).map(async (review) => {
      const latestApprovalToken = (await listApprovalTokensByReviewId(review.id, 1))[0] ?? null;

      return {
        id: review.id,
        googleReviewId: review.googleReviewId,
        reviewerName: review.reviewerName,
        rating: review.rating,
        comment: review.comment,
        aiSuggestedReply: review.aiSuggestedReply,
        status: review.status,
        createTime: review.createTime,
        updateTime: review.updateTime,
        createdAt: review.createdAt,
        latestApprovalToken: latestApprovalToken
          ? {
              token: latestApprovalToken.token,
              expiresAt: latestApprovalToken.expiresAt,
              usedAt: latestApprovalToken.usedAt,
              createdAt: latestApprovalToken.createdAt
            }
          : null
      };
    })
  );

  return {
    business: {
      id: business.id,
      businessName: business.businessName,
      userEmail: user?.email ?? "unknown@example.com",
      whatsappNumber: business.whatsappNumber,
      googleAccountId: business.googleAccountId,
      googleLocationId: business.googleLocationId,
      createdAt: business.createdAt
    },
    reviews: reviewRows,
    auditLogs: auditLogs.slice(0, 120).map((log) => ({
      id: log.id,
      action: log.action,
      metadata: log.metadata,
      createdAt: log.createdAt
    })),
    statusCounts
  };
};

export const updateBusinessWhatsappNumber = async (
  businessId: string,
  whatsappNumber: string
): Promise<void> => {
  const business = await updateBusinessWhatsapp(businessId, whatsappNumber);

  if (!business) {
    throw new AppError("Business not found.", 404);
  }

  await writeAuditLog({
    businessId: business.id,
    action: "WHATSAPP_NUMBER_UPDATED",
    metadata: {
      whatsappNumber
    }
  });
};

export const reviewStatusLabels = REVIEW_STATUSES;
