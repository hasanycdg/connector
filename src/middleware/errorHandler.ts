import type { NextFunction, Request, Response } from "express";
import { isAppError } from "../lib/errors.js";
import { logger } from "../config/logger.js";

export const errorHandler = (
  error: unknown,
  request: Request,
  response: Response,
  _next: NextFunction
): void => {
  if (isAppError(error)) {
    logger.warn(
      {
        err: error,
        path: request.path,
        details: error.details
      },
      error.message
    );

    response.status(error.statusCode).json({
      error: error.message,
      details: error.details
    });
    return;
  }

  logger.error({ err: error, path: request.path }, "Unhandled server error");

  response.status(500).json({
    error: "Internal server error"
  });
};
