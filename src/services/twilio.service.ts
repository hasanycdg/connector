import twilio from "twilio";
import { env } from "../config/env.js";
import { AppError } from "../lib/errors.js";

let client: ReturnType<typeof twilio> | null = null;

const getTwilioClient = (): ReturnType<typeof twilio> => {
  if (client) {
    return client;
  }

  try {
    client = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
    return client;
  } catch (error) {
    throw new AppError(
      "Twilio client configuration is invalid. Check TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.",
      500,
      {
        error: error instanceof Error ? error.message : String(error)
      }
    );
  }
};

const normalizeWhatsappAddress = (value: string): string =>
  value.startsWith("whatsapp:") ? value : `whatsapp:${value}`;

interface SendReviewMessageInput {
  to: string;
  businessName: string;
  rating: number;
  reviewerName: string;
  reviewComment: string;
  aiSuggestedReply: string;
  approvalToken: string;
}

export const sendReviewApprovalMessage = async ({
  to,
  businessName,
  rating,
  reviewerName,
  reviewComment,
  aiSuggestedReply,
  approvalToken
}: SendReviewMessageInput): Promise<void> => {
  const twilioClient = getTwilioClient();

  const messageBody = [
    "New Google Review",
    "",
    `Business: ${businessName}`,
    `Rating: ${rating}/5`,
    `Reviewer: ${reviewerName}`,
    "",
    "Review:",
    `\"${reviewComment || "(No text comment)"}\"`,
    "",
    "Suggested reply:",
    `\"${aiSuggestedReply}\"`,
    "",
    "To approve and post this exact reply to Google, reply:",
    `APPROVE ${approvalToken}`,
    "",
    "To reject:",
    `REJECT ${approvalToken}`
  ].join("\n");

  await twilioClient.messages.create({
    from: normalizeWhatsappAddress(env.TWILIO_WHATSAPP_FROM),
    to: normalizeWhatsappAddress(to),
    body: messageBody
  });
};

export const validateTwilioWebhookSignature = (
  signature: string | undefined,
  fullUrl: string,
  params: Record<string, string>
): boolean => {
  if (!signature) {
    return false;
  }

  return twilio.validateRequest(env.TWILIO_AUTH_TOKEN, signature, fullUrl, params);
};

export const createTwimlResponse = (message: string): string => {
  const escapedMessage = message
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");

  return `<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response><Message>${escapedMessage}</Message></Response>`;
};
