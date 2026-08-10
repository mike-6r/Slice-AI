import type { NextFunction, Response } from 'express';
import type { RequestWithId } from './request-id.middleware';
import type { AppLogger } from '../logging/app-logger';

export function createRequestLogMiddleware(
  logger: AppLogger,
  context: { service: string; environment: string },
) {
  return function requestLogMiddleware(
    request: RequestWithId,
    response: Response,
    next: NextFunction,
  ) {
    const start = performance.now();
    response.on('finish', () => {
      try {
        logger.info('http.request.completed', {
          timestamp: new Date().toISOString(),
          service: context.service,
          environment: context.environment,
          requestId: request.requestId,
          method: request.method,
          route: request.route?.path ?? request.path,
          path: request.path,
          statusCode: response.statusCode,
          durationMs: Math.round(performance.now() - start),
        });
      } catch {
        // Operational logging must never affect a customer request.
      }
    });
    next();
  };
}
