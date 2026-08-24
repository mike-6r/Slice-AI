import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../../config/app-config';

export type RawCardPreGradeProviderResult = {
  status: 'SUCCEEDED' | 'FAILED' | 'TEMPORARILY_UNAVAILABLE';
  providerRequestId: string | null;
  overallEstimate: number | null;
  overallMin: number | null;
  overallMax: number | null;
  frontDetected: boolean | null;
  backDetected: boolean | null;
  centeringScore: number | null;
  cornerScore: number | null;
  edgeScore: number | null;
  surfaceScore: number | null;
  confidence: number | null;
  conditionLabel: string | null;
  autographDetected: boolean | null;
  categoryDetected: string | null;
  warnings: string[];
  providerVersion: string | null;
  errorCode: string | null;
  rawResponse: unknown | null;
  visualizations: RawCardVisualization[];
};
export type RawCardVisualization = {
  side: 'FRONT' | 'BACK';
  overviewUrl: string | null;
  centeringUrl: string | null;
  centering: Record<string, number> | null;
};

export type RawCardPreGradeProviderInput = {
  front: Buffer;
  back: Buffer;
  providerRequestId?: string | null;
};

export interface RawCardPreGradeProvider {
  readonly providerName: string;
  analyze(
    input: RawCardPreGradeProviderInput,
  ): Promise<RawCardPreGradeProviderResult>;
  extractVisualizations?(rawResponse: unknown): RawCardVisualization[];
  configured(): boolean;
}

export const RAW_CARD_PREGRADE_PROVIDER = Symbol('RAW_CARD_PREGRADE_PROVIDER');

class XimilarProviderError extends Error {
  constructor(
    readonly code: string,
    readonly transient: boolean,
  ) {
    super(code);
  }
}

@Injectable()
export class XimilarRawCardPreGradeProvider implements RawCardPreGradeProvider {
  readonly providerName = 'XIMILAR';
  private readonly endpoint = 'https://api.ximilar.com/account/v2/request/';

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  configured() {
    return Boolean(
      this.config.ximilarEnabled &&
      this.config.ximilarCardGradingEnabled &&
      this.config.ximilarApiToken,
    );
  }

  extractVisualizations(rawResponse: unknown) {
    return normalizeResponse(null, isRecord(rawResponse) ? rawResponse : {})
      .visualizations;
  }

  async analyze(
    input: RawCardPreGradeProviderInput,
  ): Promise<RawCardPreGradeProviderResult> {
    if (!this.configured())
      return emptyResult('NOT_CONFIGURED', 'NOT_CONFIGURED');

    let requestId = input.providerRequestId ?? null;
    try {
      if (!requestId) {
        const submitted = await this.request('POST', this.endpoint, {
          type: 'card-grader',
          endpoint: 'grade',
          records: [
            { _base64: input.front.toString('base64'), _id: 'front' },
            { _base64: input.back.toString('base64'), _id: 'back' },
          ],
        });
        requestId = stringValue(submitted.id);
        if (!requestId)
          throw new XimilarProviderError('PROVIDER_INVALID_RESPONSE', false);
      }

      const deadline = Date.now() + (this.config.ximilarTimeoutMs ?? 45_000);
      let envelope: Record<string, unknown> | null = null;
      while (Date.now() < deadline) {
        envelope = await this.request(
          'GET',
          `${this.endpoint}${encodeURIComponent(requestId)}`,
        );
        const status = stringValue(envelope.status)?.toUpperCase();
        if (status === 'DONE' || status === 'COMPLETED')
          return normalizeResponse(requestId, envelope);
        if (status === 'FAILED' || status === 'ERROR')
          return emptyResult(requestId, 'PROVIDER_ANALYSIS_FAILED', envelope);
        await delay(1_000);
      }
      return emptyResult(requestId, 'TEMPORARILY_UNAVAILABLE', envelope);
    } catch (error) {
      if (error instanceof XimilarProviderError && !error.transient)
        return emptyResult(requestId, error.code);
      return emptyResult(
        requestId,
        error instanceof XimilarProviderError
          ? 'TEMPORARILY_UNAVAILABLE'
          : 'TEMPORARILY_UNAVAILABLE',
      );
    }
  }

  private async request(
    method: 'GET' | 'POST',
    url: string,
    body?: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    let attempt = 0;
    while (true) {
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        this.config.ximilarTimeoutMs ?? 45_000,
      );
      try {
        const response = await fetch(url, {
          method,
          headers: {
            Authorization: `Token ${this.config.ximilarApiToken}`,
            ...(body ? { 'content-type': 'application/json' } : {}),
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
          signal: controller.signal,
        });
        const text = await response.text();
        let parsed: unknown = {};
        try {
          parsed = text ? JSON.parse(text) : {};
        } catch {
          parsed = {};
        }
        if (!response.ok) {
          const transient = response.status === 429 || response.status >= 500;
          if (transient && attempt < (this.config.ximilarMaxRetries ?? 2)) {
            await delay(400 * 2 ** attempt);
            attempt += 1;
            continue;
          }
          throw new XimilarProviderError(
            response.status === 429
              ? 'XIMILAR_CREDITS_OR_RATE_LIMIT'
              : response.status >= 500
                ? 'PROVIDER_SERVER_ERROR'
                : response.status === 401 || response.status === 403
                  ? 'PROVIDER_AUTHENTICATION'
                  : 'INVALID_IMAGE',
            transient,
          );
        }
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
          throw new XimilarProviderError('PROVIDER_INVALID_RESPONSE', false);
        return parsed as Record<string, unknown>;
      } catch (error) {
        if (error instanceof XimilarProviderError) throw error;
        if (attempt < (this.config.ximilarMaxRetries ?? 2)) {
          await delay(400 * 2 ** attempt);
          attempt += 1;
          continue;
        }
        throw new XimilarProviderError('PROVIDER_TIMEOUT', true);
      } finally {
        clearTimeout(timeout);
      }
    }
  }
}

