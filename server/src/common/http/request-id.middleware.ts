import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';

export type RequestWithId = Request & { requestId?: string };
const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function requestIdMiddleware(
  request: RequestWithId,
  response: Response,
  next: NextFunction,
) {
  const supplied = request.header('x-request-id');
  const requestId =
    supplied && UUID_V4.test(supplied) ? supplied : randomUUID();
  request.requestId = requestId;
  response.setHeader('x-request-id', requestId);
  next();
}
