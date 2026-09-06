import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaService } from '../../../database/prisma.service';
import { APP_CONFIG, type AppConfig } from '../../../config/app-config';
import type { Actor } from '../../identity/auth/auth.service';
import { slugify } from '../../catalogue/domain/catalogue.types';
import { DEFAULT_AUTO_REVIEW_POLICY, calculateProvisionalTerms, evaluateQualification, qualificationCustomerStatus } from './qualification.policy';

type Db = Prisma.TransactionClient;
const json = (value: unknown) => value as Prisma.InputJsonValue;

@Injectable()
export class QualificationService {
  constructor(private readonly prisma: PrismaService, @Inject(APP_CONFIG) private readonly config: AppConfig) {}

  async runForSubmission(submissionId: string, options: { trigger?: string; retryOfId?: string } = {}) {
    let lastError = 'Unexpected qualification error.';
    // A transient database/provider failure must not turn a clean submission into
    // a staff-review decision. The transaction is intentionally retried once;
    // every downstream write is an upsert or is protected by the submission row
    // lock, so this is safe when the request is repeated as well.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await this.prisma.$transaction(async (db) => this.run(db, submissionId, options));
      } catch (error) {
        lastError = error instanceof Error ? error.message : lastError;
      }
    }
    return this.recordRetryableFailure(submissionId, options, lastError);
  }

  private async recordRetryableFailure(
    submissionId: string,
    options: { trigger?: string; retryOfId?: string },
    message: string,
  ) {
    const safeMessage = message.slice(0, 240);
    const policy = await this.prisma.autoReviewPolicy.findUnique({
      where: { policyKey: 'default' },
      select: { version: true },
    }).catch(() => null);
    const run = await this.prisma.qualificationRun.create({
      data: {
        submissionId,
        trigger: options.trigger ?? 'SUBMISSION_SUBMITTED',
        policyVersion: policy?.version ?? DEFAULT_AUTO_REVIEW_POLICY.version,
        status: 'FAILED',
        errorCode: 'AUTOMATION_RETRYABLE',
        retryOfId: options.retryOfId ?? null,
        reasons: json([`Slice automation is retrying this listing. ${safeMessage}`]),
        actions: json([]),
        completedAt: new Date(),
      },
    });
    await this.prisma.assetSubmission.updateMany({
      where: { id: submissionId },
      data: {
        // Keep the submission owned by the automated pipeline. A system error
        // is not a human-review decision and must not enter the exception queue.
        status: 'SUBMITTED',
        decisionCode: 'AUTOMATION_RETRYABLE',
        decisionNote: 'Slice is retrying automated processing. No action is required from you.',
      },
    });
    await this.prisma.auditEvent.create({
      data: {
        actorType: 'SYSTEM',
        action: 'QUALIFICATION_RETRY_SCHEDULED',
        resourceType: 'submission',
        resourceId: submissionId,
        result: 'SUCCESS',
        metadata: json({
          source: 'AUTOMATION',
          runId: run.id,
          trigger: options.trigger ?? 'SUBMISSION_SUBMITTED',
          errorCode: 'AUTOMATION_RETRYABLE',
          message: safeMessage,
        }),
      },
    }).catch(() => undefined);
    return qualificationResponse({
      runId: run.id,
      outcome: null,
      customerStatus: 'SYSTEM_RETRYING',
      policyVersion: policy?.version ?? DEFAULT_AUTO_REVIEW_POLICY.version,
      reasons: [`Slice automation is retrying this listing. ${safeMessage}`],
      actions: [],
      checks: [],
      errorCode: 'AUTOMATION_RETRYABLE',
      nextAction: nextAction('SYSTEM_RETRYING', safeMessage),
    }, null);
  }

  private async run(db: Db, submissionId: string, options: { trigger?: string; retryOfId?: string }) {
    await db.$queryRaw`SELECT id FROM "AssetSubmission" WHERE id = ${submissionId} FOR UPDATE`;
    const policyRow = await db.autoReviewPolicy.upsert({ where: { policyKey: 'default' }, create: { policyKey: 'default', ...DEFAULT_AUTO_REVIEW_POLICY, defaultPreSaleSupply: DEFAULT_AUTO_REVIEW_POLICY.defaultPreSaleSupply }, update: {} });
    const policy = { ...policyRow, defaultPreSaleSupply: BigInt(policyRow.defaultPreSaleSupply) };
    const submission = await db.assetSubmission.findUniqueOrThrow({ where: { id: submissionId }, include: { owner: { select: { accountStatus: true } }, category: { select: { slug: true } }, media: true, gradeScaleEntry: { select: { company: { select: { code: true } } } }, certificationVerifications: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] }, preferredIntakeLocation: true, marketResearch: { orderBy: { collectedAt: 'desc' }, take: 1 } } });
    const existing = await db.qualificationRun.findFirst({ where: { submissionId, trigger: options.trigger ?? 'SUBMISSION_SUBMITTED', status: 'COMPLETED' }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], include: { checks: true } });
    // A repeated request for the same submitted version is idempotent. A later
    // collector resubmission gets a newer submittedAt and must be evaluated
    // again so resolved blockers can continue automatically.
    if (existing && (!submission.submittedAt || existing.createdAt >= submission.submittedAt)) {
      if (existing.outcome === 'AUTO_QUALIFIED') {
        await this.completeAutoReviewState(db, submissionId, existing.id);
      }
      return this.projectRun(existing);
    }
    const metadata = submission.declaredMetadata && typeof submission.declaredMetadata === 'object' && !Array.isArray(submission.declaredMetadata) ? submission.declaredMetadata as Record<string, unknown> : {};
    const grader = String(metadata.grader ?? submission.gradeScaleEntry?.company.code ?? '').trim();
    const certNumber = String(metadata.certificationNumber ?? '').trim();
    const cert = submission.certificationVerifications[0] ?? null;
    const claim = certNumber && grader ? await db.gradingCertificationClaim.findUnique({ where: { companyCode_normalizedCertificationNumber: { companyCode: grader.toUpperCase(), normalizedCertificationNumber: certNumber.replace(/[^A-Za-z0-9]/g, '').toUpperCase() } }, select: { submissionId: true } }) : null;
    const location = submission.preferredIntakeLocation;
    const method = submission.preferredDeliveryMethod;
    const intakeValid = Boolean(location && location.active && location.intakeAvailable && location.operationallyApproved && location.status === 'ACTIVE' && location.environment === this.config.appEnvironment && method && (method === 'SHIPMENT' ? location.acceptingShipments : location.acceptingInPerson) && (!Array.isArray(location.acceptedCategories) || location.acceptedCategories.length === 0 || location.acceptedCategories.includes(submission.categoryId)));
    const requestedSupply = String(metadata.collectorExpectedSupply ?? '').trim();
    const supply = /^\d+$/.test(requestedSupply) && BigInt(requestedSupply) > 0n
      ? BigInt(requestedSupply)
      : policy.defaultPreSaleSupply;
    const terms = calculateProvisionalTerms(metadata, supply);
    const evaluation = !policy.enabled || policy.emergencyDisabled ? { outcome: 'HUMAN_REVIEW_REQUIRED' as const, checks: [{ code: 'POLICY_DISABLED', result: 'UNCERTAIN' as const, mandatory: true, reason: 'Automated qualification is currently disabled by policy.' }], reasons: ['Automated qualification is currently disabled by policy.'] } : evaluateQualification({ category: submission.category.slug, grader, policy, accountStatus: submission.owner.accountStatus, identity: metadata, certification: cert, certificationClaimedByOther: Boolean(claim?.submissionId && claim.submissionId !== submissionId), media: submission.media, possession: metadata.inPossession === true, intakeValid, terms, marketState: submission.marketResearch[0]?.state });
    const run = await db.qualificationRun.create({ data: { submissionId, trigger: options.trigger ?? 'SUBMISSION_SUBMITTED', policyVersion: policy.version, status: 'RUNNING', retryOfId: options.retryOfId ?? null, reasons: json(evaluation.reasons) } });
    await db.qualificationCheck.createMany({ data: evaluation.checks.map((check) => ({ runId: run.id, code: check.code, result: check.result, mandatory: check.mandatory, reason: check.reason, details: check.details ? json(check.details) : undefined })) });
    if (evaluation.outcome !== 'AUTO_QUALIFIED') {
      const completedAt = new Date();
      await db.qualificationRun.update({ where: { id: run.id }, data: { status: 'COMPLETED', outcome: evaluation.outcome, completedAt, reasons: json(evaluation.reasons), actions: json([]) } });
      await db.assetSubmission.update({ where: { id: submissionId }, data: { status: evaluation.outcome === 'HUMAN_REVIEW_REQUIRED' ? 'IN_REVIEW' : 'SUBMITTED', decisionCode: evaluation.outcome, decisionNote: evaluation.reasons[0] ?? null } });
      await this.audit(db, evaluation.outcome, submissionId, run.id, policy.version, evaluation.reasons);
      await this.notify(db, submission.ownerUserId, submissionId, evaluation.outcome, evaluation.reasons[0]);
      return qualificationResponse({ runId: run.id, outcome: evaluation.outcome, customerStatus: qualificationCustomerStatus(evaluation.outcome), policyVersion: policy.version, reasons: evaluation.reasons, actions: [], checks: evaluation.checks, nextAction: nextAction(evaluation.outcome, evaluation.reasons[0]) }, completedAt);
    }
    if (!terms || !location || !method) throw new Error('Qualification terms or intake destination disappeared during processing.');
    const title = String(metadata.name ?? metadata.playerOrCharacter ?? '').trim();
    const asset = submission.assetId ? await db.asset.findUniqueOrThrow({ where: { id: submission.assetId } }) : await db.asset.create({ data: { id: randomUUID(), publicId: `ast_${randomUUID().replace(/-/g, '')}`, slug: slugify(`${title}-${submissionId.slice(0, 8)}`) as string, categoryId: submission.categoryId, setId: submission.setId, gradeScaleEntryId: submission.gradeScaleEntryId, title, year: Number.isFinite(Number(metadata.year)) ? Number(metadata.year) : null, manufacturer: String(metadata.manufacturer ?? '').trim() || null, edition: String(metadata.variant ?? metadata.edition ?? '').trim() || null, cardNumber: String(metadata.cardNumber ?? '').trim() || null, certificationNumber: certNumber || null, normalizedCertificationNumber: certNumber ? certNumber.replace(/[^A-Za-z0-9]/g, '').toUpperCase() : null, status: 'PUBLISHED', publishedAt: new Date() } });
    const intake = await db.submissionIntake.upsert({ where: { submissionId }, create: { submissionId, vaultId: location.id, deliveryMethod: method, intakeReference: `SLICE-${submissionId.slice(-8).toUpperCase()}`, status: method === 'SHIPMENT' ? 'SHIPPING_REQUIRED' : 'VAULT_SELECTED', destinationSnapshot: json({ locationId: location.id, displayName: location.displayName, locationType: location.locationType, environment: location.environment, region: location.region, countryCode: location.countryCode, receiverName: location.receiverName, customerSafeAddress: location.customerSafeAddress, shippingInstructions: location.shippingInstructions, inPersonInstructions: location.inPersonInstructions }) }, update: {} });
    const offering = await db.initialOffering.upsert({ where: { assetId: asset.id }, create: { assetId: asset.id, originatingCollectorUserId: submission.ownerUserId, beneficiaryUserId: submission.ownerUserId, currency: String(metadata.collectorExpectedCurrency ?? 'GBP'), totalUnits: supply, offeredUnits: terms.offeredUnits, retainedUnits: terms.retainedUnits, pricePerUnitMinor: terms.pricePerUnitMinor, grossOfferingMinor: terms.grossOfferingMinor, feeScheduleVersion: 'PROVISIONAL_PRESALE', feeBps: 0, status: policy.autoPreSaleLaunch ? 'OPEN' : 'DRAFT', openedAt: policy.autoPreSaleLaunch ? new Date() : null }, update: policy.autoPreSaleLaunch ? { status: 'OPEN' } : {} });
    const sale = await db.preSale.upsert({ where: { assetId: asset.id }, create: { assetId: asset.id, initialOfferingId: offering.id, status: policy.autoPreSaleLaunch ? 'ACTIVE' : 'DRAFT', openedAt: policy.autoPreSaleLaunch ? new Date() : null, deadlineAt: policy.autoPreSaleLaunch ? new Date(Date.now() + (this.config.preSaleDeadlineDays ?? 14) * 86400000) : null, physicalStatus: 'AWAITING_INTAKE' }, update: {} });
    const qaSampled = policy.qaSamplingBps > 0 && Number.parseInt(createHash('sha256').update(run.id).digest('hex').slice(0, 8), 16) % 10000 < policy.qaSamplingBps;
    if (policy.autoPreSaleLaunch) await db.preSaleAuditEvent.create({ data: { preSaleId: sale.id, action: 'PRE_SALE_LAUNCHED', source: 'AUTOMATION', reason: 'All automated qualification gates passed.', beforeState: json({ status: 'DRAFT' }), afterState: json({ status: 'ACTIVE', physicalStatus: 'AWAITING_INTAKE', deadlineAt: sale.deadlineAt?.toISOString() ?? null }) } });
    await db.assetSubmission.update({ where: { id: submissionId }, data: { assetId: asset.id, status: 'APPROVED', reviewedAt: new Date(), reviewerId: null, decisionCode: 'AUTO_QUALIFIED', decisionNote: 'All required automated checks passed. No staff review was required.', version: { increment: 1 } } });
    await this.completeAutoReviewArtifacts(db, submissionId, run.id, false);
    if (certNumber && grader) await db.gradingCertificationClaim.upsert({ where: { companyCode_normalizedCertificationNumber: { companyCode: grader.toUpperCase(), normalizedCertificationNumber: certNumber.replace(/[^A-Za-z0-9]/g, '').toUpperCase() } }, create: { companyCode: grader.toUpperCase(), normalizedCertificationNumber: certNumber.replace(/[^A-Za-z0-9]/g, '').toUpperCase(), submissionId, assetId: asset.id, status: 'ACTIVE' }, update: { submissionId, assetId: asset.id, status: 'ACTIVE' } });
    for (const [action, resourceType, resourceId, metadataValue] of [['AUTO_QUALIFIED', 'submission', submissionId, { runId: run.id }], ['EVIDENCE_AUTO_ACCEPTED', 'submission', submissionId, { runId: run.id, safeRequiredEvidence: true }], ['CANONICAL_ASSET_CREATED_AND_LINKED', 'submission', submissionId, { runId: run.id, assetId: asset.id }], ['PHYSICAL_INTAKE_CREATED', 'submission-intake', intake.id, { runId: run.id, intakeId: intake.id }], ['PRE_SALE_TERMS_AUTO_CONFIGURED', 'pre-sale', sale.id, { runId: run.id, preSaleId: sale.id }], ...(policy.autoPreSaleLaunch ? [['PRE_SALE_LAUNCHED', 'pre-sale', sale.id, { runId: run.id, preSaleId: sale.id }]] : [])] as Array<[string, string, string, Record<string, unknown>]>) await this.audit(db, action, resourceId, run.id, policy.version, [], resourceType, metadataValue);
    const actions = [{ type: 'EVIDENCE_AUTO_ACCEPTED', evidence: 'DETERMINISTIC_SAFE_REQUIRED_MEDIA' }, { type: 'CANONICAL_ASSET_CREATED', assetId: asset.id }, { type: 'PHYSICAL_INTAKE_CREATED', intakeId: intake.id }, { type: 'PRE_SALE_TERMS_AUTO_CONFIGURED', preSaleId: sale.id }, { type: policy.autoPreSaleLaunch ? 'PRE_SALE_LAUNCHED' : 'PRE_SALE_PREPARED', preSaleId: sale.id, deadlineAt: sale.deadlineAt?.toISOString() ?? null }, { type: 'QA_SAMPLE', sampled: qaSampled, qaBlocking: false }];
    const completedAt = new Date();
    await db.qualificationRun.update({ where: { id: run.id }, data: { status: 'COMPLETED', outcome: 'AUTO_QUALIFIED', completedAt, actions: json(actions), reasons: json([]) } });
    await this.notify(db, submission.ownerUserId, submissionId, 'AUTO_QUALIFIED', 'Your collectible passed automated checks and is now available for conditional Pre-Sale reservations.');
    return qualificationResponse({ runId: run.id, outcome: 'AUTO_QUALIFIED' as const, customerStatus: 'PRE_SALE_QUALIFIED', policyVersion: policy.version, reasons: [], actions, checks: evaluation.checks, nextAction: nextAction('AUTO_QUALIFIED', undefined, sale.deadlineAt) }, completedAt);
  }

  async ownerLatest(actor: Actor, submissionId: string) {
    const submission = await this.prisma.assetSubmission.findFirst({ where: { id: submissionId, ownerUserId: actor.userId }, select: { qualificationRuns: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 1, include: { checks: true } } } });
    return submission?.qualificationRuns[0] ? this.projectRun(submission.qualificationRuns[0]) : null;
  }

  async adminQueue(_actor: Actor, outcome?: 'HUMAN_REVIEW_REQUIRED' | 'COLLECTOR_ACTION_REQUIRED' | 'AUTO_QUALIFIED' | 'BLOCKED') {
    const runs = await this.prisma.qualificationRun.findMany({ where: outcome ? { outcome } : {}, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 100, include: { checks: true, submission: { select: { id: true, ownerUserId: true, status: true, categoryId: true, declaredMetadata: true, submittedAt: true } } } });
    return { items: runs.map((run) => ({ ...this.projectRun(run), submission: run.submission })), total: runs.length };
  }

  async getPolicy() { const row = await this.prisma.autoReviewPolicy.findUnique({ where: { policyKey: 'default' } }); return this.projectPolicy(row ?? DEFAULT_AUTO_REVIEW_POLICY); }
  async updatePolicy(actor: Actor, input: Partial<typeof DEFAULT_AUTO_REVIEW_POLICY>) { if (!actor.roles.includes('ADMIN')) throw new Error('Admin role required.'); return this.prisma.$transaction(async (db) => { const row = await db.autoReviewPolicy.upsert({ where: { policyKey: 'default' }, create: { policyKey: 'default', ...DEFAULT_AUTO_REVIEW_POLICY, ...input, updatedByUserId: actor.userId }, update: { ...input, updatedByUserId: actor.userId, version: input.version ?? DEFAULT_AUTO_REVIEW_POLICY.version } }); await db.auditEvent.create({ data: { actorUserId: actor.userId, actorType: 'USER', action: 'AUTO_REVIEW_POLICY_UPDATED', resourceType: 'auto-review-policy', resourceId: row.id, result: 'SUCCESS', metadata: json({ source: 'ADMIN', changed: Object.keys(input), version: row.version }) } }); return this.projectPolicy(row); }); }
  async rerun(actor: Actor, submissionId: string) { if (!actor.roles.some((role) => role === 'ADMIN' || role === 'ASSET_REVIEWER')) throw new Error('Review permission required.'); const latest = await this.prisma.qualificationRun.findFirst({ where: { submissionId }, orderBy: { createdAt: 'desc' } }); return this.runForSubmission(submissionId, { trigger: 'ADMIN_RERUN', retryOfId: latest?.id }); }

  /**
   * Repairs legacy rows that have a completed AUTO_QUALIFIED run but still
   * expose the old manual-review state. This is deliberately server-side state
   * repair, not a queue presentation filter.
   */
  async reconcileAutoQualifiedSubmissions() {
    const candidates = await this.prisma.assetSubmission.findMany({
      where: {
        OR: [
          { status: { in: ['SUBMITTED', 'IN_REVIEW'] } },
          { reviewerId: { not: null } },
        ],
        qualificationRuns: { some: { status: 'COMPLETED', outcome: 'AUTO_QUALIFIED' } },
      },
      select: {
        id: true,
        qualificationRuns: {
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: 1,
          select: { outcome: true },
        },
      },
    });
    let repaired = 0;
    for (const candidate of candidates) {
      if (candidate.qualificationRuns[0]?.outcome !== 'AUTO_QUALIFIED') continue;
      const changed = await this.prisma.$transaction(async (db) => {
        await db.$queryRaw`SELECT id FROM "AssetSubmission" WHERE id = ${candidate.id} FOR UPDATE`;
        return this.completeAutoReviewState(db, candidate.id, null);
      });
      repaired += changed ? 1 : 0;
    }
    return repaired;
  }

  private projectRun(run: any) { return { runId: run.id, outcome: run.outcome, customerStatus: run.outcome ? qualificationCustomerStatus(run.outcome) : run.status === 'FAILED' ? 'SYSTEM_RETRYING' : 'CHECKING', policyVersion: run.policyVersion, completedAt: run.completedAt?.toISOString() ?? null, reasons: run.reasons ?? [], actions: run.actions ?? [], checks: run.checks ?? [], nextAction: nextAction(run.outcome ?? (run.status === 'FAILED' ? 'SYSTEM_RETRYING' : 'CHECKING'), run.reasons?.[0]) }; }
  private async completeAutoReviewState(db: Db, submissionId: string, runId: string | null) {
    const submission = await db.assetSubmission.findUnique({
      where: { id: submissionId },
      select: { status: true, reviewerId: true, decisionCode: true },
    });
    if (!submission) return false;
    const updateSubmission =
      submission.status !== 'APPROVED' ||
      Boolean(submission.reviewerId) ||
      submission.decisionCode !== 'AUTO_QUALIFIED';
    return this.completeAutoReviewArtifacts(db, submissionId, runId, updateSubmission);
  }
  private async completeAutoReviewArtifacts(db: Db, submissionId: string, runId: string | null, updateSubmission = true) {
    const completedAt = new Date();
    if (updateSubmission) {
      await db.assetSubmission.update({
          where: { id: submissionId },
          data: {
            status: 'APPROVED',
            reviewerId: null,
            reviewedAt: completedAt,
            decisionCode: 'AUTO_QUALIFIED',
            decisionNote: 'All required automated checks passed. No staff review was required.',
            version: { increment: 1 },
          },
          select: { id: true },
        });
    }
    const reviews = await db.verificationReview.updateMany({
      where: { submissionId, status: 'CLAIMED' },
      data: {
        status: 'COMPLETED',
        decision: 'AUTO_PROCESSED',
        reasonCode: 'AUTO_QUALIFIED',
        note: 'Automatically completed because all deterministic qualification checks passed.',
        completedAt,
      },
    });
    if (runId && (reviews.count > 0 || updateSubmission)) {
      await this.audit(db, 'AUTO_REVIEW_COMPLETED', submissionId, runId, 'AUTOMATION', [], 'submission', {
        completedReviewCount: reviews.count,
        reason: 'AUTO_QUALIFIED',
      });
    }
    return updateSubmission || reviews.count > 0;
  }
  private projectPolicy(policy: { version: string; enabled: boolean; enabledCategories: string[]; enabledGraders: string[]; qaSamplingBps: number; autoPreSaleLaunch: boolean; defaultPreSaleSupply: bigint; emergencyDisabled: boolean }) { return { ...policy, defaultPreSaleSupply: policy.defaultPreSaleSupply.toString() }; }
  private async audit(db: Db, action: string, resourceId: string, runId: string, policyVersion: string, reasons: string[], resourceType = 'submission', extra: Record<string, unknown> = {}) { await db.auditEvent.create({ data: { actorType: 'SYSTEM', action, resourceType, resourceId, result: 'SUCCESS', metadata: json({ source: 'AUTOMATION', runId, policyVersion, reasons, ...extra }) } }); }
  private async notify(db: Db, userId: string, submissionId: string, outcome: string, body?: string) { await db.notification.create({ data: { userId, type: 'COLLECTOR_ACTIONS', title: outcome === 'AUTO_QUALIFIED' ? 'Your collectible passed automated checks.' : 'Your submission needs attention.', body: body ?? 'Your submission has been routed to the appropriate next step.', resourceType: 'submission', resourceId: submissionId } }); }
}

