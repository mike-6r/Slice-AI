import type { Response } from 'express';
import { createRequestLogMiddleware } from './request-log.middleware';

describe('createRequestLogMiddleware', () => {
  it('writes one structured completion record without logging the request body', () => {
    const info = jest.fn();
    const finish = jest.fn();
    const middleware = createRequestLogMiddleware(
      { info, warn: jest.fn(), error: jest.fn() },
      { service: 'slice-api', environment: 'test' },
    );
    const response = {
      statusCode: 200,
      on: jest.fn((event: string, callback: () => void) => {
        if (event === 'finish') finish.mockImplementation(callback);
      }),
    };

    middleware(
      {
        requestId: 'c1b32d9e-4920-4a5a-bd56-4d98663cd0f4',
        method: 'GET',
        path: '/health',
        body: { password: 'never log this' },
      } as never,
      response as unknown as Response,
      jest.fn(),
    );
    finish();

    expect(info).toHaveBeenCalledWith(
      'http.request.completed',
      expect.objectContaining({
        service: 'slice-api',
        environment: 'test',
        statusCode: 200,
      }),
    );
    expect(JSON.stringify(info.mock.calls)).not.toContain('never log this');
  });
});
