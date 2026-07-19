# Alexandria Here — Failure and Reliability Matrix

This is a release gate, not a hypothetical checklist. Unit coverage is run with
`npm test`; Worker/API checks are run against the compiled local Worker with
`npm run qa:failure-matrix`.

Production version 19 at audited runtime commit `88a4dce91b42a3fcc1d2adf9710de6bea651dfc4` passes 96 tests. The accepted Sites record is saved version `appgprj_6a5b165146ec8191a6507491526ca6eb~appgver_d92c137f12788191bf5e69709b3809df`, deployment `appgdep_6a5ccae8dcf48191b85e5a80613dc594`, environment revision 7.

| Boundary | Injected failure | Expected product behavior | Proof |
|---|---|---|---|
| Submitted URL | Bare public hostname/path such as `iexile.com`; HTTP and HTTPS archive variants | Accept the bare hostname without requiring the visitor to add a scheme, normalize it to a public HTTP URL for identity, query both protocol variants, merge/deduplicate witnesses, then retain the same 12-record/8-fetch budgets | Automated URL and dual-CDX unit cases; hosted form contract |
| Submitted URL boundary | Scheme-qualified or bare loopback, private, credentialed, non-web protocol, or nonstandard port; plus valid query-bearing and archived `.onion` HTTP(S) locators | Reject unsafe network targets before persistence or retrieval with a clear `400`; preserve valid query identity and never contact the submitted origin | Automated URL/CDX unit cases, compiled Worker gate, and hosted production v19 gate |
| API body | Wrong exact JSON media type or declared/streamed body over 4,096 bytes | `415` for non-JSON; clear `400` for oversize; cancel at the rejecting chunk without pulling later chunks; no recovery created | Compiled Worker matrix plus adversarial stream test |
| Archive allowlist | Redirect outside `https://web.archive.org` or excessive redirect chain | Fail closed before the redirected host is fetched | Automated mocked-fetch test |
| Archive MIME | Inventory is neither exact `application/json`/valid `application/*+json` nor capture exact `text/html`/`application/xhtml+xml` | Reject look-alikes such as `application/not-json` and `application/nothtml`; never parse/render them as archive evidence | Automated mocked-fetch test |
| Archive body | Declared or actual body over 2,500,000 bytes | Stop that bounded read with an explicit response-budget error | Automated mocked-fetch test |
| Empty archive | No usable public HTML capture rows | Honest failed recovery: “No usable public HTML captures were found.” | Automated mocked inventory test |
| Insufficient evidence | Fewer than five preserved pages, or weak page connectivity | Persist `complete` with `outcome: insufficient_evidence`; open the Atlas evidence state | Live recovery through the compiled Worker |
| Requested era | Year is malformed or not one of at most three deterministic candidates | Reject the request/edition; list only supported candidate years | Automated selection and mocked inventory tests |
| Concurrent work | Second recovery while singleton lock is active | `409`, `Retry-After: 15`; active recovery is not disturbed | Compiled Worker matrix |
| Client disconnect | Requesting client cancels a live NDJSON stream after its first event | Require Workerd to propagate cancellation, persist the exact connection-closed reason, and release the lock; bounded archive deadlines remain a separate safety net, not substitute proof | Compiled Worker matrix |
| Durable result cap | Serialized result exceeds 1.8 MB | Fail before D1's 2 MB row limit with the durable-storage-budget reason | Automated persistence-budget test |
| Legacy result | Additive v2 arrays are missing from an otherwise compatible row | Normalize safe empty arrays and supporting witness IDs; continue rendering | Automated compatibility test |
| Stale/corrupt result | Invalid JSON or incompatible durable result shape | Treat result as unavailable instead of throwing from every read route | Automated compatibility test |
| Persisted query-title compatibility | Receipt `1.3` has no visible `/`, retains an evidenced Missing `/`, and carries that Missing page's title from the historical producer | Accept only that exact already-validated producer shape; leave the content-addressed manifest untouched; derive visitor-facing title from visible witnessed pages; reject unrelated rehashed titles | Adversarial planner/parser/display test; rescued public v17 row served by v18 |
| Existing row without a verified hydrated result | Row is running, failed, or complete with an incompatible persisted packet | Render a branded, generic, noindex state without exposing stored provider/internal error detail; reserve `404` for an absent recovery or invalid nested path | Direct static-render tests for all three states; compiled and hosted route checks |
| Completed polling payload | Internal `result_json` exists beside its parsed result | Return only parsed `result`; never duplicate the full evidence packet in public JSON | Automated hydration test |
| Receipt unavailable | Missing, running, failed, or incompatible persisted result | `409` JSON with `no-store` and `nosniff`; never `200 undefined` | Automated pure response test; compiled Worker matrix while running |

## Executed local evidence

- Production version 19 passed the full eight-boundary compiled failure matrix. Its ordinary public-archive control completed honestly as `insufficient_evidence`, concurrency and cooldown boundaries held, cancellation persisted the authoritative stopped state and released the singleton, the receipt remained unavailable until a compatible result existed, and preview reachability survived every destructive case.

- The exact final version 16 failure-matrix rerun was externally blocked because public Wayback CDX returned zero bytes or timed out; no timeout was relaxed. That historical run reached active control recovery `acf8f871-0291-4396-8d32-15a0bcfb3772` and failed honestly with `Archive request timed out.` The earlier Phase 38 compiled candidate had passed all eight matrix scenarios once; neither historical fact is substituted for the completed v19 run.

- Production version 18 restored ordinary production recovery `52a87f55-914f-4f17-a2b3-40021351f442` to HTTP 200 without rewriting its receipt 1.3 manifest or relabeling its `insufficient_evidence` outcome. The public Atlas and receipt both returned HTTP 200 and displayed the exact surviving witnessed title. Fresh ordinary production recovery `ec9ab849-611a-4644-86d9-2ef82de1c61e` independently completed, hydrated, and rendered at HTTP 200 with its Missing root retained, receipt `1.3`, planner `gpt-5.6`, model `gpt-5.6-sol`, and manifest hash `c615fc3375be9a0d7c10e8fd3753fc9f29701d54f7901ccfd5db94a867f4ec3c`; it does not replace the historical judging proof row.

- A real bounded recovery of `http://info.cern.ch/hypertext/WWW/TheProject.html`
  completed as `insufficient_evidence` and rendered at its ordinary `/r/:id` route.
- A live in-progress recovery returned `409` to a concurrent request.
- Cancelling that live stream after its first event persisted the exact
  connection-closed reason, released the singleton lock, and allowed the next
  live recovery to start. The matrix separately proves direct preview
  reachability after disconnect cleanup and after the final live CERN recovery.
- The first execution exposed a cancellation race that persisted `Unable to
  enqueue`; the stream emitter now stops enqueueing after cancellation so the
  observed cancellation or bounded-timeout reason remains authoritative.
- A stale receipt path that could serialize `undefined` as a successful download
  now returns the explicit unavailable response.

No source-origin fetch is part of any case; only the allowlisted public archive is
contacted during live recovery.
