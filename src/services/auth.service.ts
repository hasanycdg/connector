import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { z } from "zod";
import { env } from "../config/env.js";
import { encryptText } from "../lib/encryption.js";
import { AppError } from "../lib/errors.js";
import { upsertBusinessByGoogleMapping, upsertUserByEmail } from "../lib/firestoreStore.js";
import {
  createGoogleAuthUrl,
  exchangeGoogleCode,
  fetchAccountsAndLocations
} from "./googleBusiness.service.js";
import { writeAuditLog } from "./auditLog.service.js";

const oauthStateSchema = z.object({
  email: z.email(),
  whatsappNumber: z.string().min(3),
  googleAccountId: z.string().optional(),
  googleLocationId: z.string().optional(),
  redirectTo: z.string().optional(),
  iat: z.number().int(),
  exp: z.number().int(),
  nonce: z.string().min(16)
});

const normalizeLocationName = (locationName: string): string =>
  locationName.startsWith("locations/") ? locationName : `locations/${locationName}`;

const signPayload = (payload: string): string =>
  createHmac("sha256", env.TOKEN_ENCRYPTION_KEY).update(payload).digest("base64url");

interface BeginOAuthInput {
  email: string;
  whatsappNumber: string;
  googleAccountId?: string;
  googleLocationId?: string;
  redirectTo?: string;
}

export const beginGoogleOAuth = ({
  email,
  whatsappNumber,
  googleAccountId,
  googleLocationId,
  redirectTo
}: BeginOAuthInput): string => {
  const now = Math.floor(Date.now() / 1000);

  const payload = {
    email,
    whatsappNumber,
    googleAccountId,
    googleLocationId,
    redirectTo,
    iat: now,
    exp: now + 10 * 60,
    nonce: randomBytes(12).toString("hex")
  };

  const payloadString = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = signPayload(payloadString);

  const state = `${payloadString}.${signature}`;
  return createGoogleAuthUrl(state);
};

const parseOAuthState = (rawState: string) => {
  const [payloadString, signature] = rawState.split(".");

  if (!payloadString || !signature) {
    throw new AppError("Missing or invalid OAuth state.", 400);
  }

  const expectedSignature = signPayload(payloadString);

  const providedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (
    providedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(providedBuffer, expectedBuffer)
  ) {
    throw new AppError("OAuth state signature is invalid.", 400);
  }

  const parsedPayload = JSON.parse(Buffer.from(payloadString, "base64url").toString("utf8"));

  const oauthState = oauthStateSchema.parse(parsedPayload);

  if (oauthState.exp < Math.floor(Date.now() / 1000)) {
    throw new AppError("OAuth state expired. Start OAuth flow again.", 400);
  }

  return oauthState;
};

interface CompleteOAuthInput {
  code: string;
  state: string;
}

export const completeGoogleOAuth = async ({
  code,
  state
}: CompleteOAuthInput): Promise<{
  userId: string;
  businessId: string;
  selectedLocation: {
    accountId: string;
    locationId: string;
    businessName: string;
  };
  availableLocations: Array<{
    accountId: string;
    accountName: string;
    locationId: string;
    locationTitle: string;
  }>;
  redirectTo?: string;
}> => {
  const oauthState = parseOAuthState(state);
  const tokens = await exchangeGoogleCode(code);
  const accounts = await fetchAccountsAndLocations(tokens.accessToken);

  const availableLocations = accounts.flatMap((account) =>
    account.locations.map((location) => ({
      accountId: account.accountId,
      accountName: account.accountName,
      locationId: location.locationId,
      locationTitle: location.locationTitle
    }))
  );

  if (availableLocations.length === 0) {
    throw new AppError("No Google Business Profile locations found for this account.", 400);
  }

  const selectedByState = availableLocations.find((location) => {
    if (!oauthState.googleAccountId || !oauthState.googleLocationId) {
      return false;
    }

    return (
      location.accountId === oauthState.googleAccountId &&
      normalizeLocationName(location.locationId) === normalizeLocationName(oauthState.googleLocationId)
    );
  });

  const selectedLocation = selectedByState ?? availableLocations[0];

  if (!selectedLocation) {
    throw new AppError("Failed to select a Google Business Profile location.", 500);
  }

  const encryptedRefreshToken = encryptText(tokens.refreshToken);

  const user = await upsertUserByEmail(oauthState.email);

  const business = await upsertBusinessByGoogleMapping({
    userId: user.id,
    googleAccountId: selectedLocation.accountId,
    googleLocationId: selectedLocation.locationId,
    businessName: selectedLocation.locationTitle,
    whatsappNumber: oauthState.whatsappNumber,
    googleRefreshTokenEncrypted: encryptedRefreshToken
  });

  await writeAuditLog({
    businessId: business.id,
    action: "OAUTH_CONNECTED",
    metadata: {
      email: oauthState.email,
      whatsappNumber: oauthState.whatsappNumber,
      googleAccountId: selectedLocation.accountId,
      googleLocationId: selectedLocation.locationId
    }
  });

  return {
    userId: user.id,
    businessId: business.id,
    selectedLocation: {
      accountId: selectedLocation.accountId,
      locationId: selectedLocation.locationId,
      businessName: selectedLocation.locationTitle
    },
    availableLocations,
    redirectTo: oauthState.redirectTo
  };
};
