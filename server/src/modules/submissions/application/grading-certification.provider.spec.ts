import { PsaCertificationProvider } from './grading-certification.provider';

const config = {
  psaCertificationVerificationEnabled: true,
  psaCertificationApiUrl: 'https://psa.example.test/certificates',
  psaCertificationApiKey: 'test-key',
  psaCertificationTimeoutMs: 1_000,
  psaCertificationMaxRetries: 0,
};

describe('PSA certification provider', () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    jest.restoreAllMocks();
    fetchMock.mockReset();
    jest.spyOn(global, 'fetch').mockImplementation(fetchMock);
  });

  it('normalizes a verified PSA response without fabricating its grade', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          status: 'VERIFIED',
          certificationNumber: '123-456',
          grade: '10',
          label: 'GEM MT 10',
          requestId: 'psa-trace-1',
          identity: { name: 'Example card', year: '2026' },
        }),
        { status: 200 },
      ),
    );
    const result = await new PsaCertificationProvider(config as never).verify({
      companyCode: 'PSA',
      certificationNumber: '123 456',
    });
    expect(result).toMatchObject({
      status: 'VERIFIED',
      certificationNumber: '123456',
      verifiedGrade: '10.00',
      providerReference: 'psa-trace-1',
      verifiedIdentity: expect.objectContaining({ companyCode: 'PSA' }),
    });
  });

  it('persists no grade when PSA cannot find the certificate', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 404 }));
    const result = await new PsaCertificationProvider(config as never).verify({
      companyCode: 'PSA',
      certificationNumber: '123456',
    });
    expect(result).toEqual(
      expect.objectContaining({
        status: 'CERT_NOT_FOUND',
        verifiedGrade: null,
        verifiedIdentity: null,
      }),
    );
  });

  it('fails closed when the provider is unavailable or disabled', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));
    const provider = new PsaCertificationProvider(config as never);
    await expect(
      provider.verify({ companyCode: 'PSA', certificationNumber: '123456' }),
    ).resolves.toMatchObject({
      status: 'TEMPORARILY_UNAVAILABLE',
      verifiedGrade: null,
    });
    await expect(
      new PsaCertificationProvider({
        ...config,
        psaCertificationVerificationEnabled: false,
      } as never).verify({ companyCode: 'PSA', certificationNumber: '123456' }),
    ).resolves.toMatchObject({ status: 'UNSUPPORTED', verifiedGrade: null });
  });
});
