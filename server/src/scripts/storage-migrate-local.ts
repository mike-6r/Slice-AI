import { NestFactory } from '@nestjs/core';
import { HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { AppModule } from '../app.module';
import { PrismaService } from '../database/prisma.service';
import { APP_CONFIG, type AppConfig } from '../config/app-config';

/** Safe, operator-controlled local-to-S3 migration. Dry-run is the default. */
async function main() {
  const execute = process.argv.includes('--execute');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const db = app.get(PrismaService);
    const config = app.get<AppConfig>(APP_CONFIG);
    const root = resolve(process.env.LOCAL_SUBMISSION_STORAGE_ROOT ?? config.localSubmissionStorageRoot ?? '.local-submission-storage');
    const media = await db.submissionMedia.findMany({ where: { deletedAt: null }, select: { id: true, objectKey: true, sha256: true, sizeBytes: true } });
    const report = { mode: execute ? 'EXECUTE' : 'DRY_RUN', root, filesFound: 0, mediaRowsMatched: 0, missingLocalFiles: 0, checksumMismatches: 0, objectsAlreadyPresent: 0, objectsToUpload: 0, uploaded: 0, errors: [] as string[] };
    const durable = config.objectStorageProvider === 'S3_COMPATIBLE' && config.objectStorageBucket;
    const client = durable ? new S3Client({ region: config.objectStorageRegion ?? 'auto', endpoint: config.objectStorageEndpoint, forcePathStyle: config.objectStorageForcePathStyle ?? false, credentials: config.objectStorageAccessKeyId && config.objectStorageSecretAccessKey ? { accessKeyId: config.objectStorageAccessKeyId, secretAccessKey: config.objectStorageSecretAccessKey } : undefined }) : null;
    for (const row of media) {
      const localPath = resolve(root, row.objectKey);
      if (!localPath.startsWith(`${root}${sep}`)) { report.errors.push(`${row.id}: unsafe object key`); continue; }
      if (!existsSync(localPath) || !statSync(localPath).isFile()) { report.missingLocalFiles += 1; continue; }
      report.filesFound += 1; report.mediaRowsMatched += 1;
      const body = readFileSync(localPath);
      const checksum = createHash('sha256').update(body).digest('hex');
      if (row.sha256 && row.sha256 !== checksum) { report.checksumMismatches += 1; continue; }
      if (!client || !config.objectStorageBucket) { report.objectsToUpload += 1; continue; }
      const key = `${config.objectStoragePrivatePrefix ?? 'private'}/${row.objectKey}`;
      try {
        const existing = await client.send(new HeadObjectCommand({ Bucket: config.objectStorageBucket, Key: key }));
        if (existing.Metadata?.sha256 === checksum || Number(existing.ContentLength ?? 0) === body.length) { report.objectsAlreadyPresent += 1; continue; }
        report.errors.push(`${row.id}: remote object exists with a different checksum`);
        continue;
      } catch (error) {
        const status = (error as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
        if (status !== 404) { report.errors.push(`${row.id}: remote head failed`); continue; }
      }
      report.objectsToUpload += 1;
      if (execute) {
        await client.send(new PutObjectCommand({ Bucket: config.objectStorageBucket, Key: key, Body: body, ContentType: inferMime(localPath), Metadata: { sha256: checksum, 'source-object-key': row.objectKey } }));
        report.uploaded += 1;
      }
    }
    if (execute && !client) report.errors.push('OBJECT_STORAGE_PROVIDER is not S3_COMPATIBLE with a configured bucket; no remote copy was executed.');
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  } finally { await app.close(); }
}

function inferMime(path: string) { return path.toLowerCase().endsWith('.png') ? 'image/png' : path.toLowerCase().endsWith('.webp') ? 'image/webp' : 'image/jpeg'; }
void main().catch((error) => { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; });
