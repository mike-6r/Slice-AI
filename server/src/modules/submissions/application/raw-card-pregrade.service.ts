import {
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import type { Actor } from '../../identity/auth/auth.service';
import { PrismaService } from '../../../database/prisma.service';
import {
  assertEditableStatus,
  REQUIRED_MEDIA_SLOTS,
} from '../domain/submission.policy';
import { RAW_CARD_PREGRADE_PROVIDER, type RawCardPreGradeProvider, type RawCardVisualization } from './raw-card-pregrade.provider';
import { Inject } from '@nestjs/common';
import { OBJECT_STORAGE, type ObjectStoragePort } from '../ports/submission-storage.ports';

@Injectable()
export class RawCardPreGradeService {
  constructor(
    private readonly db: PrismaService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStoragePort,
    @Inject(RAW_CARD_PREGRADE_PROVIDER)
    private readonly provider: RawCardPreGradeProvider,
  ) {}

  async getOwned(actor: Actor, submissionId: string) {
    const submission = await this.db.assetSubmission.findFirst({
      where: { id: submissionId, ownerUserId: actor.userId },
      include: { preGrades: { orderBy: { createdAt: 'desc' }, take: 20 } },
    });
    if (!submission) throw this.notFound();
    const current = submission.preGrades.find((item) => !item.supersededAt) ?? null;
    return { current: current ? await this.decorateProjection(current) : null, history: await Promise.all(submission.preGrades.map((item) => this.decorateProjection(item))) };
  }

  async analyze(actor: Actor, submissionId: string, requestId: string) {
    const submission = await this.db.assetSubmission.findFirst({
      where: { id: submissionId, ownerUserId: actor.userId },
      include: {
        media: { where: { deletedAt: null }, orderBy: { slot: 'asc' } },
        preGrades: { orderBy: { createdAt: 'desc' }, take: 20 },
      },
    });
    if (!submission) throw this.notFound();
    assertEditableStatus(submission.status);
    if (!isRawMetadata(submission.declaredMetadata)) {
      throw new UnprocessableEntityException({
        code: 'RAW_CARD_ONLY',
        message: 'AI Pre-Grade is available for raw or ungraded cards only.',
      });
    }
    const media = REQUIRED_MEDIA_SLOTS.map((slot) =>
      submission.media.find((item) => item.slot === slot && item.status === 'SAFE'),
    );
    if (media.some((item) => !item)) {
      throw new UnprocessableEntityException({
        code: 'MEDIA_SLOT_REQUIRED',
        message: 'Add safe front and back photos before analyzing condition.',
      });
    }
    const front = media[0]!;
    const back = media[1]!;
    if (!front.sha256 || !back.sha256)
      throw new ServiceUnavailableException({
        code: 'MEDIA_CHECKSUM_REQUIRED',
        message: 'The photos are still being prepared. Please try again.',
      });
    const fingerprint = createHash('sha256')
      .update(`XIMILAR:card-grader:grade:${front.sha256}:${back.sha256}`)
      .digest('hex');
    const cached = submission.preGrades.find(
      (item) => item.analysisFingerprint === fingerprint,
    );
    if (
      cached?.status === 'SUCCEEDED' ||
      cached?.status === 'NOT_CONFIGURED' ||
      cached?.status === 'FAILED'
    )
      return this.decorateProjection(cached);
    if (cached?.status === 'IN_PROGRESS') {
      if (cached.providerRequestId)
        return this.resume(actor, submission.id, cached.id, fingerprint, cached.providerRequestId, front.id, back.id, front.objectKey, back.objectKey, requestId);
      if (Date.now() - cached.updatedAt.getTime() < 120_000)
        return this.decorateProjection(cached);
    }
    if (!this.provider.configured()) {
      const unavailable = await this.persist(
        submission.id,
        actor.userId,
        fingerprint,
        {
          status: 'NOT_CONFIGURED',
          provider: this.provider.providerName,
          errorCode: 'NOT_CONFIGURED',
        },
        requestId,
      );
      return this.decorateProjection(unavailable);
    }
    let analysis = cached;
    if (!analysis) {
      try {
        analysis = await this.db.rawCardPreGrade.create({
          data: {
            id: randomUUID(),
            submissionId: submission.id,
            requestedByUserId: actor.userId,
            provider: this.provider.providerName,
            analysisFingerprint: fingerprint,
            status: 'IN_PROGRESS',
          },
        });
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
        analysis = await this.db.rawCardPreGrade.findUniqueOrThrow({
          where: { submissionId_analysisFingerprint: { submissionId: submission.id, analysisFingerprint: fingerprint } },
        });
        if (analysis.status === 'IN_PROGRESS') return this.decorateProjection(analysis);
      }
    } else if (analysis.status !== 'IN_PROGRESS') {
      analysis = await this.db.rawCardPreGrade.update({
        where: { id: analysis.id },
        data: { status: 'IN_PROGRESS', errorCode: null, warnings: Prisma.JsonNull },
      });
    }
    await this.audit(actor.userId, 'RAW_CARD_PREGRADE_REQUESTED', submission.id, requestId, { analysisId: analysis.id, provider: this.provider.providerName });
    return this.runProvider(actor, submission.id, analysis.id, fingerprint, front.id, back.id, front.objectKey, back.objectKey, requestId, analysis.providerRequestId);
  }

  private resume(actor: Actor, submissionId: string, analysisId: string, fingerprint: string, providerRequestId: string, frontMediaId: string, backMediaId: string, frontKey: string, backKey: string, requestId: string) {
    return this.runProvider(actor, submissionId, analysisId, fingerprint, frontMediaId, backMediaId, frontKey, backKey, requestId, providerRequestId);
  }

  private async runProvider(actor: Actor, submissionId: string, analysisId: string, fingerprint: string, frontMediaId: string | null, backMediaId: string | null, frontKey: string, backKey: string, requestId: string, providerRequestId: string | null) {
    const [front, back] = await Promise.all([this.storage.read(frontKey), this.storage.read(backKey)]);
    if (!front || !back)
      throw new ServiceUnavailableException({ code: 'STORAGE_UNAVAILABLE', message: 'The card photos could not be read for analysis.' });
    const result = await this.provider.analyze({ front, back, providerRequestId });
    const persistedVisualizations = result.status === 'SUCCEEDED' ? await this.copyVisualizations(submissionId, analysisId, frontMediaId, backMediaId, result.visualizations) : [];
    const updated = await this.persist(submissionId, actor.userId, fingerprint, {
      ...result,
      status: result.status,
      provider: this.provider.providerName,
      providerRequestId: result.providerRequestId,
      visualizations: persistedVisualizations,
    }, requestId, analysisId);
    await this.audit(actor.userId, result.status === 'SUCCEEDED' ? 'RAW_CARD_PREGRADE_COMPLETED' : 'RAW_CARD_PREGRADE_FAILED', submissionId, requestId, { analysisId, provider: this.provider.providerName, status: result.status, errorCode: result.errorCode });
    return this.decorateProjection(updated);
  }

  private async persist(submissionId: string, requestedByUserId: string, fingerprint: string, result: Record<string, unknown>, requestId: string, id?: string) {
    const status = result.status as 'IN_PROGRESS' | 'SUCCEEDED' | 'FAILED' | 'TEMPORARILY_UNAVAILABLE' | 'NOT_CONFIGURED' | 'STALE';
    const data = {
      requestedByUserId,
      provider: String(result.provider ?? this.provider.providerName),
      providerRequestId: (result.providerRequestId as string | null | undefined) ?? null,
      status,
      overallEstimate: numberOrNull(result.overallEstimate),
      overallMin: numberOrNull(result.overallMin),
      overallMax: numberOrNull(result.overallMax),
      frontDetected: booleanOrNull(result.frontDetected),
      backDetected: booleanOrNull(result.backDetected),
      centeringScore: numberOrNull(result.centeringScore),
      cornerScore: numberOrNull(result.cornerScore),
      edgeScore: numberOrNull(result.edgeScore),
      surfaceScore: numberOrNull(result.surfaceScore),
      conditionLabel: stringOrNull(result.conditionLabel),
      autographDetected: booleanOrNull(result.autographDetected),
      categoryDetected: stringOrNull(result.categoryDetected),
      warnings: Array.isArray(result.warnings) ? result.warnings : [],
      analyzedAt: status === 'SUCCEEDED' ? new Date() : null,
      providerVersion: stringOrNull(result.providerVersion),
      errorCode: stringOrNull(result.errorCode),
      rawResponse: result.rawResponse ? (result.rawResponse as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
      visualizations: Array.isArray(result.visualizations) ? (result.visualizations as Prisma.InputJsonValue) : Prisma.JsonNull,
    };
    const updated = id
      ? await this.db.rawCardPreGrade.update({ where: { id }, data })
      : await this.db.rawCardPreGrade.upsert({
          where: { submissionId_analysisFingerprint: { submissionId, analysisFingerprint: fingerprint } },
          create: { id: randomUUID(), submissionId, analysisFingerprint: fingerprint, ...data },
          update: data,
        });
    if (status === 'SUCCEEDED') {
      await this.db.rawCardPreGrade.updateMany({
        where: { submissionId, id: { not: updated.id }, status: 'SUCCEEDED', supersededAt: null },
        data: { supersededAt: new Date(), status: 'STALE' },
      });
    }
    return updated;
  }

  private async copyVisualizations(submissionId: string, analysisId: string, frontMediaId: string | null, backMediaId: string | null, visualizations: RawCardVisualization[]) {
    const copied: Array<Record<string, unknown>> = [];
    for (const visualization of visualizations ?? []) {
      const sourceMediaId = visualization.side === 'FRONT' ? frontMediaId : backMediaId;
      if (!sourceMediaId) continue;
      for (const [type, url] of [['overview', visualization.overviewUrl], ['centering', visualization.centeringUrl]] as const) {
        if (!url || !isTrustedVisualizationUrl(url)) continue;
        const objectKey = `submissions/${submissionId}/ai-review/${analysisId}/${visualization.side.toLowerCase()}-${type}`;
        try {
          const existing = await this.storage.head(objectKey);
          if (existing?.sha256) { copied.push({ side: visualization.side, type, sourceMediaId, objectKey, sha256: existing.sha256, mimeType: existing.mimeType, centering: visualization.centering }); continue; }
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 15_000);
          let response: Response;
          try { response = await fetch(url, { signal: controller.signal }); } finally { clearTimeout(timeout); }
          if (!response.ok) continue;
          const declaredMimeType = (response.headers.get('content-type') ?? '').split(';', 1)[0].trim().toLowerCase();
          const mimeType = declaredMimeType.startsWith('image/') ? declaredMimeType : imageMimeTypeFromUrl(url);
          if (!mimeType) continue;
          const body = Buffer.from(await response.arrayBuffer());
          if (!body.length || body.length > 8 * 1024 * 1024) continue;
          const sha256 = createHash('sha256').update(body).digest('hex');
          await this.storage.put({ objectKey, body, mimeType, metadata: { sha256, provider: 'XIMILAR', 'source-media-id': sourceMediaId } });
          const stored = await this.storage.head(objectKey);
          if (!stored?.magicMimeType?.startsWith('image/')) { await this.storage.delete(objectKey).catch(() => undefined); continue; }
          copied.push({ side: visualization.side, type, sourceMediaId, objectKey, sha256, mimeType, centering: visualization.centering });
        } catch { /* Visualization is optional evidence; preserve the grade. */ }
      }
    }
    return copied;
  }

  private async decorateProjection(item: Prisma.RawCardPreGradeGetPayload<Prisma.RawCardPreGradeDefaultArgs>) {
    const projection = preGradeProjection(item);
    const visualizations = Array.isArray(item.visualizations) ? item.visualizations : [];
    projection.visualizations = await Promise.all(visualizations.filter(isPersistedVisualization).map(async (visualization) => ({ side: visualization.side, type: visualization.type, url: await this.storage.createPrivateDownloadUrl(visualization.objectKey, new Date(Date.now() + 5 * 60_000)).catch(() => null), centering: visualization.centering ?? null })));
    return projection;
  }

  private audit(actorUserId: string, action: string, submissionId: string, requestId: string, metadata: Record<string, unknown>) {
    return this.db.auditEvent.create({ data: { id: randomUUID(), actorUserId, actorType: 'USER', action, resourceType: 'submission', resourceId: submissionId, requestId, result: action.endsWith('FAILED') ? 'FAILURE' : 'SUCCESS', metadata: metadata as Prisma.InputJsonValue } });
  }

  private notFound(): never { throw new NotFoundException({ code: 'SUBMISSION_NOT_FOUND', message: 'Submission not found.' }); }
}

function imageMimeTypeFromUrl(value: string) {
  try {
    const extension = new URL(value).pathname.toLowerCase().match(/\.(avif|bmp|gif|jpe?g|png|tiff?|webp)$/)?.[1];
    if (!extension) return null;
    if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
    if (extension === 'tif' || extension === 'tiff') return 'image/tiff';
    return `image/${extension}`;
  } catch {
    return null;
  }
}

function isRawMetadata(value: Prisma.JsonValue | null) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return true;
  const metadata = value as Record<string, unknown>;
  const grader = String(metadata.grader ?? '').trim().toLowerCase();
  // The customer-facing form uses an empty grading-company value for the
  // Raw / Ungraded option. Treat that as raw even if an older draft carries a
  // stale grade field from a previous selection; a numeric grade without a
  // grader is not enough to make the collectible a professionally graded slab.
  return !grader || ['raw', 'ungraded', 'none'].includes(grader);
}
function numberOrNull(value: unknown) { return typeof value === 'number' && Number.isFinite(value) ? value : null; }
function booleanOrNull(value: unknown) { return typeof value === 'boolean' ? value : null; }
function stringOrNull(value: unknown) { return typeof value === 'string' && value.trim() ? value : null; }
export function preGradeProjection(item: Prisma.RawCardPreGradeGetPayload<Prisma.RawCardPreGradeDefaultArgs>) {
  return {
    id: item.id,
    submissionId: item.submissionId,
    provider: item.provider,
    status: item.status,
    providerRequestId: item.providerRequestId,
    overallEstimate: item.overallEstimate,
    overallMin: item.overallMin,
    overallMax: item.overallMax,
    frontDetected: item.frontDetected,
    backDetected: item.backDetected,
    centeringScore: item.centeringScore,
    cornerScore: item.cornerScore,
    edgeScore: item.edgeScore,
    surfaceScore: item.surfaceScore,
    conditionLabel: item.conditionLabel,
    autographDetected: item.autographDetected,
    categoryDetected: item.categoryDetected,
    warnings: Array.isArray(item.warnings) ? item.warnings : [],
    analysisFingerprint: item.analysisFingerprint,
    analyzedAt: item.analyzedAt?.toISOString() ?? null,
    providerVersion: item.providerVersion,
    errorCode: item.errorCode,
    supersededAt: item.supersededAt?.toISOString() ?? null,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    visualizations: [] as Array<{ side: 'FRONT' | 'BACK'; type: 'overview' | 'centering'; url: string | null; centering: Record<string, number> | null }>,
  };
}

function isTrustedVisualizationUrl(value: string) { try { const url = new URL(value); return url.protocol === 'https:' && ['s3-eu-west-1.amazonaws.com', 's3-eu-central-1.amazonaws.com'].includes(url.hostname); } catch { return false; } }
function isPersistedVisualization(value: unknown): value is { side: 'FRONT' | 'BACK'; type: 'overview' | 'centering'; objectKey: string; centering?: Record<string, number> | null } { if (!value || typeof value !== 'object') return false; const item = value as Record<string, unknown>; return (item.side === 'FRONT' || item.side === 'BACK') && (item.type === 'overview' || item.type === 'centering') && typeof item.objectKey === 'string'; }
