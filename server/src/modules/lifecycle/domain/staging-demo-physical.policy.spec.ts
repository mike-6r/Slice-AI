import {
  hasStagingDemoPhysicalReadiness,
  isEligiblePikachuOwnerDemo,
  isProtectedControlledAsset,
} from './staging-demo-physical.policy';

const pikachu = {
  owner: { email: 'demo-collector@slicecollectable.com' },
  asset: {
    title: 'Pikachu With Grey Felt Hat',
    year: 2023,
    cardNumber: '85',
    certificationNumber: '107760843',
    category: { name: 'Pokémon TCG' },
    collectibleSet: { name: 'Pokémon x Van Gogh' },
    gradeScaleEntry: { company: { code: 'PSA' }, grade: { toString: () => '10' } },
  },
};

describe('staging demo physical policy', () => {
  it('allows only the immutable Pikachu owner-demo fixture', () => {
    expect(isEligiblePikachuOwnerDemo(pikachu)).toBe(true);
    expect(isEligiblePikachuOwnerDemo({ ...pikachu, owner: { email: 'other@example.com' } })).toBe(false);
    expect(isEligiblePikachuOwnerDemo({ ...pikachu, asset: { ...pikachu.asset, certificationNumber: 'different' } })).toBe(false);
  });

  it('explicitly protects the controlled Umbreon and Charizard fixtures', () => {
    expect(isProtectedControlledAsset({ title: 'Umbreon VMAX', collectibleSet: { name: 'Evolving Skies' } })).toBe(true);
    expect(isProtectedControlledAsset({ title: 'Charizard', collectibleSet: { name: 'Base Set' } })).toBe(true);
    expect(isProtectedControlledAsset(pikachu.asset)).toBe(false);
  });

  it('never treats simulated custody as production physical readiness', () => {
    expect(hasStagingDemoPhysicalReadiness(false, { status: 'DEMO_CUSTODY' })).toBe(false);
    expect(hasStagingDemoPhysicalReadiness(true, null)).toBe(false);
    expect(hasStagingDemoPhysicalReadiness(true, { status: 'DEMO_CUSTODY' })).toBe(true);
  });
});
