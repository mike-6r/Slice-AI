export type AdminEnrichmentState =
  'AVAILABLE' | 'UNAVAILABLE' | 'STALE' | 'NOT_APPLICABLE';

type SafeWarningLogger = {
  warn(message: string): void;
};

export async function loadOptionalAdminEnrichment<T>(
  name: string,
  operation: () => Promise<T>,
  fallback: T,
  logger: SafeWarningLogger,
): Promise<{ value: T; state: AdminEnrichmentState }> {
  try {
    return { value: await operation(), state: 'AVAILABLE' };
  } catch (error) {
    const errorType = error instanceof Error ? error.name : typeof error;
    logger.warn(
      `Admin optional enrichment unavailable: ${name} (${errorType})`,
    );
    return { value: fallback, state: 'UNAVAILABLE' };
  }
}
