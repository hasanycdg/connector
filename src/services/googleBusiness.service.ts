import axios, { AxiosError } from "axios";
import { OAuth2Client } from "google-auth-library";
import { env } from "../config/env.js";
import { AppError } from "../lib/errors.js";

interface GoogleAccount {
  name: string;
  accountName?: string;
}

interface GoogleLocation {
  name: string;
  title?: string;
}

interface AccountsResponse {
  accounts?: GoogleAccount[];
}

interface LocationsResponse {
  locations?: GoogleLocation[];
}

interface GoogleReviewer {
  displayName?: string;
}

interface GoogleReviewRecord {
  name: string;
  reviewer?: GoogleReviewer;
  starRating?: "ONE" | "TWO" | "THREE" | "FOUR" | "FIVE";
  comment?: string;
  createTime?: string;
  updateTime?: string;
}

interface ReviewsResponse {
  reviews?: GoogleReviewRecord[];
  nextPageToken?: string;
}

export interface GoogleReview {
  reviewName: string;
  reviewId: string;
  reviewerName: string;
  rating: number;
  comment: string;
  createTime: string;
  updateTime: string;
}

export interface AccountWithLocations {
  accountId: string;
  accountName: string;
  locations: Array<{
    locationId: string;
    locationName: string;
    locationTitle: string;
  }>;
}

const GOOGLE_SCOPE = "https://www.googleapis.com/auth/business.manage";

const googleHttp = axios.create({
  timeout: 20_000
});

const oauthClient = new OAuth2Client(
  env.GOOGLE_CLIENT_ID,
  env.GOOGLE_CLIENT_SECRET,
  env.GOOGLE_REDIRECT_URI
);

const mapGoogleError = (error: unknown, fallbackMessage: string): AppError => {
  if (error instanceof AxiosError) {
    const status = error.response?.status ?? 502;
    const payload = error.response?.data;

    return new AppError(fallbackMessage, status, {
      provider: "google",
      payload
    });
  }

  return new AppError(fallbackMessage, 502);
};

const normalizeLocationResource = (locationId: string): string =>
  locationId.startsWith("locations/") ? locationId : `locations/${locationId}`;

const ratingToNumber = (rating?: GoogleReviewRecord["starRating"]): number => {
  switch (rating) {
    case "ONE":
      return 1;
    case "TWO":
      return 2;
    case "THREE":
      return 3;
    case "FOUR":
      return 4;
    case "FIVE":
      return 5;
    default:
      return 0;
  }
};

export const createGoogleAuthUrl = (state: string): string =>
  oauthClient.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [GOOGLE_SCOPE],
    state,
    include_granted_scopes: true
  });

export const exchangeGoogleCode = async (
  code: string
): Promise<{ accessToken: string; refreshToken: string }> => {
  try {
    const { tokens } = await oauthClient.getToken(code);

    if (!tokens.access_token) {
      throw new AppError("Google did not return an access token.", 400);
    }

    if (!tokens.refresh_token) {
      throw new AppError(
        "Google did not return a refresh token. Re-authenticate with consent to grant offline access.",
        400
      );
    }

    return {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token
    };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    throw mapGoogleError(error, "Failed to exchange Google OAuth code.");
  }
};

export const refreshGoogleAccessToken = async (refreshToken: string): Promise<string> => {
  try {
    oauthClient.setCredentials({
      refresh_token: refreshToken
    });

    const { credentials } = await oauthClient.refreshAccessToken();

    if (!credentials.access_token) {
      throw new AppError("Google token refresh did not return an access token.", 400);
    }

    return credentials.access_token;
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    throw mapGoogleError(error, "Failed to refresh Google access token.");
  }
};

const fetchAccounts = async (accessToken: string): Promise<GoogleAccount[]> => {
  try {
    const response = await googleHttp.get<AccountsResponse>(
      "https://mybusinessaccountmanagement.googleapis.com/v1/accounts",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      }
    );

    return response.data.accounts ?? [];
  } catch (error) {
    throw mapGoogleError(error, "Failed to fetch Google Business Profile accounts.");
  }
};

const fetchLocations = async (
  accessToken: string,
  accountResourceName: string
): Promise<GoogleLocation[]> => {
  try {
    const response = await googleHttp.get<LocationsResponse>(
      `https://mybusinessbusinessinformation.googleapis.com/v1/${accountResourceName}/locations`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`
        },
        params: {
          pageSize: 100,
          readMask: "name,title"
        }
      }
    );

    return response.data.locations ?? [];
  } catch (error) {
    throw mapGoogleError(error, `Failed to fetch locations for ${accountResourceName}.`);
  }
};

export const fetchAccountsAndLocations = async (
  accessToken: string
): Promise<AccountWithLocations[]> => {
  const accounts = await fetchAccounts(accessToken);

  const result: AccountWithLocations[] = [];

  for (const account of accounts) {
    const locations = await fetchLocations(accessToken, account.name);
    const mappedLocations = locations.map((location) => ({
      locationId: location.name,
      locationName: location.name,
      locationTitle: location.title ?? "Unnamed Location"
    }));

    result.push({
      accountId: account.name,
      accountName: account.accountName ?? account.name,
      locations: mappedLocations
    });
  }

  return result;
};

export const fetchLocationReviews = async (
  accessToken: string,
  accountId: string,
  locationId: string
): Promise<GoogleReview[]> => {
  const parent = `${accountId}/${normalizeLocationResource(locationId)}`;
  const reviews: GoogleReview[] = [];

  let nextPageToken: string | undefined;
  let pages = 0;

  try {
    do {
      const response = await googleHttp.get<ReviewsResponse>(
        `https://mybusiness.googleapis.com/v4/${parent}/reviews`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`
          },
          params: {
            pageSize: 50,
            orderBy: "updateTime desc",
            pageToken: nextPageToken
          }
        }
      );

      const pageReviews = response.data.reviews ?? [];

      for (const review of pageReviews) {
        const reviewId = review.name.split("/").at(-1);

        if (!reviewId) {
          continue;
        }

        reviews.push({
          reviewName: review.name,
          reviewId,
          reviewerName: review.reviewer?.displayName ?? "Anonymous",
          rating: ratingToNumber(review.starRating),
          comment: review.comment ?? "",
          createTime: review.createTime ?? review.updateTime ?? new Date().toISOString(),
          updateTime: review.updateTime ?? review.createTime ?? new Date().toISOString()
        });
      }

      nextPageToken = response.data.nextPageToken;
      pages += 1;
    } while (nextPageToken && pages < 5);
  } catch (error) {
    throw mapGoogleError(error, `Failed to fetch reviews for ${parent}.`);
  }

  return reviews;
};

export const postReviewReply = async (
  accessToken: string,
  accountId: string,
  locationId: string,
  reviewId: string,
  replyText: string
): Promise<void> => {
  const reviewName = `${accountId}/${normalizeLocationResource(locationId)}/reviews/${reviewId}`;

  try {
    await googleHttp.put(
      `https://mybusiness.googleapis.com/v4/${reviewName}/reply`,
      {
        comment: replyText
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      }
    );
  } catch (error) {
    throw mapGoogleError(error, `Failed to post reply for review ${reviewId}.`);
  }
};
