import type {
  ComplianceRiskEvent,
  ComplianceRiskEventSink,
  RiskScreeningProvider,
  SanctionsScreeningProvider,
} from './provider.types';

export type { ComplianceRiskEvent, ComplianceRiskEventSink, RiskScreeningProvider, SanctionsScreeningProvider };

/**
 * These ports are intentionally declarations only in Phase 4E. A future
 * provider or Slice-owned policy service may implement them without changing
 * money movement authority or coupling the domain to a vendor SDK.
 */
