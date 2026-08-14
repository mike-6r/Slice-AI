/** Format ownership units as a customer-facing percentage without floating point math. */
export function formatOwnershipPercent(units: bigint, total: bigint) {
  if (total < 1n) return '0';
  const scaled = (units * 10_000n) / total;
  const whole = scaled / 100n;
  const fraction = (scaled % 100n).toString().padStart(2, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole.toString();
}
