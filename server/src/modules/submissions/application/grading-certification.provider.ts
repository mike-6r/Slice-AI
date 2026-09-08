import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../../config/app-config';
import { normalizeCertificationNumber } from '../domain/grading-certification';

export type ProviderCertificationStatus =
  | 'VERIFIED'
  | 'CERT_NOT_FOUND'
  | 'TEMPORARILY_UNAVAILABLE'
  | 'UNSUPPORTED'
  | 'AMBIGUOUS';

export type ProviderCertificationResult = {
  status: ProviderCertificationStatus;
  certificationNumber: string;
  verifiedGrade: string | null;
  verifiedLabel: string | null;
  designation: string | null;
  verifiedIdentity: Record<string, unknown> | null;
  providerReference: string | null;
};

export interface GradingCertificationProvider {
  verify(input: {
    companyCode: string;
    certificationNumber: string;
  }): Promise<ProviderCertificationResult>;
}

export const GRADING_CERTIFICATION_PROVIDER = Symbol(
  'GRADING_CERTIFICATION_PROVIDER',
);

class PsaProviderError extends Error {
  constructor(readonly status: ProviderCertificationStatus) {
    super(status);
  }
}

/**
 * PSA is deliberately opt-in. The endpoint is an approved PSA-backed
 * integration endpoint, not a browser scrape of a public certificate page.
 * This keeps the evidence contract stable and lets a disabled or unhealthy
 * provider fail closed instead of manufacturing a grade from display text.
 */
@Injectable()
export class PsaCertificationProvider implements GradingCertificationProvider {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  async verify(input: {
    companyCode: string;
    certificationNumber: string;
  }): Promise<ProviderCertificationResult> {
    const certificationNumber = normalizeCertificationNumber(
      input.certificationNumber,
    );
    if (input.companyCode.toUpperCase() !== 'PSA')
      return unavailable(certificationNumber, 'UNSUPPORTED');
    if (
      !this.config.psaCertificationVerificationEnabled ||
      !this.config.psaCertificationApiUrl
    )
      return unavailable(certificationNumber, 'UNSUPPORTED');

    let attempt = 0;
    while (true) {
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        this.config.psaCertificationTimeoutMs ?? 6_000,
      );
      try {
        const url = new URL(this.config.psaCertificationApiUrl);
        url.searchParams.set('certificationNumber', certificationNumber);
        const response = await fetch(url, {
          headers: {
            Accept: 'application/json',
            ...(this.config.psaCertificationApiKey
              ? {
                  Authorization: `Bearer ${this.config.psaCertificationApiKey}`,
                }
              : {}),
          },
          signal: controller.signal,
        });
        const body = await parseJson(response);
        if (response.status === 404)
          return unavailable(certificationNumber, 'CERT_NOT_FOUND');
        if (!response.ok) {
          const transient = response.status === 429 || response.status >= 500;
          if (
            transient &&
            attempt < (this.config.psaCertificationMaxRetries ?? 1)
          ) {
            attempt += 1;
            await delay(300 * 2 ** (attempt - 1));
            continue;
          }
          return unavailable(
            certificationNumber,
            transient ? 'TEMPORARILY_UNAVAILABLE' : 'AMBIGUOUS',
          );
        }
        return normalizeResponse(certificationNumber, body);
      } catch (error) {
        if (
          attempt < (this.config.psaCertificationMaxRetries ?? 1) &&
          !(error instanceof PsaProviderError)
        ) {
          attempt += 1;
          await delay(300 * 2 ** (attempt - 1));
          continue;
        }
        return unavailable(
          certificationNumber,
          error instanceof PsaProviderError && error.status !== 'VERIFIED'
            ? error.status
            : 'TEMPORARILY_UNAVAILABLE',
        );
      } finally {
        clearTimeout(timeout);
      }
    }
  }
}

async function parseJson(response: Response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new PsaProviderError('AMBIGUOUS');
  }
}

function normalizeResponse(
  requestedCertificationNumber: string,
  body: unknown,
): ProviderCertificationResult {
  if (!record(body)) throw new PsaProviderError('AMBIGUOUS');
  const status = string(body.status)?.toUpperCase();
  if (status === 'NOT_FOUND' || status === 'CERT_NOT_FOUND')
    return unavailable(requestedCertificationNumber, 'CERT_NOT_FOUND');
  if (status && status !== 'VERIFIED' && status !== 'FOUND')
    throw new PsaProviderError('AMBIGUOUS');
  const returnedCertificationNumber = string(
    body.certificationNumber ?? body.certNumber,
  );
  if (
    !returnedCertificationNumber ||
    normalizeCertificationNumber(returnedCertificationNumber) !==
      requestedCertificationNumber
  )
    throw new PsaProviderError('AMBIGUOUS');
  const verifiedGrade = normalizeGrade(body.verifiedGrade ?? body.grade);
  if (!verifiedGrade) throw new PsaProviderError('AMBIGUOUS');
  const identity = record(body.identity)
    ? body.identity
    : record(body.card)
      ? body.card
      : {};
  return {
    status: 'VERIFIED',
    certificationNumber: requestedCertificationNumber,
    verifiedGrade,
    verifiedLabel: string(body.verifiedLabel ?? body.label),
    designation: string(body.designation),
    verifiedIdentity: {
      ...identity,
      companyCode: 'PSA',
      grade: verifiedGrade,
    },
    providerReference: string(body.providerReference ?? body.requestId),
  };
}

function unavailable(
  certificationNumber: string,
  status: Exclude<ProviderCertificationStatus, 'VERIFIED'>,
): ProviderCertificationResult {
  return {
    status,
    certificationNumber,
    verifiedGrade: null,
    verifiedLabel: null,
    designation: null,
    verifiedIdentity: null,
    providerReference: null,
  };
}

function normalizeGrade(value: unknown) {
  const text = string(value);
  if (!text || !/^\d{1,2}(?:\.\d{1,2})?$/.test(text)) return null;
  const number = Number(text);
  return Number.isFinite(number) && number >= 0 ? number.toFixed(2) : null;
}

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function string(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}
