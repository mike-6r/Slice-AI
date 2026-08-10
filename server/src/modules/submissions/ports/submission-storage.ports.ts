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
  createUploadIntent(input: {
    objectKey: string;
    mimeType: string;
    sizeBytes: number;
    expiresAt: Date;
  }): Promise<UploadIntent>;
  head(objectKey: string): Promise<StoredObject | null>;
  delete(objectKey: string): Promise<void>;
}

export interface MalwareScannerPort {
  scan(object: StoredObject): Promise<{ safe: boolean; reasonCode?: string }>;
}

export const OBJECT_STORAGE = Symbol('OBJECT_STORAGE');
export const MALWARE_SCANNER = Symbol('MALWARE_SCANNER');