function normalizeResponse(
  requestId: string | null,
  envelope: Record<string, unknown>,
): RawCardPreGradeProviderResult {
  const response = record(envelope.response);
  const records = Array.isArray(response.records)
    ? response.records.filter(isRecord)
    : [];
  const parsed = records.map(parseRecord);
  const primary = parsed.find((item) => item.final !== null) ?? parsed[0];
  if (!primary) return emptyResult(requestId, 'PROVIDER_NO_ANALYSIS', envelope);
  const warnings = parsed.flatMap((item) => item.warnings);
  const final = primary.final;
  return {
    status: 'SUCCEEDED',
    providerRequestId: requestId,
    overallEstimate: final,
    overallMin: null,
    overallMax: null,
    frontDetected: parsed.some((item) => item.side === 'FRONT') || null,
    backDetected: parsed.some((item) => item.side === 'BACK') || null,
    centeringScore: primary.centering,
    cornerScore: primary.corners,
    edgeScore: primary.edges,
    surfaceScore: primary.surface,
    confidence: primary.confidence,
    conditionLabel: primary.condition,
    autographDetected: primary.autograph,
    categoryDetected: primary.category,
    warnings,
    providerVersion: stringValue(record(primary.raw.versions).final),
    errorCode: null,
    rawResponse: envelope,
    visualizations: parsed.flatMap((item) => item.visualizations),
  };
}

function parseRecord(raw: Record<string, unknown>, index = 0) {
  const grades = record(raw.grades);
  const card =
    Array.isArray(raw.card) && isRecord(raw.card[0]) ? raw.card[0] : {};
  const tags = record(card._tags);
  const side = tagName(tags.Side);
  const category = tagName(tags.Category);
  const autographTag = tagName(tags.Autograph);
  const status = record(raw._status);
  const warning =
    status.code !== undefined && Number(status.code) !== 200
      ? (stringValue(status.text) ?? 'Provider could not analyze this photo.')
      : null;
  return {
    raw,
    side: normalizeSide(
      side ?? stringValue(raw._id) ?? stringValue(card._id),
      index,
    ),
    category,
    autograph: autographTag ? autographTag.toLowerCase() === 'yes' : null,
    final: numberValue(grades.final),
    confidence: percentageValue(
      grades.confidence ?? raw.confidence ?? card.confidence,
    ),
    corners: numberValue(grades.corners),
    edges: numberValue(grades.edges),
    surface: numberValue(grades.surface),
    centering: numberValue(grades.centering),
    condition: stringValue(grades.condition),
    warnings: warning ? [warning] : [],
    visualizations: [
      {
        side: normalizeSide(
          side ?? stringValue(raw._id) ?? stringValue(card._id),
          index,
        ),
        overviewUrl:
          stringValue(raw._full_url_card) ?? stringValue(card._full_url_card),
        centeringUrl:
          stringValue(raw._exact_url_card) ?? stringValue(card._exact_url_card),
        centering: numericRecord(card.centering),
      },
    ].filter((item) => item.overviewUrl || item.centeringUrl),
  };
}

function emptyResult(
  providerRequestId: string | null,
  errorCode: string,
  rawResponse: unknown = null,
): RawCardPreGradeProviderResult {
  return {
    status:
      errorCode === 'NOT_CONFIGURED'
        ? 'FAILED'
        : errorCode === 'TEMPORARILY_UNAVAILABLE'
          ? 'TEMPORARILY_UNAVAILABLE'
          : 'FAILED',
    providerRequestId,
    overallEstimate: null,
    overallMin: null,
    overallMax: null,
    frontDetected: null,
    backDetected: null,
    centeringScore: null,
    cornerScore: null,
    edgeScore: null,
    surfaceScore: null,
    confidence: null,
    conditionLabel: null,
    autographDetected: null,
    categoryDetected: null,
    warnings: [],
    providerVersion: null,
    errorCode,
    rawResponse,
    visualizations: [],
  };
}
function normalizeSide(value: string | null, index: number): 'FRONT' | 'BACK' {
  return value?.toUpperCase().includes('BACK') || value?.toLowerCase() === 'b'
    ? 'BACK'
    : value?.toUpperCase().includes('FRONT') || value?.toLowerCase() === 'f'
      ? 'FRONT'
      : index === 1
        ? 'BACK'
        : 'FRONT';
}
function numericRecord(value: unknown): Record<string, number> | null {
  if (!isRecord(value)) return null;
  const entries = Object.entries(value).filter(
    ([, item]) => typeof item === 'number' && Number.isFinite(item),
  );
  return entries.length
    ? (Object.fromEntries(entries) as Record<string, number>)
    : null;
}

function record(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : null;
}
function numberValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
function percentageValue(value: unknown) {
  const number = numberValue(value);
  if (number === null || number < 0) return null;
  if (number <= 1) return number * 100;
  return number <= 100 ? number : null;
}
function tagName(value: unknown) {
  if (!Array.isArray(value) || !isRecord(value[0])) return null;
  return stringValue(value[0].name);
}
function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}
