import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../../config/app-config';
import { Inject } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import type {
  MalwareScannerPort,
  ObjectStoragePort,
  StoredObject,
  UploadIntent,
} from '../ports/submission-storage.ports';

/** Local/test adapter only. Production uploads remain disabled until a provider is approved. */
@Injectable()
export class LocalSubmissionStorage implements ObjectStoragePort {
  private readonly objects = new Map<string, StoredObject>();
  private readonly uploadTokens = new Map<
    string,
    {
      objectKey: string;
      mimeType: string;
      sizeBytes: number;
      expiresAt: Date;
    }
  >();

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  async createUploadIntent(input: {
    objectKey: string;
    mimeType: string;
    sizeBytes: number;
    expiresAt: Date;
  }): Promise<UploadIntent> {
    this.assertAvailable();
    const token = randomUUID();
    this.uploadTokens.set(token, { ...input });
    return {
      method: 'PUT',
      // The capability token is one-use, content-bound and expires with the
      // intent. It is available only when explicitly enabled for staging.
      url: `/api/v1/submissions/local-uploads/${token}`,
      headers: { 'content-type': input.mimeType },
      expiresAt: input.expiresAt,
    };
  }

  async receiveBrowserUpload(token: string, mimeType: string, body: Buffer) {
    this.assertAvailable();
    const intent = this.uploadTokens.get(token);
    this.uploadTokens.delete(token);
    if (!intent || intent.expiresAt.getTime() <= Date.now()) this.unavailable();
    if (mimeType.split(';', 1)[0].trim().toLowerCase() !== intent.mimeType)
      this.invalidUpload();
    if (body.length !== intent.sizeBytes) this.invalidUpload();
    const inspection = inspectImage(body);
    if (inspection.mimeType !== intent.mimeType) this.invalidUpload();
    this.objects.set(intent.objectKey, {
      key: intent.objectKey,
      mimeType: intent.mimeType,
      sizeBytes: body.length,
      sha256: createHash('sha256').update(body).digest('hex'),
      magicMimeType: inspection.mimeType,
      width: inspection.width,
      height: inspection.height,
    });
  }

  async head(objectKey: string) {
    this.assertAvailable();
    return this.objects.get(objectKey) ?? null;
  }

  async delete(objectKey: string) {
    this.assertAvailable();
    this.objects.delete(objectKey);
  }

  /** Test-only seam: production code has no local object upload route. */
  putForTest(object: StoredObject) {
    this.assertAvailable();
    this.objects.set(object.key, object);
  }

  private assertAvailable() {
    if (!this.config.localSubmissionStorageEnabled) {
      throw new ServiceUnavailableException({
        code: 'STORAGE_UNAVAILABLE',
        message: 'Media uploads are not currently available.',
      });
    }
  }

  private unavailable(): never {
    throw new ServiceUnavailableException({
      code: 'STORAGE_UNAVAILABLE',
      message: 'Media upload intent is no longer available.',
    });
  }

  private invalidUpload(): never {
    throw new BadRequestException({
      code: 'MEDIA_UPLOAD_INVALID',
      message: 'Uploaded media does not match its approved upload intent.',
    });
  }
}

function inspectImage(body: Buffer): {
  mimeType: string | null;
  width: number | null;
  height: number | null;
} {
  if (
    body.length >= 24 &&
    body.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return {
      mimeType: 'image/png',
      width: body.readUInt32BE(16),
      height: body.readUInt32BE(20),
    };
  if (
    body.length >= 12 &&
    body.subarray(0, 4).toString() === 'RIFF' &&
    body.subarray(8, 12).toString() === 'WEBP'
  )
    return { mimeType: 'image/webp', width: 1, height: 1 };
  if (body.length >= 4 && body[0] === 0xff && body[1] === 0xd8) {
    for (let offset = 2; offset + 9 < body.length;) {
      if (body[offset] !== 0xff) break;
      const marker = body[offset + 1];
      const length = body.readUInt16BE(offset + 2);
      if (length < 2 || offset + length + 2 > body.length) break;
      if (marker >= 0xc0 && marker <= 0xc3)
        return {
          mimeType: 'image/jpeg',
          height: body.readUInt16BE(offset + 5),
          width: body.readUInt16BE(offset + 7),
        };
      offset += length + 2;
    }
  }
  return { mimeType: null, width: null, height: null };
}

@Injectable()
export class LocalMalwareScanner implements MalwareScannerPort {
  async scan(object: StoredObject) {
    return object.testScanSafe === false
      ? { safe: false, reasonCode: 'TEST_SCAN_REJECTED' }
      : { safe: true };
  }
}
