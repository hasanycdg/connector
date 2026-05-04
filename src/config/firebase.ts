import { getApps, initializeApp, type FirebaseApp, type FirebaseOptions } from "firebase/app";
import { env } from "./env.js";
import { logger } from "./logger.js";

const firebaseConfig: FirebaseOptions = {
  apiKey: env.FIREBASE_API_KEY,
  authDomain: env.FIREBASE_AUTH_DOMAIN,
  projectId: env.FIREBASE_PROJECT_ID,
  storageBucket: env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.FIREBASE_MESSAGING_SENDER_ID,
  appId: env.FIREBASE_APP_ID,
  measurementId: env.FIREBASE_MEASUREMENT_ID
};

let firebaseApp: FirebaseApp | null = null;

export const initializeFirebaseSdk = (): FirebaseApp => {
  if (firebaseApp) {
    return firebaseApp;
  }

  firebaseApp = getApps()[0] ?? initializeApp(firebaseConfig);

  logger.info(
    {
      firebaseProjectId: firebaseConfig.projectId
    },
    "Firebase SDK initialized"
  );

  return firebaseApp;
};

export const getFirebaseConfig = (): FirebaseOptions => firebaseConfig;

export const getFirebaseApp = (): FirebaseApp | null => firebaseApp;

// Firebase Analytics from `firebase/analytics` works only in browser environments.
