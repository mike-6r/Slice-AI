import { S3CompatibleSubmissionStorage } from './s3-compatible-submission-storage';

function config(overrides: Record<string, unknown> = {}) {
  return {
    objectStorageProvider: 'S3_COMPATIBLE',
    objectStorageBucket: 'slice-private',
    objectStorageRegion: 'auto',
    objectStoragePrivatePrefix: 'private',
    objectStorageSignedUrlTtlSeconds: 900,
    objectStorageForcePathStyle: true,
    ...overrides,
  } as never;
}

describe('S3CompatibleSubmissionStorage', () => {
  it('reports signed private capabilities without exposing credentials', () => {
    const storage = new S3CompatibleSubmissionStorage(config());
    expect(storage.status()).toEqual({
      provider: 'S3_COMPATIBLE',
      configured: true,
      operational: false,
      signedUpload: true,
      signedDownload: true,
    });
  });

  it('reads verified metadata from a fake S3 head response', async () => {
    const storage = new S3CompatibleSubmissionStorage(config());
    (storage as unknown as { client: { send: jest.Mock } }).client = {
      send: jest.fn().mockResolvedValue({
        ContentType: 'image/png',
        ContentLength: 12,
        Metadata: { sha256: 'abc', 'magic-mime-type': 'image/png', width: '2', height: '3' },
      }),
    };
    await expect(storage.head('submission/media/front')).resolves.toMatchObject({
      key: 'submission/media/front',
      mimeType: 'image/png',
      sizeBytes: 12,
      sha256: 'abc',
      width: 2,
      height: 3,
    });
  });
});
