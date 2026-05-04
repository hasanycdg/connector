import { ReviewStatus } from "@prisma/client";
import { AppError } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { writeAuditLog } from "./auditLog.service.js";

const REVIEW_STATUSES: ReviewStatus[] = [
  "NEW",
  "SENT_TO_WHATSAPP",
  "APPROVED",
  "POSTED",
  "REJECTED",
  "ERROR"
];

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
  const [businesses, usersCount, reviewsCount, groupedByStatus] = await Promise.all([
    prisma.business.findMany({
      include: {
        user: {
          select: {
            email: true
          }
        },
        _count: {
          select: {
            reviews: true
          }
        }
      },
      orderBy: {
        createdAt: "desc"
      }
    }),
    prisma.user.count(),
    prisma.review.count(),
    prisma.review.groupBy({
      by: ["businessId", "status"],
      _count: {
        _all: true
      }
    })
  ]);

  const statusesByBusinessId = new Map<string, Record<ReviewStatus, number>>();

  for (const group of groupedByStatus) {
    const current = statusesByBusinessId.get(group.businessId) ?? initializeStatusCounts();
    current[group.status] = group._count._all;
    statusesByBusinessId.set(group.businessId, current);
  }

  const mappedBusinesses: DashboardBusinessSummary[] = businesses.map((business) => ({
    id: business.id,
    businessName: business.businessName,
    whatsappNumber: business.whatsappNumber,
    googleAccountId: business.googleAccountId,
    googleLocationId: business.googleLocationId,
    createdAt: business.createdAt,
    userEmail: business.user.email,
    reviewCount: business._count.reviews,
    statusCounts: statusesByBusinessId.get(business.id) ?? initializeStatusCounts()
  }));

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
  const business = await prisma.business.findUnique({
    where: {
      id: businessId
    },
    include: {
      user: {
        select: {
          email: true
        }
      }
    }
  });

  if (!business) {
    throw new AppError("Business not found.", 404);
  }

  const [reviews, auditLogs, groupedByStatus] = await Promise.all([
    prisma.review.findMany({
      where: {
        businessId
      },
      include: {
        approvalTokens: {
          orderBy: {
            createdAt: "desc"
          },
          take: 1
        }
      },
      orderBy: {
        createTime: "desc"
      },
      take: 100
    }),
    prisma.auditLog.findMany({
      where: {
        businessId
      },
      orderBy: {
        createdAt: "desc"
      },
      take: 120
    }),
    prisma.review.groupBy({
      by: ["status"],
      where: {
        businessId
      },
      _count: {
        _all: true
      }
    })
  ]);

  const statusCounts = initializeStatusCounts();
  for (const group of groupedByStatus) {
    statusCounts[group.status] = group._count._all;
  }

  return {
    business: {
      id: business.id,
      businessName: business.businessName,
      userEmail: business.user.email,
      whatsappNumber: business.whatsappNumber,
      googleAccountId: business.googleAccountId,
      googleLocationId: business.googleLocationId,
      createdAt: business.createdAt
    },
    reviews: reviews.map((review) => ({
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
      latestApprovalToken: review.approvalTokens[0]
        ? {
            token: review.approvalTokens[0].token,
            expiresAt: review.approvalTokens[0].expiresAt,
            usedAt: review.approvalTokens[0].usedAt,
            createdAt: review.approvalTokens[0].createdAt
          }
        : null
    })),
    auditLogs: auditLogs.map((log) => ({
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
  const business = await prisma.business.update({
    where: {
      id: businessId
    },
    data: {
      whatsappNumber
    }
  });

  await writeAuditLog({
    businessId: business.id,
    action: "WHATSAPP_NUMBER_UPDATED",
    metadata: {
      whatsappNumber
    }
  });
};

export const reviewStatusLabels = REVIEW_STATUSES;
