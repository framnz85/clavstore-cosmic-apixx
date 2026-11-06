# Stage 11-B / Batch B.1-S3 — credential-write security review

**Review preparation complete. No remediation patch applied and no existing file modified in this stage.** The approved emergency recovery containment remains intact. Scanner stays disabled. No production Mongo/Redis, provider, live credential, cart, deployment or destructive operation was used.

## Findings that drive the decision

1. Generic main/customer/app/import handlers accept credential, login and authority fields through broad request/row updates under decode-only identity. These are source-confirmed unauthorized credential-write and privilege-escalation paths, not hypothetical issues fixed by the two recovery denials.
2. Public user registration accepts a requested staff/admin role. Public order viewing also signs a legacy login token for the order account without ownership/password proof. Verifying existing JWT signatures alone would not remove these unsafe signed issuers.
3. Broad store/warehouse settings, membership repair on GET, client-generated verification, account deletion/reassignment and shared-password customer provisioning create additional authority/credential paths. Payment configuration writes can also replace provider secret material under weak guards.
4. Existing password change has old-secret proof and is not classified as a no-proof reset just because JWT auth is weak. Existing recovery routes are adequately contained by terminal503. Many other findings have conditional or unresolved impact; the inventory distinguishes them.
5. Trusted ownership/grant/status/epoch data and a safe new issuer are not available as a verified production contract. A fresh read of legacy mutable role/member rows is not sufficient. Privileged/import reopening and a real profile adapter remain blocked on separately reviewed data/migration work.

## Deliverables

| Required item | Review artifact |
| --- | --- |
| Complete operation/route/guard/controller/query inventory | [CREDENTIAL-WRITE-INVENTORY.md](CREDENTIAL-WRITE-INVENTORY.md), JSON companion; [INLINE-AND-TRUST-GAPS.md](INLINE-AND-TRUST-GAPS.md) |
| Source-verified findings and authentication analysis | [SECURITY-FINDINGS.md](SECURITY-FINDINGS.md), [AUTHENTICATION-ANALYSIS.md](AUTHENTICATION-ANALYSIS.md), SOURCE-EVIDENCE.json, MUTATION-SCAN.json and reviewed exclusions |
| Risk-ranked fixes and implementation order | [REMEDIATION-PLAN.md](REMEDIATION-PLAN.md) |
| Exact proposed patches | Six diffs below; PATCH-MANIFEST.json and DIFF-INVENTORY.json pin dependencies/hashes |
| Compatibility/global legacy migration | [COMPATIBILITY.md](COMPATIBILITY.md) |
| Isolated test preparation | [SECURITY-TEST-SPECIFICATIONS.md](SECURITY-TEST-SPECIFICATIONS.md); PROFILE-WRITE.test.js.txt draft in06 |
| Rollback procedures and current preimages | [ROLLBACK.md](ROLLBACK.md), ROLLBACK-PREIMAGES.json, nine rollback-preimages/*.txt files |
| Integrity/disabled scanner | [INTEGRITY-REPORT.md](INTEGRITY-REPORT.md), full BASELINE/AFTER manifests and final artifact inventory |

The inventory covers40 controller operations plus inline mock license/access/payment boundaries.507 source hashes and60 mutation/issuance anchors support the review. Classification counts overlap and include conditional credential provisioning/provider-secret use; they are not40 confirmed password resets. Missing-trust classification U01 is explicit in the appendix and findings.

## Exact patch choices — all unapplied

| Diff | Scope and review decision |
| --- | --- |
| [01-GENERIC-WRITER-CONTAINMENT.diff](01-GENERIC-WRITER-CONTAINMENT.diff) | Smallest immediate safe writer containment: four generic/customer/app/import PUTs503, two existing router files. Legitimate profile/admin/import edits also unavailable. |
| [02-RELATED-AUTHORITY-CONTAINMENT.diff](02-RELATED-AUTHORITY-CONTAINMENT.diff) | Twelve authority/unsafe issuer bindings503, including public order login-token issuance. Wider enrollment/store/verification/affiliate outages; review separately, never infer authorization from01. |
| [03-REMOVE-IMPLICIT-MEMBERSHIP-WRITE.diff](03-REMOVE-IMPLICIT-MEMBERSHIP-WRITE.diff) | Remove dedicated-store membership repair write/assignment on user-details GET. |
| [04-STOP-SHARED-PASSWORD-PROVISIONING.diff](04-STOP-SHARED-PASSWORD-PROVISIONING.diff) | Four implicit new-customer branches409; existing-customer behavior retained in source. Needs isolated branch regressions after approval. |
| [05-PAYMENT-CREDENTIAL-CONTAINMENT.diff](05-PAYMENT-CREDENTIAL-CONTAINMENT.diff) | Three payment configuration mutation routes503; payment execution itself untouched. |
| [06-FUTURE-SELF-PROFILE-CORE.diff](06-FUTURE-SELF-PROFILE-CORE.diff) | Proposed pure core plus13 synthetic test drafts. Verified narrow-purpose token, immutable subject/tenant checks, name/phone allowlist, rejection of credentials/ownership/unknown fields, fresh trusted epochs and atomic commit contract. No default adapter/key/issuer or application binding. **Not an integration-ready reopening patch.** |

01–05 are prepared as a sequence with exact step hashes; if a different subset/order is approved, rebase/recheck its exact preimages and review resulting scope. No whole-series approval is inferred. The patches do not change global legacy JWT middleware, login, frontend, AI source, feature flags or production configuration. Generic credential/role fields never become permitted just because a request is signed. Future imports must be separately privilege-restricted, bounded, tenant-scoped, profile-only and atomic; no cashier credential overwrite or email upsert fallback.

## Checks actually performed

- Every proposed diff passed clean application checks only; no git apply mutation was run.01–05 used disposable mirrors of exact preimages,06 checked absence of its proposed new module/test paths.
- Proposed postimage JS syntax checks passed at each step, including both future-core/test drafts. No candidate route/controller/bootstrap or runtime test was executed.13 tests are prepared, not passed.
- All106,998 preexisting regular files across all three projects remain byte-identical to this stage's baseline, with no missing files or errors. All88 symlink targets and Git statuses unchanged. Source evidence pins independently reverified.
- The previous12 containment/28 security/428 historical/9 syntax results remain prior implementation results, not new executions here. Post-authorization regression commands and additional security cases are specified.
- Current user-router SHA256: `a8c092ffc22484b7d5cfd0b876ac160a04a2343d12bedea0d39a56a198216ddd`. Scanner router and A.1 test retain their approved hashes in the integrity report. Both scanner flags absent in inspected main environment/configuration; defaults remain fail-closed.

## Stop point

The concrete next review is whether to accept the four-route profile/import outage in01 and which critical authority/issuer companion containments to approve separately. Reopening profile/import/privileged writes requires the documented issuer, trusted-data, atomic adapter and client migration decisions;06 alone cannot supply them. No source implementation, global authentication migration, scanner integration, deployment or further batch was started. Waiting for review and explicit source-change authorization.
