import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { env } from "../config/env.js";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const ENCRYPTION_VERSION = "v1";

let cachedKey: Buffer | null = null;

const parseEncryptionKey = (): Buffer => {
  if (cachedKey) {
    return cachedKey;
  }

  const raw = env.TOKEN_ENCRYPTION_KEY.trim();

  const candidates: Buffer[] = [
    Buffer.from(raw, "base64"),
    Buffer.from(raw, "hex"),
    Buffer.from(raw, "utf8")
  ];

  const key = candidates.find((candidate) => candidate.length === 32);

  if (!key) {
    throw new Error(
      "TOKEN_ENCRYPTION_KEY must resolve to 32 bytes. Use a 32-byte raw string, base64, or hex value."
    );
  }

  cachedKey = key;
  return key;
};

export const encryptText = (plainText: string): string => {
  const key = parseEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH
  });

  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${ENCRYPTION_VERSION}.${iv.toString("base64url")}.${authTag.toString("base64url")}.${encrypted.toString("base64url")}`;
};

export const decryptText = (encryptedText: string): string => {
  const key = parseEncryptionKey();
  const [version, ivB64Url, tagB64Url, cipherB64Url] = encryptedText.split(".");

  if (version !== ENCRYPTION_VERSION || !ivB64Url || !tagB64Url || !cipherB64Url) {
    throw new Error("Encrypted value format is invalid.");
  }

  const iv = Buffer.from(ivB64Url, "base64url");
  const authTag = Buffer.from(tagB64Url, "base64url");
  const ciphertext = Buffer.from(cipherB64Url, "base64url");

  const decipher = createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH
  });

  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

  return decrypted.toString("utf8");
};
