# Grading Company and Certification Authority

## Purpose

Slice treats a professional grade as company-specific evidence. A numeric value
alone is never an official grade and typed certificate text is never proof of a
provider lookup.

## Registry

The catalogue registry supports PSA, BGS, BVG, BCCG, CGC, SGC, TAG, and ACE.
Each company stores a customer display name, full name, verification mode,
official lookup URL, certification-format note, and scale-version marker. The
registry is additive: a new company or scale version is data, not a frontend
conditional.

The current seeded scale authority is maintained for PSA and BGS. PSA has no
9.5 entry. BGS supports half grades and stores Pristine as a semantic
designation; Black Label is a verified designation, not a separate numeric
grade. CGC stores current and legacy entries separately using `legacy`,
`gradeEra`, and `designation`.

BVG, BCCG, SGC, TAG, and ACE are registered, but their scale entries remain
disabled until Slice staff confirms the exact current scale against the
company's official material. This prevents invented grade values from entering
the customer workflow.

## Verification authority

All seeded companies currently use `MANUAL_OFFICIAL_LOOKUP` and have automated
provider calls disabled. The customer action records a normalized certificate
and creates an auditable `MANUAL_REVIEW_REQUIRED` verification. A staff member
must compare the official lookup record with year, set, card number, name,
variant, language, company, grade, and any designation before marking it
`VERIFIED`.

Official lookup references:

- PSA: https://www.psacard.com/cert
- Beckett: https://www.beckett.com/grading/card-lookup
- CGC Cards: https://www.cgccards.com/certlookup/
- SGC: https://www.gosgc.com/certlookup
- TAG and ACE: company portals are retained as manual references until a
  dedicated official certificate endpoint is confirmed.

Slice must not scrape or infer provider records. An approved machine adapter
may be added later behind the same verification record and status contract.

## Identity and grade matching

The selected `GradeScaleEntry` is authoritative for the declared company and
numeric grade. Manual verification records the provider's returned identity,
grade, label, designation, subgrades, and era. Any explicit mismatch blocks
verification and submission. A verified provider grade is the authoritative
grade for the verification record; AI slab recognition remains supporting
evidence only.

## Duplicate certificate protection

Certificate numbers are normalized by trimming, upper-casing, and removing
separators while preserving leading zeroes. A unique
`(companyCode, normalizedCertificationNumber)` claim protects active drafts,
submitted/reviewed/approved submissions, linked assets, and custody-era
records. Rejected or cancelled submissions release the claim while retaining
verification and audit history. Same-draft retries are idempotent. The unique
database index and transaction claim close concurrent races.

## Price and public semantics

Company, grade label, designation, legacy/current era, and certification status
remain separate fields. No BGS Black Label is mapped to PSA 10, and no company
grade is flattened into an unqualified Slice or PriceCharting grade.

## Release boundary

This phase does not enable live provider calls, scrape certificate sites, create
financial records, alter valuation, or change ownership/trading state.
