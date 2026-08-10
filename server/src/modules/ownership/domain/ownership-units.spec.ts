import { parseOwnershipUnits } from './ownership-units';

describe('ownership units', () => {
  it('accepts bounded positive integer unit strings', () => {
    expect(parseOwnershipUnits('1')).toBe(1n);
    expect(parseOwnershipUnits('1000000')).toBe(1_000_000n);
  });

  it.each(['0', '-1', '+1', '1.5', '1e3', ' 1', '1000001'])(
    'rejects a non-authoritative unit representation: %s',
    (value) => expect(() => parseOwnershipUnits(value)).toThrow(),
  );
});
