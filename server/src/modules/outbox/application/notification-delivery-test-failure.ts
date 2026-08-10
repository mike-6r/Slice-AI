let hook: ((index: number) => void | Promise<void>) | undefined;

/** Test-only transaction seam; it is not reachable through HTTP or configuration. */
export function setNotificationDeliveryTestFailureHook(next: ((index: number) => void | Promise<void>) | undefined) { hook = next; }
export async function notificationDeliveryTestFailure(index: number) { await hook?.(index); }
