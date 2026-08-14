import type { AppConfig } from '../../../config/app-config';
import { XimilarRawCardPreGradeProvider } from './raw-card-pregrade.provider';

describe('XimilarRawCardPreGradeProvider', () => {
  const config = {
    ximilarEnabled: true,
    ximilarCardGradingEnabled: true,
    ximilarApiToken: 'server-only-token',
    ximilarTimeoutMs: 5_000,
    ximilarMaxRetries: 0,
  } as AppConfig;

  afterEach(() => jest.restoreAllMocks());

  it('submits both images to the official async card-grader endpoint and normalizes the result', async () => {
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'request-1', status: 'CREATED' }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 'request-1',
            status: 'DONE',
            response: {
              records: [
                {
                  _status: { code: 200, text: 'OK' },
                  card: [
                    {
                      _id: 'front',
                      _tags: {
                        Side: [{ name: 'Front' }],
                        Category: [{ name: 'Card/Trading Card Game' }],
                        Autograph: [{ name: 'No' }],
                      },
                      _full_url_card: 'https://s3-eu-west-1.amazonaws.com/x/front.webp',
                      _exact_url_card: 'https://s3-eu-west-1.amazonaws.com/x/front-centering.webp',
                    },
                  ],
                  grades: {
                    final: 8.5,
                    corners: 8,
                    edges: 9,
                    surface: 8,
                    centering: 9,
                    condition: 'Near Mint',
                  },
                  versions: { final: 'model-v1' },
                },
                {
                  _status: { code: 200, text: 'OK' },
                  card: [{ _id: 'back', _tags: { Side: [{ name: 'Back' }] } }],
                  grades: { final: 8, corners: 8, edges: 8, surface: 8, centering: 8, condition: 'Near Mint' },
                  _full_url_card: 'https://s3-eu-west-1.amazonaws.com/x/back.webp',
                },
              ],
            },
          }),
          { status: 200 },
        ),
      );

    const result = await new XimilarRawCardPreGradeProvider(config).analyze({
      front: Buffer.from('front'),
      back: Buffer.from('back'),
    });

    expect(result.status).toBe('SUCCEEDED');
    expect(result.providerRequestId).toBe('request-1');
    expect(result.overallEstimate).toBe(8.5);
    expect(result.conditionLabel).toBe('Near Mint');
    expect(result.centeringScore).toBe(9);
    expect(result.visualizations).toEqual([
      expect.objectContaining({ side: 'FRONT', overviewUrl: 'https://s3-eu-west-1.amazonaws.com/x/front.webp', centeringUrl: 'https://s3-eu-west-1.amazonaws.com/x/front-centering.webp' }),
      expect.objectContaining({ side: 'BACK', overviewUrl: 'https://s3-eu-west-1.amazonaws.com/x/back.webp' }),
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.ximilar.com/account/v2/request/',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Token server-only-token',
        }),
      }),
    );
    expect(fetchMock.mock.calls[0]?.[1]).not.toEqual(
      expect.objectContaining({
        body: expect.stringContaining('server-only-token'),
      }),
    );
  });

  it('returns an explicit not-configured state without calling the provider', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch');
    const result = await new XimilarRawCardPreGradeProvider({
      ...config,
      ximilarApiToken: undefined,
    } as AppConfig).analyze({
      front: Buffer.from('front'),
      back: Buffer.from('back'),
    });
    expect(result.status).toBe('FAILED');
    expect(result.errorCode).toBe('NOT_CONFIGURED');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
