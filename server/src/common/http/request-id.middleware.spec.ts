import type { NextFunction, Response } from 'express';
import { requestIdMiddleware } from './request-id.middleware';

describe('requestIdMiddleware', () => {
  const validRequestId = 'c1b32d9e-4920-4a5a-bd56-4d98663cd0f4';

  function invoke(header?: string) {
    const request: { header: jest.Mock; requestId?: string } = {
      header: jest.fn().mockReturnValue(header),
    };
    const response = { setHeader: jest.fn() };
    const next = jest.fn() as NextFunction;

    requestIdMiddleware(
      request as never,
      response as unknown as Response,
      next,
    );
    return { request, response, next };
  }

  it('accepts and echoes exactly one lower-case UUID v4', () => {
    const { request, response, next } = invoke(validRequestId);

    expect(request).toMatchObject({ requestId: validRequestId });
    expect(response.setHeader).toHaveBeenCalledWith(
      'x-request-id',
      validRequestId,
    );
    expect(next).toHaveBeenCalledTimes(1);
  });

  it.each([
    undefined,
    validRequestId.toUpperCase(),
    'b3b32d9e-4920-4a5a-bd56-4d98663cd0f4',
    `${validRequestId},${validRequestId}`,
  ])('replaces missing, malformed and multiple values: %s', (header) => {
    const { request, response } = invoke(header);

    expect(request).toMatchObject({
      requestId: expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      ),
    });
    expect(response.setHeader).toHaveBeenCalledWith(
      'x-request-id',
      request.requestId,
    );
  });
});
