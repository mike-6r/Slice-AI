import type { NextFunction, Request, Response } from 'express';
import type { AppConfig } from '../../config/app-config';

type ControlledFeature = keyof AppConfig['operationalFeatures'];

/**
 * A narrow, deployment-configured kill switch for new risk. It leaves reads,
 * cancellations, reconciliation and inbound provider webhooks available so an
 * operator can safely unwind or recover work while a feature is paused.
 */
export function createOperationalControlsMiddleware(config: AppConfig) {
  return (request: Request, response: Response, next: NextFunction) => {
    const feature = featureForRequest(request.method, request.path);
    if (!feature || config.operationalFeatures[feature]) {
      next();
      return;
    }

    response.status(503).json({
      error: {
        code: 'FEATURE_DISABLED',
        message: 'This operation is temporarily unavailable.',
      },
      requestId:
        (request as Request & { requestId?: string }).requestId ?? 'unknown',
      path: request.originalUrl,
      timestamp: new Date().toISOString(),
    });
  };
}

function featureForRequest(
  method: string,
  path: string,
): ControlledFeature | undefined {
  if (method === 'GET' && path === '/api/v1/me/notifications/stream') {
    return 'realtime';
  }
  if (method === 'POST' && path === '/api/v1/wallet/deposits') {
    return 'deposits';
  }
  if (method === 'POST' && path === '/api/v1/wallet/withdrawals') {
    return 'withdrawals';
  }
  if (
    method === 'POST' &&
    /^\/api\/v1\/trading\/orders(?:\/preview)?$/.test(path)
  ) {
    return 'trading';
  }
  if (
    ['POST', 'PATCH', 'PUT'].includes(method) &&
    /^\/api\/v1\/submissions(?:\/|$)/.test(path)
  ) {
    return 'listing';
  }
  return undefined;
}

export { featureForRequest };
