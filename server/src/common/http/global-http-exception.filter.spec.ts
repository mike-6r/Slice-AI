import { BadRequestException, HttpException, HttpStatus } from '@nestjs/common';
import { toPublicError } from './global-http-exception.filter';

describe('toPublicError', () => {
  it.each([
    [new HttpException('missing', HttpStatus.NOT_FOUND), 404, 'NOT_FOUND'],
    [
      new HttpException('large', HttpStatus.PAYLOAD_TOO_LARGE),
      413,
      'PAYLOAD_TOO_LARGE',
    ],
    [
      new HttpException('method', HttpStatus.METHOD_NOT_ALLOWED),
      405,
      'METHOD_NOT_ALLOWED',
    ],
    [new Error('private'), 500, 'INTERNAL_ERROR'],
  ])('maps status %s to %s', (exception, status, code) => {
    expect(toPublicError(exception, status).code).toBe(code);
  });

  it('maps parser failures without returning their private cause', () => {
    const error = Object.assign(new SyntaxError('Unexpected token secret'), {
      status: 400,
      type: 'entity.parse.failed',
    });

    expect(toPublicError(error, 400)).toEqual({
      code: 'INVALID_JSON',
      message: 'Request body is not valid JSON.',
    });
  });

  it('preserves only validation field paths and messages', () => {
    const exception = new BadRequestException({
      fieldErrors: { email: ['email must be an email'] },
    });

    expect(toPublicError(exception, 400)).toEqual({
      code: 'VALIDATION_FAILED',
      message: 'Request validation failed.',
      fieldErrors: { email: ['email must be an email'] },
    });
  });
});
