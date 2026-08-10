let hook: (() => void | Promise<void>) | undefined;
export function setNotificationDeliveryWorkerTestFailureHook(next: (() => void | Promise<void>) | undefined) { hook = next; }
export async function notificationDeliveryWorkerTestFailure() { await hook?.(); }
