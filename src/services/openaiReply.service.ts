import OpenAI from "openai";
import { env } from "../config/env.js";
import { AppError } from "../lib/errors.js";

const openai = new OpenAI({
  apiKey: env.OPENAI_API_KEY
});

const SYSTEM_PROMPT = `You write short review replies for local businesses.
Rules:
- Reply in the same language as the review text.
- Friendly, professional, human tone.
- Keep it short.
- Do not make promises.
- Do not mention AI.
- If review is negative, be empathetic and invite direct contact.
- If review is positive, thank naturally.
- Avoid copy-paste generic wording.
- Return only the final reply text.`;

interface GenerateReplyInput {
  businessName: string;
  reviewerName: string;
  rating: number;
  reviewComment: string;
}

export const generateAiReplySuggestion = async ({
  businessName,
  reviewerName,
  rating,
  reviewComment
}: GenerateReplyInput): Promise<string> => {
  const userPrompt = [
    `Business: ${businessName}`,
    `Reviewer: ${reviewerName}`,
    `Rating: ${rating}/5`,
    `Review text: ${reviewComment || "(empty review text)"}`
  ].join("\n");

  const response = await openai.responses.create({
    model: env.OPENAI_MODEL,
    temperature: 0.6,
    max_output_tokens: 180,
    input: [
      {
        role: "system",
        content: SYSTEM_PROMPT
      },
      {
        role: "user",
        content: userPrompt
      }
    ]
  });

  const suggestedReply = response.output_text.trim();

  if (!suggestedReply) {
    throw new AppError("OpenAI returned an empty reply suggestion.", 502);
  }

  return suggestedReply;
};
