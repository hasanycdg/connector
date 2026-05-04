import {
  applicationDefault,
  cert,
  getApps,
  initializeApp,
  type App,
  type AppOptions
} from "firebase-admin/app";
import { FieldValue, Timestamp, getFirestore } from "firebase-admin/firestore";
import { env } from "./env.js";
import { logger } from "./logger.js";

let firebaseApp: App | null = null;
let hasLoggedInitialization = false;

const toFirestoreSafeObject = (value: unknown): unknown => {
  if (value === undefined) {
    return null;
  }

  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (value instanceof Date || value instanceof Timestamp) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => toFirestoreSafeObject(item));
  }

  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).reduce<Record<string, unknown>>(
      (acc, [key, item]) => {
        const normalized = toFirestoreSafeObject(item);

        if (normalized !== undefined) {
          acc[key] = normalized;
        }

        return acc;
      },
      {}
    );
  }

  return String(value);
};

const buildFirebaseOptions = (): AppOptions => {
  const hasServiceAccount = Boolean(env.FIREBASE_CLIENT_EMAIL && env.FIREBASE_PRIVATE_KEY);

  if (hasServiceAccount) {
    return {
      projectId: env.FIREBASE_PROJECT_ID,
      credential: cert({
        projectId: env.FIREBASE_PROJECT_ID,
        clientEmail: env.FIREBASE_CLIENT_EMAIL,
        privateKey: env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n")
      })
    };
  }

  if (env.FIREBASE_USE_APPLICATION_DEFAULT) {
    return {
      projectId: env.FIREBASE_PROJECT_ID,
      credential: applicationDefault()
    };
  }

  return {
    projectId: env.FIREBASE_PROJECT_ID
  };
};

export const initializeFirebaseSdk = (): App => {
  if (firebaseApp) {
    return firebaseApp;
  }

  const existingApp = getApps()[0];

  firebaseApp = existingApp ?? initializeApp(buildFirebaseOptions());

  if (!hasLoggedInitialization) {
    logger.info(
      {
        firebaseProjectId: env.FIREBASE_PROJECT_ID,
        usingFirestoreEmulator: Boolean(env.FIRESTORE_EMULATOR_HOST)
      },
      "Firebase Admin SDK initialized"
    );
    hasLoggedInitialization = true;
  }

  return firebaseApp;
};

export const firestore = getFirestore(initializeFirebaseSdk());

const collectionName = (baseName: string): string =>
  env.FIRESTORE_COLLECTION_PREFIX ? `${env.FIRESTORE_COLLECTION_PREFIX}_${baseName}` : baseName;

export const collections = {
  users: () => firestore.collection(collectionName("users")),
  businesses: () => firestore.collection(collectionName("businesses")),
  reviews: () => firestore.collection(collectionName("reviews")),
  approvalTokens: () => firestore.collection(collectionName("approval_tokens")),
  auditLogs: () => firestore.collection(collectionName("audit_logs"))
};

export const asDate = (value: unknown, fallback = new Date()): Date => {
  if (value instanceof Date) {
    return value;
  }

  if (value instanceof Timestamp) {
    return value.toDate();
  }

  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return fallback;
};

export const asNullableDate = (value: unknown): Date | null => {
  if (value === null || value === undefined) {
    return null;
  }

  return asDate(value);
};

export const nowTimestamp = (): Date => new Date();

export const firestoreServerTimestamp = (): FieldValue => FieldValue.serverTimestamp();

export const toFirestoreMetadata = (value: unknown): Record<string, unknown> =>
  (toFirestoreSafeObject(value) as Record<string, unknown>) ?? {};
