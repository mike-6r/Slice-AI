export type DropReadinessInput = {
  name: string;
  description: string;
  inventoryCount: number;
  lockCount: number;
  inventoryEligible: boolean;
};

export function calculateDropReadiness(input: DropReadinessInput) {
  const checks = [
    {
      code: 'NAME_COMPLETE',
      passed: input.name.trim().length >= 3,
      message: 'Add a clear Drop name.',
    },
    {
      code: 'DESCRIPTION_COMPLETE',
      passed: input.description.trim().length >= 20,
      message: 'Explain what makes this Drop distinct.',
    },
    {
      code: 'INVENTORY_PRESENT',
      passed: input.inventoryCount > 0,
      message: 'Select at least one eligible collectible.',
    },
    {
      code: 'LOCKS_COMPLETE',
      passed: input.lockCount === input.inventoryCount,
      message: 'Every selected collectible must hold an exclusive lock.',
    },
    {
      code: 'INVENTORY_ELIGIBLE',
      passed: input.inventoryEligible,
      message:
        'Every collectible must still satisfy custody, verification, and ownership rules.',
    },
  ];
  return { ready: checks.every((check) => check.passed), checks };
}
