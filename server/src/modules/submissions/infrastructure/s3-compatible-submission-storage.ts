import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { APP_CONFIG, type AppConfig } from '../../../config/app-config';
import type { ObjectStoragePort, StoredObject, UploadIntent } from '../ports/submission-storage.ports';

/** One provider-neutral adapter for AWS S3, Cloudflare R2, and S3-compatible stores. */
@Injectable()
export class S3CompatibleSubmissionStorage implements ObjectStoragePort {
  private readonly client: S3Client | null;

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {
    this.client = config.objectStorageProvider === 'S3_COMPATIBLE' && config.objectStorageBucket
      ? new S3Client({
          region: config.objectStorageRegion ?? 'auto',
          endpoint: config.objectStorageEndpoint,
          forcePathStyle: config.objectStorageForcePathStyle ?? false,
          credentials: config.objectStorageAccessKeyId && config.objectStorageSecretAccessKey
            ? { accessKeyId: config.objectStorageAccessKeyId, secretAccessKey: config.objectStorageSecretAccessKey }
            : undefined,
        })
      : null;
  }

  async createUploadIntent(input: { objectKey: string; mimeType: string; sizeBytes: number; expiresAt: Date }): Promise<UploadIntent> {
    const client = this.requireClient();
    const command = new PutObjectCommand({
      Bucket: this.bucket(),
      Key: this.key(input.objectKey),
      ContentType: input.mimeType,
      ContentLength: input.sizeBytes,
      Metadata: { 'expected-size-bytes': String(input.sizeBytes) },
    });
    return {
      method: 'PUT',
      url: await getSignedUrl(client, command, { expiresIn: this.ttl(input.expiresAt) }),
      headers: { 'content-type': input.mimeType, 'content-length': String(input.sizeBytes) },
      expiresAt: input.expiresAt,
    };
  }

  async head(objectKey: string): Promise<StoredObject | null> {
    const client = this.requireClient();
    try {
      const result = await client.send(new HeadObjectCommand({ Bucket: this.bucket(), Key: this.key(objectKey) }));
      const metadata = result.Metadata ?? {};
      const stored: StoredObject = {
        key: objectKey,
        mimeType: result.ContentType ?? metadata['content-type'] ?? 'application/octet-stream',
        sizeBytes: Number(result.ContentLength ?? metadata['expected-size-bytes'] ?? 0),
        sha256: metadata.sha256 ?? null,
        magicMimeType: metadata['magic-mime-type'] ?? null,
        width: metadata.width ? Number(metadata.width) : null,
        height: metadata.height ? Number(metadata.height) : null,
      };
      // Existing clients only provide the declared MIME and checksum at completion.
      // Materialize once at completion when object metadata lacks inspection fields.
      if (!stored.sha256 || !stored.magicMimeType) {
        const bytes = await this.read(objectKey);
        if (!bytes) return null;
        const inspection = inspectImage(bytes);
        stored.sha256 = createHash('sha256').update(bytes).digest('hex');
        stored.magicMimeType = inspection.mimeType;
        stored.width = inspection.width;
        stored.height = inspection.height;
      }
      return stored;
    } catch (error) {
      if (isNotFound(error)) return null;
      throw new ServiceUnavailableException({ code: 'STORAGE_UNAVAILABLE', message: 'Object storage is unavailable.' });
    }
  }

  async read(objectKey: string): Promise<Buffer | null> {
    const client = this.requireClient();
    try {
      const result = await client.send(new GetObjectCommand({ Bucket: this.bucket(), Key: this.key(objectKey) }));
      if (!result.Body) return null;
      const bytes = await result.Body.transformToByteArray();
      return Buffer.from(bytes);
    } catch (error) {
      if (isNotFound(error)) return null;
      throw new ServiceUnavailableException({ code: 'STORAGE_UNAVAILABLE', message: 'Object storage is unavailable.' });
    }
  }

  async delete(objectKey: string) {
    const client = this.requireClient();
    try {
      await client.send(new DeleteObjectCommand({ Bucket: this.bucket(), Key: this.key(objectKey) }));
    } catch {
      throw new ServiceUnavailableException({ code: 'STORAGE_UNAVAILABLE', message: 'Object storage is unavailable.' });
    }
  }

  async createPrivateDownloadUrl(objectKey: string, expiresAt: Date) {
    const client = this.requireClient();
    return getSignedUrl(client, new GetObjectCommand({ Bucket: this.bucket(), Key: this.key(objectKey) }), { expiresIn: this.ttl(expiresAt) });
  }

  status() {
    const configured = Boolean(this.client);
    return { provider: 'S3_COMPATIBLE' as const, configured, operational: configured && Boolean(this.config.objectStorageLastProbeAt), signedUpload: configured, signedDownload: configured };
  }

  private requireClient() {
    if (!this.client) throw new ServiceUnavailableException({ code: 'STORAGE_NOT_CONFIGURED', message: 'Durable object storage is not configured.' });
    return this.client;
  }
  private bucket() { return this.config.objectStorageBucket!; }
  private key(objectKey: string) { return `${this.config.objectStoragePrivatePrefix ?? 'private'}/${objectKey}`; }
  private ttl(expiresAt: Date) { return Math.max(1, Math.min(this.config.objectStorageSignedUrlTtlSeconds ?? 900, Math.ceil((expiresAt.getTime() - Date.now()) / 1000))); }
}

function isNotFound(error: unknown) { return Boolean(error && typeof error === 'object' && '$metadata' in error && (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404); }

function inspectImage(body: Buffer): { mimeType: string | null; width: number | null; height: number | null } {
  if (body.length >= 24 && body.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return { mimeType: 'image/png', width: body.readUInt32BE(16), height: body.readUInt32BE(20) };
  if (body.length >= 12 && body.subarray(0, 4).toString() === 'RIFF' && body.subarray(8, 12).toString() === 'WEBP') return { mimeType: 'image/webp', width: 1, height: 1 };
  if (body.length >= 4 && body[0] === 0xff && body[1] === 0xd8) {
    for (let offset = 2; offset + 9 < body.length;) {
      if (body[offset] !== 0xff) break;
      const marker = body[offset + 1]; const length = body.readUInt16BE(offset + 2);
      if (length < 2 || offset + length + 2 > body.length) break;
      if (marker >= 0xc0 && marker <= 0xc3) return { mimeType: 'image/jpeg', height: body.readUInt16BE(offset + 5), width: body.readUInt16BE(offset + 7) };
      offset += length + 2;
    }
  }
  return { mimeType: null, width: null, height: null };
}
