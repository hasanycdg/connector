import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { AppError } from "../lib/errors.js";
import { beginGoogleOAuth, completeGoogleOAuth } from "../services/auth.service.js";

const router = Router();

const authStartQuerySchema = z.object({
  email: z.email(),
  whatsappNumber: z.string().min(3),
  googleAccountId: z.string().optional(),
  googleLocationId: z.string().optional(),
  redirectTo: z.string().optional()
});

const sanitizeDashboardRedirect = (rawRedirectTo: string | undefined): string | undefined => {
  if (!rawRedirectTo) {
    return undefined;
  }

  if (!rawRedirectTo.startsWith("/dashboard")) {
    return undefined;
  }

  return rawRedirectTo;
};

const extractRedirectFromRawState = (rawState: string): string | undefined => {
  const payloadPart = rawState.split(".")[0];

  if (!payloadPart) {
    return undefined;
  }

  try {
    const jsonPayload = Buffer.from(payloadPart, "base64url").toString("utf8");
    const parsed = JSON.parse(jsonPayload) as { redirectTo?: unknown };

    return typeof parsed.redirectTo === "string"
      ? sanitizeDashboardRedirect(parsed.redirectTo)
      : undefined;
  } catch {
    return undefined;
  }
};

router.get(
  "/google",
  asyncHandler(async (request, response) => {
    const parsedQuery = authStartQuerySchema.safeParse(request.query);

    if (!parsedQuery.success) {
      throw new AppError("Invalid /auth/google query parameters.", 400, parsedQuery.error.format());
    }

    const authUrl = beginGoogleOAuth({
      ...parsedQuery.data,
      redirectTo: sanitizeDashboardRedirect(parsedQuery.data.redirectTo)
    });
    response.redirect(authUrl);
  })
);

const authCallbackQuerySchema = z.object({
  code: z.string().min(1),
  state: z.string().min(1)
});

router.get(
  "/google/callback",
  asyncHandler(async (request, response) => {
    const parsedQuery = authCallbackQuerySchema.safeParse(request.query);

    if (!parsedQuery.success) {
      throw new AppError("Missing OAuth callback parameters.", 400, parsedQuery.error.format());
    }

    try {
      const result = await completeGoogleOAuth(parsedQuery.data);

      const redirectTarget = sanitizeDashboardRedirect(result.redirectTo);

      if (redirectTarget) {
        const redirectUrl = new URL(redirectTarget, "http://dashboard.local");
        redirectUrl.searchParams.set("oauth", "connected");
        redirectUrl.searchParams.set("businessId", result.businessId);
        redirectUrl.searchParams.set("businessName", result.selectedLocation.businessName);

        response.redirect(303, `${redirectUrl.pathname}${redirectUrl.search}`);
        return;
      }

      response.status(200).json({
        message: "Google Business Profile connected successfully.",
        ...result
      });
    } catch (error) {
      const fallbackRedirect = extractRedirectFromRawState(parsedQuery.data.state);

      if (fallbackRedirect) {
        const redirectUrl = new URL(fallbackRedirect, "http://dashboard.local");
        redirectUrl.searchParams.set("oauth", "failed");

        response.redirect(303, `${redirectUrl.pathname}${redirectUrl.search}`);
        return;
      }

      throw error;
    }
  })
);

export const authRoutes = router;
