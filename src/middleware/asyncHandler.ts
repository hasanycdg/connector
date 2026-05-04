import type { NextFunction, Request, RequestHandler, Response } from "express";

export const asyncHandler =
  (
    fn: (request: Request, response: Response, next: NextFunction) => Promise<void>
  ): RequestHandler =>
  (request, response, next) => {
    void Promise.resolve(fn(request, response, next)).catch(next);
  };
