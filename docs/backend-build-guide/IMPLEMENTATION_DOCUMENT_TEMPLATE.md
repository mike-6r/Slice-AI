# Implementation document template

Every implementation prompt must be standalone and use these exact numbered sections:

1. **Document metadata** — number/title/phase/status/risk/prerequisites/completed docs/blockers/frontend routes/components/backend modules/scope/parallel safety.
2. **Project-specific context** — exact Slice feature, present data source/mock behavior and downstream dependencies.
3. **Current implementation audit** — complete/partial/scaffolded/mocked/missing/preserve/replace/avoid/contradictions/debt.
4. **Files to read** — exact frontend, backend, schema, test and guide paths.
5. **Strict scope** — individually actionable authorized behaviors.
6. **Out of scope** — later modules, integrations, redesigns, claims and shortcuts.
7. **Dependencies and preconditions** — services, variables, migrations, approvals, legal/provider/test gates and unavailable-dependency behavior.
8. **Database specification** — model/field/type/null/default/privacy/relation/index/constraint/mutability/deletion/retention/audit, enums, migration/seeds/test DB; or `Database work: none.`
9. **Domain types and ports** — IDs/entities/value objects/enums/results/errors/repository/provider/clock/random/transaction/mapper methods.
10. **Domain rules and invariants** — transitions, authorization, balances/supply, status/concurrency/replay/idempotency/precision/rollback/terminal rules.
11. **Application services** — operation input/actor/validation/repositories/transaction/auth/idempotency/audit/events/result/errors/retry.
12. **API specification** — exact method/path/access/auth/permission/DTO/params/response/status/page/sort/filter/idempotency/rate/audit/event/error/consumer.
13. **Error catalogue** — code/status/safe message/private log/retry/field/audit behavior.
14. **Authorization and security** — roles/status/ownership/admin/self/secrets/PII/redaction/abuse/CSRF/XSS/webhook/file/fraud/incident.
15. **Audit and idempotency** — mutation action/actor/subject/metadata/prohibitions/result/transaction plus key scope/fingerprint/replay/conflict/expiry/safe response.
16. **Events, realtime and jobs** — versioned payload/audience/auth/dedupe/invalidation/jobs/retry/dead-letter; or explicitly none.
17. **Frontend alignment** — route/component/port/hook/mock/fields/loading/empty/error/page/realtime/HTTP adapter/backward compatibility and whether frontend changes.
18. **Implementation file plan** — create/modify/preserve/avoid paths using repository conventions.
19. **Numbered implementation process** — concrete ordered steps from audit through state update.
20. **Test plan** — unit/invariant/PostgreSQL/Redis/E2E/contract/concurrency/provider/browser/visual/manual evidence.
21. **Manual QA** — setup, request/action, expected HTTP/body/DB/audit/frontend effect and cleanup.
22. **Verification commands** — exact existing or explicitly added commands and working directories.
23. **Documentation and state updates** — every affected control/blueprint/baseline/prompt file.
24. **Completion checklist** — granular behavior/invariant/security/test evidence; blockers recorded instead of checked.
25. **Final report format** — the 17 required implementation-report items.
26. **Stop condition** — exact required text below.

## Required stop text

Stop after completing this document.

Do not start the next implementation document.

Do not begin later-phase work.

If any required dependency or verification is unavailable, stop and report the exact blocker rather than faking completion.
