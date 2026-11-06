# Phased rollout plan — no phase executed

Stage 10 produces specifications and required offline tests only. It does not promote this plan, mount a route, deploy, access a host, enable scanning or authorize cart changes. Each phase requires its own recorded entry/exit evidence and the approval below.

## A — Offline validation

Entry: Explicit offline scope; full hashes/Git/symlink baseline; fixture-only keys/data; feature gates false.

Exit: Frozen suites plus new safety tests pass; no protected changes; traceable new files; documented auth/DTO/resource gaps; no real accuracy substituted by synthetic results.

Stop/rollback: Any protected mutation, production connection, credential leakage or unsafe confirmed result stops dependent work.

Approval: Offline test authorization only; no phase promotion or activation.

State: PLAN ONLY; Stage 10 required regression evidence does not advance this rollout.

## B — Authorized integration changes

Entry: Written approval of exact INTEGRATION-PATCHES.md file-level scope and selected authentication option; review rollback artifacts.

Exit: Reviewed isolated branch/patch; dedicated signed bounded credentials; rich scan and authenticated catalog/review contract; complete-review guard; early private parser mount; disabled defaults; static/security regression pass.

Stop/rollback: Ambiguous router precedence, legacy auth reuse, arbitrary URL/key config, changed old scanner resources or incomplete scans exposed as complete.

Approval: Protected-file editing approval; no host access implied.

State: NOT EXECUTED.

## C — Isolated staging deployment

Entry: Separate staging host/network/secret/access authorization; no production DB/customer cart; pinned artifacts and owned test catalog.

Exit: Actual TLS/proxy/body-size/upload/disconnect/replay tests; target CPU/RAM/disk/cold warm p95/p99 load evidence; namespace isolation; logs/privacy/audit and drain/restore verified; frontend initially disabled.

Stop/rollback: OOM/native hangs, leaked photos/tokens, cross-tenant access, old scanner regression, incorrect gate/deadline behavior.

Approval: Explicit staging deployment/access and test activation scope; InterServer access separately authorized.

State: NOT EXECUTED.

## D — Real grocery accuracy evaluation

Entry: Rights-cleared real reference/checkout dataset; reviewed exact IDs/boxes/quantities/unknowns; independent held-out sessions; approved metric gates.

Exit: Minimum samples/strata achieved; version-pinned evaluation; proposed detection/SKU/count/unknown/variant/FAR bounds and review coverage pass or owner-approved revised gates; zero fabricated results; human audit signs off.

Stop/rollback: Failed variant/unknown gates, leakage, uncertain labels/rights, insufficient accepted-decision denominator or new packaging drift.

Approval: Data collection/retention and gate acceptance; no public rollout implied.

State: NOT EXECUTED.

## E — Limited cashier pilot, review-only

Entry: Separate pilot activation approval after B/C/D exits; tenant/operator allowlist; budgets/support/kill switch; no dispatch/persistence callback.

Exit: All selections require human review; observed correction/time burden acceptable; no customer-cart/order mutation; stable privacy/rate/capacity evidence; signed go/no-go and rollback rehearsal.

Stop/rollback: Any silent SKU/variant/unknown acceptance, hidden truncation, price/stock mismatch, duplicate proposal or production resource regression.

Approval: Explicit limited review-only activation; not general production rollout.

State: NOT EXECUTED.

## F — Optional cart confirmation

Entry: Separate explicit cart-mutation authorization; reviewed auth + existing cart/checkout validation; durable scoped idempotency, atomic stock/version checks, no uncertain SKU, recovery/reconciliation design.

Exit: Non-production transactional race/retry/restart tests; existing POS variant/waiting/wholesale/manual behavior preserved; limited authorized mutation pilot and independent sign-off.

Stop/rollback: Duplicate writes, lost stock/cart updates, unauthorized pricing, uncertain variant acceptance, un-reconciled partial persistence.

Approval: Separate mutation/deployment/activation permission; never inferred from earlier phases.

State: NOT EXECUTED.
