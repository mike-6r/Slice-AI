import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import type { Request, Response } from 'express';
import type { RequestWithId } from './request-id.middleware';
import { NestAppLogger } from '../logging/app-logger';

type PublicError = {
  code: string;
  message: string;
  fieldErrors?: Record<string, string[]>;
};

type ParserError = Error & {
  status?: number;
  type?: string;
};

@Catch()
export class GlobalHttpExceptionFilter extends BaseExceptionFilter {
  private readonly logger = new NestAppLogger();

  catch(exception: unknown, host: ArgumentsHost) {
    const context = host.switchToHttp();
    const request = context.getRequest<RequestWithId>();
    const response = context.getResponse<Response>();
    const status = getStatus(exception);
    const requestId = request.requestId ?? 'unknown';
    const publicError = toPublicError(exception, status);

    this.log(exception, request, requestId, status, publicError.code);
    if (exception instanceof HttpException) {
      const retryAfterSeconds = (
        exception as HttpException & {
          retryAfterSeconds?: unknown;
        }
      ).retryAfterSeconds;
      if (
        status === HttpStatus.TOO_MANY_REQUESTS &&
        typeof retryAfterSeconds === 'number' &&
        Number.isInteger(retryAfterSeconds) &&
        retryAfterSeconds > 0
      ) {
        response.setHeader('Retry-After', String(retryAfterSeconds));
        const rate = exception as HttpException & {
          limit?: unknown;
          remaining?: unknown;
        };
        if (typeof rate.limit === 'number' && Number.isInteger(rate.limit)) {
          response.setHeader('RateLimit-Limit', String(rate.limit));
        }
        if (
          typeof rate.remaining === 'number' &&
          Number.isInteger(rate.remaining)
        ) {
          response.setHeader('RateLimit-Remaining', String(rate.remaining));
        }
        response.setHeader('RateLimit-Reset', String(retryAfterSeconds));
      }
    }

    response.status(status).json({
      error: publicError,
      requestId,
      path: (request as Request).originalUrl,
      timestamp: new Date().toISOString(),
    });
  }

  private log(
    exception: unknown,
    request: Request,
    requestId: string,
    statusCode: number,
    code: string,
  ) {
    const fields = {
      timestamp: new Date().toISOString(),
      service: 'slice-api',
      environment: process.env.NODE_ENV ?? 'development',
      requestId,
      method: request.method,
      route: request.route?.path ?? request.path,
      path: request.path,
      statusCode,
      durationMs: 0,
      errorClass:
        exception instanceof Error
          ? exception.constructor.name
          : 'UnknownError',
      errorMessage:
        exception instanceof Error ? exception.message : String(exception),
      code,
    };

    if (statusCode >= 500) {
      this.logger.error('http.request.failed', fields);
    } else if (statusCode >= 400) {
      this.logger.warn('http.request.failed', fields);
    } else {
      this.logger.info('http.request.failed', fields);
    }
  }
}

function getStatus(exception: unknown) {
  if (exception instanceof HttpException) {
    return exception.getStatus();
  }

  const parserError = isObject(exception)
    ? (exception as ParserError)
    : undefined;
  return typeof parserError?.status === 'number'
    ? parserError.status
    : HttpStatus.INTERNAL_SERVER_ERROR;
}

export function toPublicError(exception: unknown, status: number): PublicError {
  const declared = declaredPublicError(exception);
  if (declared) return declared;
  if (isInvalidJson(exception)) {
    return {
      code: 'INVALID_JSON',
      message: 'Request body is not valid JSON.',
    };
  }

  if (status === HttpStatus.PAYLOAD_TOO_LARGE) {
    return {
      code: 'PAYLOAD_TOO_LARGE',
      message: 'Request payload is too large.',
    };
  }

  if (status === HttpStatus.NOT_FOUND) {
    return { code: 'NOT_FOUND', message: 'Resource not found.' };
  }

  if (status === HttpStatus.METHOD_NOT_ALLOWED) {
    return { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed.' };
  }

  if (status === HttpStatus.BAD_REQUEST) {
    return {
      code: 'VALIDATION_FAILED',
      message: 'Request validation failed.',
      fieldErrors: extractFieldErrors(exception),
    };
  }

  return {
    code: 'INTERNAL_ERROR',
    message: 'An unexpected error occurred.',
  };
}

function declaredPublicError(exception: unknown): PublicError | undefined {
  if (!(exception instanceof HttpException)) return undefined;
  const response = exception.getResponse();
  if (!response || typeof response !== 'object' || Array.isArray(response))
    return undefined;
  const value = response as {
    code?: unknown;
    message?: unknown;
    fieldErrors?: unknown;
  };
  return typeof value.code === 'string' && typeof value.message === 'string'
    ? {
        code: value.code,
        message: value.message,
        fieldErrors: isFieldErrors(value.fieldErrors)
          ? value.fieldErrors
          : undefined,
      }
    : undefined;
}

function isFieldErrors(value: unknown): value is Record<string, string[]> {
  return Boolean(
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.values(value as Record<string, unknown>).every(
      (item) =>
        Array.isArray(item) &&
        item.every((message) => typeof message === 'string'),
    ),
  );
}

function isInvalidJson(exception: unknown) {
  if (
    isObject(exception) &&
    (exception as ParserError).type === 'entity.parse.failed'
  ) {
    return true;
  }

  if (!(exception instanceof BadRequestException)) {
    return false;
  }

  const details = exception.getResponse();
  const message =
    isObject(details) &&
    typeof (details as { message?: unknown }).message === 'string'
      ? (details as { message: string }).message
      : '';
  return /json|unexpected (token|end)/i.test(message);
}

function extractFieldErrors(exception: unknown) {
  if (!(exception instanceof BadRequestException)) {
    return undefined;
  }

  const details = exception.getResponse();
  if (!details || typeof details !== 'object' || Array.isArray(details)) {
    return undefined;
  }

  const fieldErrors = (details as { fieldErrors?: unknown }).fieldErrors;
  if (
    !fieldErrors ||
    typeof fieldErrors !== 'object' ||
    Array.isArray(fieldErrors)
  ) {
    return undefined;
  }

  return Object.fromEntries(
    Object.entries(fieldErrors as Record<string, unknown>).flatMap(
      ([field, messages]) =>
        Array.isArray(messages) &&
        messages.every((message) => typeof message === 'string')
          ? [[field, messages] as [string, string[]]]
          : [],
    ),
  );
}

function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null;
}
