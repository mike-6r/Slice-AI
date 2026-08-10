/**
 * Deterministic transaction-failure seam for real-service tests. It has no
 * HTTP surface and is unreachable outside NODE_ENV=test.
 */
export function throwIfOwnershipTestFailure(point: string): void {
  if (
    process.env.NODE_ENV === 'test' &&
    process.env.SLICE_TEST_OWNERSHIP_FAIL_AT === point
  ) {
    throw new Error(`OWNERSHIP_TEST_FAILURE:${point}`);
  }
}
