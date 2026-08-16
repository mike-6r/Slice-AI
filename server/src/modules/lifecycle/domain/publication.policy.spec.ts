import {
  assertCustodyTransition,
  evaluateReadiness,
} from './publication.policy';

describe('publication policy', () => {
  it('permits only explicit custody transitions', () => {
    expect(() =>
      assertCustodyTransition('RECEIVED', 'INSPECTED'),
    ).not.toThrow();
    expect(() => assertCustodyTransition('EXPECTED', 'SECURED')).toThrow(
      'That custody transition is not allowed.',
    );
  });

  it('blocks publication until all evidence-backed gates are satisfied', () => {
    expect(
      evaluateReadiness({
        cataloguePublished: true,
        verificationApproved: true,
        activeDecision: true,
        custodySecured: true,
        activeCoverage: true,
        hasException: false,
      }),
    ).toMatchObject({
      status: 'READY',
      blockingCodes: [],
      controlledBetaPhysicalBypass: false,
    });
    expect(
      evaluateReadiness({
        cataloguePublished: false,
        verificationApproved: false,
        activeDecision: false,
        custodySecured: false,
        activeCoverage: false,
        hasException: true,
      }).blockingCodes,
    ).toContain('VALUATION_REQUIRED');
  });

  it('allows only the named controlled beta physical bypass to satisfy custody', () => {
    expect(
      evaluateReadiness({
        cataloguePublished: true,
        verificationApproved: true,
        activeDecision: true,
        custodySecured: false,
        controlledBetaPhysicalBypass: true,
        activeCoverage: true,
        hasException: false,
      }),
    ).toMatchObject({ status: 'READY', blockingCodes: [] });
    expect(
      evaluateReadiness({
        cataloguePublished: true,
        verificationApproved: true,
        activeDecision: true,
        custodySecured: false,
        controlledBetaPhysicalBypass: false,
        activeCoverage: true,
        hasException: false,
      }).blockingCodes,
    ).toContain('CUSTODY_NOT_SECURED');
    expect(
      evaluateReadiness({
        cataloguePublished: true,
        verificationApproved: true,
        activeDecision: true,
        custodySecured: false,
        controlledBetaPhysicalBypass: true,
        activeCoverage: true,
        hasException: true,
      }).blockingCodes,
    ).toContain('LIFECYCLE_EXCEPTION');
  });
});
