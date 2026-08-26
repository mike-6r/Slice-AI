# Owner Demo Runbook

## Safety boundary

Use only the named staging Owner Demo records. Never modify controlled Umbreon
economics or controlled Charizard physical state. Do not use direct SQL, live
bank settlement, production providers or a frontend-only demo mode. Stop and
repair through the responsible Slice service if a state is inconsistent.

## Operator preparation

On the staging host, with the protected staging environment and the separately
guarded demo environment loaded, run the existing service-backed checks:

```bash
npm run staging:demo:preflight
npm run staging:demo:refresh
npm run staging:demo:market:check
npm run staging:demo:market:verify
npm run staging:demo:vault-live:check
```

These scripts are staging-guarded. `preflight` and the two `check`/`verify`
commands are read-only. `refresh` may restore only the explicitly named demo
records through existing domain services. It is not a database reset.

Do not display passwords or protected environment values during the demo.

## Presenter script

1. Sign in as **Owner Demo Collector** and create a clearly named Owner Demo
   listing. Upload the required staging-safe evidence and submit it.
   **Show:** submission reference, revision and private workflow status.
2. Switch to an Admin account. Open **Review Queue**, find the submission,
   claim it and open its review workspace.
   **Show:** identity, evidence, certification, provider/reference research,
   advisory AI output, staff condition and valuation. Explain that external
   research and AI are not final valuation or grading authority.
3. Accept the submission with a reason and customer-safe note.
   **Show:** the audit event and that acceptance does not claim receipt,
   custody, ownership or market publication.
4. Perform the explicitly approved canonicalization action.
   **Show:** the draft canonical Asset ID and source link. Do not continue if
   this action is absent: it is a product gate, not a manual database task.
5. Open **Physical Intake**. Progress the disposable shipment through the
   staging adapter, confirm physical receipt and complete verification.
   **Show:** carrier-delivered and staff-received are different facts.
6. Open **Collectibles** and then the collectible detail.
   **Show:** canonical identity, submission/intake lineage, custody, verified
   state, staff valuation and current blockers.
7. Use the guarded ownership workflow to propose, approve and issue the demo
   supply. Have the collector propose an Initial Offering, then approve and
   open it as authorized staff.
   **Show:** retained amount, offering inventory, unit count, price per Slice,
   fee policy and readiness. Explain that issuance is separate from asset
   creation.
8. Publish/enable the market only after its readiness conditions pass. Open
   the public marketplace and asset detail.
   **Show:** image, identity, grade/cert, market state, price per Slice and
   availability. Do not represent market reference data as Slice valuation.
9. Sign in as **Owner Demo Investor**, preview and place a supported local-test
   buy order. Confirm it once only.
   **Show:** quantity, fees, total, resulting ownership, execution, portfolio
   holding and transaction history.
10. Return to Admin Collectible Detail/Finance views.
    **Show:** supply, positions, offering inventory, execution and audit
    lineage. Optionally demonstrate a supported secondary order only after the
    primary flow has passed.

## Current canonicalization gate

As of source candidate `8bea9a8`, canonicalization remains a protected,
backend-only create-and-link authority. The owner must choose the boundary
(the checked-in recommendation is explicit staff Model C) and the selected
staff action must be implemented and tested before step 4 can be demonstrated.
Do not bypass this gate with shell commands, raw SQL or undocumented calls.

## Recovery

If a demo mutation fails, record its request ID, stop at that boundary and open
the corresponding Admin history/audit view. For the named demo fixtures, run
the staging-only refresh and verifier commands above after the issue is fixed.
If a new Owner Demo fixture/reset tool is introduced, it must identify records
by immutable demo markers, operate through domain services and preserve audit
and ledger history; it must never delete broad staging records.

## Short owner demonstration

Target duration: measure and record it during final staging QA. The short flow
does not conceal domain work; it uses a prepared, clearly labelled disposable
Owner Demo record at successive checkpoints:

1. Collector listing and submission.
2. Admin review/acceptance and the explicit canonicalization action.
3. Verified custody and staff valuation on Collectible Detail.
4. Issued supply and open Initial Offering.
5. Marketplace purchase by Owner Demo Investor and the updated Portfolio.
6. Admin history/audit proof of the complete chain.

At each checkpoint answer in plain language: what this item is, its current
state, the next action, its physical location, its valuation/authority, who
owns it, whether it can be bought, and why an action is enabled or blocked.

## Deployment, rollback and post-demo reset

Before deployment, capture the candidate commit, active immutable release path,
API/build identifier if exposed and a fresh browser bundle check. Confirm a
previous known-good release exists and that the forward migration set remains
application-compatible for rollback. The established rollback procedure is the
documented `/opt/slice/current` symlink restoration followed by API/web restart;
do not roll back merely to perform QA.

The existing staging refresh tooling is not a ledger-destructive cleanup tool.
A completed Owner Demo reset must enumerate only immutable Owner Demo markers
for users, submission, intake, asset, custody test state, valuation, supply,
offering, orders, executions, test funds and notifications. It must use the
approved service authority, preserve audit/financial invariants and leave
controlled records untouched. Until that tool and a clean-state rerun are
verified, reset readiness is not a PASS.
