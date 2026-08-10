import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../../config/app-config';
import { Inject } from '@nestjs/common';
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

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  async createUploadIntent(input: {
    objectKey: string;
    mimeType: string;
    sizeBytes: number;
    expiresAt: Date;
  }): Promise<UploadIntent> {
    this.assertAvailable();
    return {
      method: 'PUT',
      url: `local-submission-storage://${encodeURIComponent(input.objectKey)}`,
      headers: { 'content-type': input.mimeType },
      expiresAt: input.expiresAt,
    };
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
    if (this.config.environment === 'production') {
      throw new ServiceUnavailableException({
        code: 'STORAGE_UNAVAILABLE',
        message: 'Media uploads are not currently available.',
      });
    }
  }
}

@Injectable()
export class LocalMalwareScanner implements MalwareScannerPort {
  async scan(object: StoredObject) {
    return object.testScanSafe === false
      ? { safe: false, reasonCode: 'TEST_SCAN_REJECTED' }
      : { safe: true };
  }
}
