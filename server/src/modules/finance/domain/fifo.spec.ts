import { allocateFifoLots } from './fifo';

describe('FIFO lot allocation', () => {
  const at = new Date('2026-01-01T00:00:00.000Z');

  it('consumes the oldest lot first and conserves the final remainder', () => {
    const allocations = allocateFifoLots(
      [
        {
          id: 'b',
          acquiredAt: at,
          acquiredUnits: 3n,
          remainingUnits: 3n,
          totalCostMinor: 100n,
          allocatedCostMinor: 0n,
        },
        {
          id: 'a',
          acquiredAt: at,
          acquiredUnits: 2n,
          remainingUnits: 2n,
          totalCostMinor: 90n,
          allocatedCostMinor: 0n,
        },
      ],
      4n,
    );
    expect(allocations).toEqual([
      { lotId: 'a', units: 2n, allocatedCostMinor: 90n },
      { lotId: 'b', units: 2n, allocatedCostMinor: 66n },
    ]);
  });

  it('allocates all remaining cost when a lot is fully consumed', () => {
    expect(
      allocateFifoLots(
        [
          {
            id: 'a',
            acquiredAt: at,
            acquiredUnits: 3n,
            remainingUnits: 3n,
            totalCostMinor: 100n,
            allocatedCostMinor: 66n,
          },
        ],
        3n,
      ),
    ).toEqual([{ lotId: 'a', units: 3n, allocatedCostMinor: 34n }]);
  });
});
