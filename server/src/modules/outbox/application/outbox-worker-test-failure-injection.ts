export type OutboxWorkerFailurePoint = 'outbox.before-success-finalize';

let hook: ((point: OutboxWorkerFailurePoint) => void | Promise<void>) | undefined;

/** Test-only service seam; never exposed by HTTP, configuration, or event payloads. */
export function setOutboxWorkerTestFailureHook(
  next: ((point: OutboxWorkerFailurePoint) => void | Promise<void>) | undefined,
) {
  hook = next;
}

export async function outboxWorkerTestFailurePoint(point: OutboxWorkerFailurePoint) {
  await hook?.(point);
}
