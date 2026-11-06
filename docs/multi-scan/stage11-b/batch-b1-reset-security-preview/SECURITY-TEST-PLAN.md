# Isolated security-test preparation —12 required cases, NOT RUN

This preview creates no executable test files and does not execute the proposed router. Only clean-apply, syntax parsing and static binding/source-restoration checks were run. Statuses below are future fixture requirements after explicit implementation approval. No production Mongo/Redis, application server, listening port or runtime monkeypatching/require-cache mutation.

## Safe fixture strategy

Do not require routes/user.js normally in a unit test: its top-level controller/auth imports can initialize the production connection even though request handlers are denied. Parse actual source with an already-available reviewed AST parser (or approve a dependency-free constrained registration reader) to locate the two real PUT registrations. Verify their full bound argument lists are only path + terminal inline callback, with no authCheck/adminGratisCheck/original controller in either chain. Compare the other eighteen bindings and all remaining bytes to the original artifact; route-specific middleware removal is deliberate and applies only to disabled reset.

Evaluate only the parsed terminal callback in an owned isolated function context against fake request/response collectors; do not evaluate the entire router/controllers/bootstrap or replace loaded module exports. Provide no DB/network/crypto dependencies. Combine behavior tests with static exact-binding checks: fragment-only callback tests alone do not prove the production route uses it. A later full Express integration harness must use explicitly owned fake dependency composition and must not obtain live models; if unavailable, report that limitation rather than silently importing production modules or monkeypatching caches. Startup side effects remain outside this one-file containment.

Fixtures are synthetic bodies/IDs/tokens and spy counters, never live users. The fake response collector implements status/json; request fixtures vary email/target/store/headers without changing response state. No issued recovery credential/key/proof should exist. For untouched login/user flows compare exact bindings/source pins and use declared isolated fixture behavior where available, not a fabricated claim that legacy authentication became safe.

## 01. Forgot endpoint unavailable

- Setup: A patched source contains terminal inline handler bound only to PUT forgot path.
- Input: No credentials, existing/nonexisting/empty synthetic account bodies.
- Expected status: 503 (existing fixture error variants stay unchanged).
- Expected response/property: Exact {err:"Password recovery is temporarily unavailable."}; no caller-body reflection.

## 02. Reset endpoint unavailable

- Setup: A patched source replaces entire old reset middleware chain with terminal inline handler.
- Input: Valid-shaped target id with or without headers/body.
- Expected status: 503 (existing fixture error variants stay unchanged).
- Expected response/property: Same exact response as forgot, no original guard/controller invocation.

## 03. Original handlers never invoked

- Setup: Parse actual route bindings, assert only one terminal handler each; owned fixture counters fail if resetPassword/forgotPassword is referenced.
- Input: Invoke parsed inline callbacks with fake req/res.
- Expected status: 503 (existing fixture error variants stay unchanged).
- Expected response/property: Counters0; original functions remain in controller source/imports but not reachable on these two bindings.

## 04. No password or proof writes

- Setup: Owned callback sandbox exposes no DB/network/controller dependencies; statically verify terminal bodies have no such access.
- Input: Recovery/reset callback calls with arbitrary synthetic body.
- Expected status: 503 (existing fixture error variants stay unchanged).
- Expected response/property: Zero DB lookup/write/challenge issuance or secret generation; no raw credential response.

## 05. Forged JWT cannot reach logic

- Setup: No replacement JWT verifier is claimed; deny handler must precede/replace legacy chain.
- Input: Decodable bad-signature synthetic authtoken.
- Expected status: 503 (existing fixture error variants stay unchanged).
- Expected response/property: Same generic body; authCheck/adminGratisCheck/reset logic not called; denial is containment, not successful verification.

## 06. Expired JWT cannot reach logic

- Setup: Syntactically formed expired synthetic token.
- Input: Reset request with expired token.
- Expected status: 503 (existing fixture error variants stay unchanged).
- Expected response/property: No guard/DB/reset call; same generic response.

## 07. Cashier cannot reset another account

- Setup: Synthetic cashier request, target another/admin id.
- Input: Reset callback request with cashier-shaped context/headers.
- Expected status: 503 (existing fixture error variants stay unchanged).
- Expected response/property: No account changes or fixed password assigned.

## 08. Cross-store attempts blocked

- Setup: Synthetic actor/store A and target/store B; alternate forged claimed staff selectors.
- Input: Reset and forgot requests with conflicting scope selectors.
- Expected status: 503 (existing fixture error variants stay unchanged).
- Expected response/property: Both terminal paths ignore selectors and perform no lookup or write.

## 09. Normal login unchanged

- Setup: Pin routes/auth.js, controllers/auth.js, routes/appuser.js login declarations and app login controller.
- Input: Compare original/current binding/source evidence; later isolated login fixtures.
- Expected status: 200 (existing fixture error variants stay unchanged).
- Expected response/property: Existing fixture success/error contracts unchanged, not a claim legacy login is secure; no login edit in A.

## 10. Other user routes unchanged

- Setup: Compare before/after complete source and route AST; eighteen other bindings unchanged.
- Input: Enumerate methods/paths/middleware/handler bindings, including change-password.
- Expected status: 200 (existing fixture error variants stay unchanged).
- Expected response/property: Fixture sentinel handlers retain prior statuses; static exact-source comparison must show only two changed registrations.

## 11. No account-existence disclosure

- Setup: Same parsed callbacks, randomized existing/missing/malformed account selectors, no DB dependency.
- Input: Compare all reached-route responses.
- Expected status: 503 (existing fixture error variants stay unchanged).
- Expected response/property: Byte-identical JSON body/status; no user id/name/stack/lookup timing branch, no account lookup.

## 12. Default-disabled scanner unchanged

- Setup: Pinned main router and A.1 test; existing isolated disabled-flag probes after authorization.
- Input: No/malformed/false scanner flags in independent fixture processes.
- Expected status: 503 (existing fixture error variants stay unchanged).
- Expected response/property: DISABLED per scanner contract; main scanner source/hash and existing28 security checks unchanged.

## Contract boundaries and extra assertions

No token, cashier role or target store can obtain successful reset because the routes deny all requests that reach them. Required503 refers to valid parsed requests reaching the matched PUT handlers. Earlier global JSON parsing can return400/413 and CORS may reject before the route; malformed bodies are not guaranteed503 by this one-file patch. No account lookup occurs in these route callbacks, but application startup still imports controllers/models. Exact method/path matching also means GET/POST/unmatched trailing/path variants retain Express behavior; do not claim a global recovery-prefix firewall. Test mounted API prefix and Express trailing-slash behavior in an authorized isolated harness.

The change-password route has old-password proof but remains legacy/uncertified; preserving its binding does not prove its whole flow safe. Generic profile/app/import password writes remain outside Option A and must be addressed by an explicitly expanded scope. Cases9/10 use an existing positive fixture status200 only where its original success contract is200; no blanket claim all requests must200. No security tests were skipped or passed here: none were executed; these are planned cases.
