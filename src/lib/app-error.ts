export class AppError extends Error {
  constructor(
    message: string,
    public readonly code = "APP_ERROR",
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}
export class ValidationError extends AppError {
  constructor(
    message: string,
    public readonly fields: Record<string, string> = {},
  ) {
    super(message, "VALIDATION_ERROR");
    this.name = "ValidationError";
  }
}
export class RepositoryError extends AppError {
  constructor(message = "Data could not be loaded.", cause?: unknown) {
    super(message, "REPOSITORY_ERROR", cause);
    this.name = "RepositoryError";
  }
}
export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(`${resource} was not found.`, "NOT_FOUND");
    this.name = "NotFoundError";
  }
}
export class DemoActionError extends AppError {
  constructor(message: string) {
    super(message, "DEMO_ACTION_ERROR");
    this.name = "DemoActionError";
  }
}
export const toUserSafeMessage = (error: unknown) =>
  error instanceof AppError ? error.message : "Something went wrong. Please try again.";
