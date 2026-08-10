/** Test-only provider transaction seam; inert unless an integration test installs a hook. */
export type ProviderFailureStage =
  | 'movement.withdrawal.before-reservation'
  | 'movement.complete.before-journal'
  | 'movement.complete.after-journal'
  | 'movement.cancel.before-release';

let hook: ((stage: ProviderFailureStage) => void | Promise<void>) | undefined;

export function setProviderTestFailureHook(
  next: ((stage: ProviderFailureStage) => void | Promise<void>) | undefined,
) {
  hook = next;
}

export async function providerTestFailurePoint(stage: ProviderFailureStage) {
  await hook?.(stage);
}
