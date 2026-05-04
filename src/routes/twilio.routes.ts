import express, { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { env } from "../config/env.js";
import {
  createTwimlResponse,
  validateTwilioWebhookSignature
} from "../services/twilio.service.js";
import { handleApprovalAction, type ApprovalAction } from "../services/approval.service.js";

const router = Router();

const extractBodyFields = (body: unknown): Record<string, string> => {
  if (!body || typeof body !== "object") {
    return {};
  }

  return Object.entries(body).reduce<Record<string, string>>((acc, [key, value]) => {
    if (Array.isArray(value)) {
      acc[key] = String(value[0] ?? "");
      return acc;
    }

    acc[key] = typeof value === "string" ? value : String(value ?? "");
    return acc;
  }, {});
};

router.post(
  "/whatsapp",
  express.urlencoded({ extended: false }),
  asyncHandler(async (request, response) => {
    const params = extractBodyFields(request.body);
    const signature = request.header("X-Twilio-Signature");

    const url = `${env.APP_BASE_URL}${request.originalUrl}`;
    const signatureValid = validateTwilioWebhookSignature(signature, url, params);

    if (!signatureValid) {
      response
        .status(403)
        .type("text/xml")
        .send(createTwimlResponse("Invalid request signature."));
      return;
    }

    const incomingBody = (params.Body ?? "").trim();
    const incomingFrom = (params.From ?? "").trim();

    const commandMatch = incomingBody.match(/^(APPROVE|REJECT)\s+([A-Za-z0-9_-]{16,})$/i);

    if (!commandMatch) {
      response
        .status(200)
        .type("text/xml")
        .send(
          createTwimlResponse(
            "Command not recognized. Use APPROVE <token> or REJECT <token>."
          )
        );
      return;
    }

    const rawAction = commandMatch[1];
    const token = commandMatch[2];

    if (!rawAction || !token) {
      response.status(200).type("text/xml").send(createTwimlResponse("Invalid command format."));
      return;
    }

    const action = rawAction.toUpperCase() as ApprovalAction;

    const outcomeMessage = await handleApprovalAction({
      action,
      token,
      whatsappFrom: incomingFrom
    });

    response.status(200).type("text/xml").send(createTwimlResponse(outcomeMessage));
  })
);

export const twilioRoutes = router;
