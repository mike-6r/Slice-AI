/** Test-only transactional seams for Document 015; never exposed through HTTP. */
export type CommunityFailurePoint =
  | 'governance.open.after-snapshot'
  | 'governance.vote.after-supersede'
  | 'governance.close.after-tally'
  | 'distribution.prepare.after-create'
  | 'distribution.execute.after-journal'
  | 'distribution.reconcile.before-persist';

let hook: ((point: CommunityFailurePoint) => void | Promise<void>) | undefined;

export function setCommunityTestFailureHook(
  next: ((point: CommunityFailurePoint) => void | Promise<void>) | undefined,
) {
  hook = next;
}

export async function communityTestFailurePoint(point: CommunityFailurePoint) {
  await hook?.(point);
}
