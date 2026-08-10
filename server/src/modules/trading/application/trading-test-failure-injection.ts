export type TradingFailurePoint =
  | 'order.after-reservation'
  | 'order.after-insert'
  | 'order.before-commit'
  | 'cancel.after-order-update'
  | 'expiry.after-order-update'
  | 'execution.after-lock'
  | 'execution.after-ownership'
  | 'execution.after-cash'
  | 'execution.after-execution-create'
  | 'execution.after-outbox-append'
  | 'execution.after-order-updates';

let hook: ((point: TradingFailurePoint) => void | Promise<void>) | undefined;

/** Test-only transaction seam. It is not exposed through HTTP or config. */
export function setTradingTestFailureHook(
  next: ((point: TradingFailurePoint) => void | Promise<void>) | undefined,
) {
  hook = next;
}

export async function tradingTestFailurePoint(point: TradingFailurePoint) {
  await hook?.(point);
}
