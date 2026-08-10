export type QaHarnessSnapshot = Readonly<{
  refreshCalls: number;
  expiredTokenTriggered: boolean;
  forcedMutationFailures: number;
  parallelGetsExecuted: boolean;
  rollbackEvents: number;
}>;

type QaHarnessState = {
  refreshCalls: number;
  expiredTokenTriggered: boolean;
  forcedMutationFailures: number;
  parallelGetsExecuted: boolean;
  rollbackEvents: number;
};

declare global {
  interface Window {
    __sliceQa?: QaHarnessSnapshot;
  }
}

export const qaHarnessEnabled =
  import.meta.env.DEV && import.meta.env.VITE_ENABLE_QA_HARNESS === "true";

const value: QaHarnessState = {
  refreshCalls: 0,
  expiredTokenTriggered: false,
  forcedMutationFailures: 0,
  parallelGetsExecuted: false,
  rollbackEvents: 0,
};

const snapshot = (): QaHarnessSnapshot => Object.freeze({ ...value });

const publishSnapshot = () => {
  if (!qaHarnessEnabled || typeof document === "undefined") return;
  document.documentElement.dataset.sliceQa = JSON.stringify(snapshot());
};

export function installQaHarness(
  target: Window | undefined = typeof window === "undefined" ? undefined : window,
  enabled = qaHarnessEnabled,
) {
  if (!enabled || !target) return;
  Object.defineProperty(target, "__sliceQa", {
    configurable: true,
    get: snapshot,
  });
  publishSnapshot();
}

installQaHarness();

export const qaSearchFlag = (name: string) =>
  qaHarnessEnabled && typeof window !== "undefined"
    ? new URLSearchParams(window.location.search).get(name) === "1"
    : false;

export const recordQaRefresh = () => {
  if (!qaHarnessEnabled) return;
  value.refreshCalls += 1;
  publishSnapshot();
};

export const recordQaExpiredToken = () => {
  if (!qaHarnessEnabled) return;
  value.expiredTokenTriggered = true;
  publishSnapshot();
};

export const consumeQaMutationFailure = () => {
  if (!qaSearchFlag("qa_fail_mutation") || value.forcedMutationFailures > 0) return false;
  value.forcedMutationFailures += 1;
  publishSnapshot();
  return true;
};

export const takeQaMutationFailure = () => {
  if (!consumeQaMutationFailure()) return undefined;
  return {
    code: "QA_FORCED_FAILURE",
    message: "QA forced mutation failure.",
    status: 503,
  };
};

export const markQaParallelGetsCompleted = () => {
  if (!qaHarnessEnabled) return;
  value.parallelGetsExecuted = true;
  publishSnapshot();
};

export const recordQaRollback = () => {
  if (!qaHarnessEnabled) return;
  value.rollbackEvents += 1;
  publishSnapshot();
};
