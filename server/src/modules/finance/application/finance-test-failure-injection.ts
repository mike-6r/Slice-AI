/** Test-only transaction seam; it has no HTTP exposure and is inert by default. */
export type FinanceFailureStage =
  | 'journal.after-transaction'
  | 'cash.reserve.after-create'
  | 'cash.release.after-update'
  | 'lot.disposal.after-lock'
  | 'reversal.after-transaction'
  | 'reconciliation.after-run';

let hook: ((stage: FinanceFailureStage) => void | Promise<void>) | undefined;

export const setFinanceTestFailureHook = (
  next: ((stage: FinanceFailureStage) => void | Promise<void>) | undefined,
) => {
  hook = next;
};

export const financeTestFailurePoint = async (stage: FinanceFailureStage) =>
  hook?.(stage);