export type NextActionProjection = {
  stage: string;
  owner: 'COLLECTOR' | 'SLICE' | 'PROVIDER' | 'SYSTEM';
  action: string;
  blockers: string[];
  deadlineAt: string | null;
};

function nextAction(
  outcome: string,
  blocker?: string,
  deadlineAt?: Date | null,
): NextActionProjection {
  const deadline = deadlineAt?.toISOString() ?? null;
  if (outcome === 'AUTO_QUALIFIED') return { stage: 'PHYSICAL_INTAKE', owner: 'COLLECTOR', action: 'Ship your collectible to Slice.', blockers: [], deadlineAt: deadline };
  if (outcome === 'COLLECTOR_ACTION_REQUIRED') return { stage: 'SUBMISSION', owner: 'COLLECTOR', action: 'Update the requested listing information and submit again.', blockers: blocker ? [blocker] : [], deadlineAt: null };
  if (outcome === 'BLOCKED') return { stage: 'EXCEPTION', owner: 'SLICE', action: 'Contact Slice Support to resolve this blocked listing.', blockers: blocker ? [blocker] : [], deadlineAt: null };
  if (outcome === 'SYSTEM_RETRYING') return { stage: 'AUTOMATION', owner: 'SYSTEM', action: 'Slice is retrying automated processing.', blockers: blocker ? [blocker] : [], deadlineAt: null };
  return { stage: 'REVIEW', owner: 'SLICE', action: 'Slice staff will review the flagged listing.', blockers: blocker ? [blocker] : [], deadlineAt: null };
}

export function qualificationResponse<T extends object>(result: T, completedAt: Date | null) {
  return { ...result, completedAt: completedAt?.toISOString() ?? null };
}
