export type StoredObject = {
  key: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string | null;
  /** MIME type derived from the object bytes, never from the upload request. */
  magicMimeType: string | null;
  /** Image dimensions derived by the storage/inspection adapter. */
  width: number | null;
  height: number | null;
  /** Test-adapter scan outcome only; real scanner adapters determine this themselves. */
  testScanSafe?: boolean;
};

export type UploadIntent = {
  method: 'PUT';
  url: string;
  headers: Record<string, string>;
  expiresAt: Date;
};

export interface ObjectStoragePort {
  put(input: { objectKey: string; body: Buffer; mimeType: string; metadata?: Record<string, string> }): Promise<void>;
  createUploadIntent(input: {
    objectKey: string;
    mimeType: string;
    sizeBytes: number;
    expiresAt: Date;
  }): Promise<UploadIntent>;
  head(objectKey: string): Promise<StoredObject | null>;
  /** Reads an already-authorized private object for server-to-server analysis. */
  read(objectKey: string): Promise<Buffer | null>;
  delete(objectKey: string): Promise<void>;
  /** Creates a short-lived private download URL; never exposes bucket credentials. */
  createPrivateDownloadUrl(objectKey: string, expiresAt: Date): Promise<string>;
  /** Provider capability/status is safe to expose to internal operations telemetry. */
  status(): {
    provider: 'LOCAL' | 'S3_COMPATIBLE';
    configured: boolean;
    operational: boolean;
    signedUpload: boolean;
    signedDownload: boolean;
  };
}

export interface MalwareScannerPort {
  scan(object: StoredObject): Promise<{ safe: boolean; reasonCode?: string }>;
}

export const OBJECT_STORAGE = Symbol('OBJECT_STORAGE');
export const MALWARE_SCANNER = Symbol('MALWARE_SCANNER');
