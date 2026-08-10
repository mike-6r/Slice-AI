import { BadRequestException, type ValidationError } from '@nestjs/common';

export function validationExceptionFactory(errors: ValidationError[]) {
  const fieldErrors: Record<string, string[]> = {};

  for (const error of errors) {
    collectFieldErrors(error, '', fieldErrors);
  }

  return new BadRequestException({
    code: 'VALIDATION_FAILED',
    message: 'Request validation failed.',
    fieldErrors,
  });
}

function collectFieldErrors(
  error: ValidationError,
  parentPath: string,
  fieldErrors: Record<string, string[]>,
) {
  const path = parentPath ? `${parentPath}.${error.property}` : error.property;
  if (error.constraints) {
    fieldErrors[path] = Object.values(error.constraints);
  }
  for (const child of error.children ?? []) {
    collectFieldErrors(child, path, fieldErrors);
  }
}
