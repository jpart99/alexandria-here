# Alexandria Here — Failure and Reliability Matrix

This is a release gate, not a hypothetical checklist. Unit coverage is run with
`npm test`; Worker/API checks are run against the compiled local Worker with
`npm run qa:failure-matrix`.

| Boundary | Injected failure | Expected product behavior | Proof |
|---|---|---|---|
| Submitted URL | Bare public hostname/path such as `iexile.com`; HTTP and HTTPS archive variants | Accept the bare hostname without requiring the visitor to add a scheme, normalize it to a public HTTP URL for identity, query both protocol variants, merge/deduplicate witnesses, then retain the same 12-record/8-fetch budgets | Automated URL and dual-CDX unit cases; hosted form contract |
| Submitted URL boundary | Scheme-qualified or bare loopback, private, credentialed, non-web protocol, or nonstandard port; plus valid query-bearing and archived `.onion` HTTP(S) locators | Reject unsafe network targets before persistence or retrieval with a clear `400`; preserve valid query identity and never contact the submitted origin | Automated URL/CDX unit cases, compiled Worker gate, and hosted production v16 gate |
| API body | Wrong content type or body over 4,096 bytes | `415` for non-JSON; clear `400` for oversize; no recovery created | Compiled Worker matrix |
| Archive allowlist | Redirect outside `https://web.archive.org` or excessive redirect chain | Fail closed before the redirected host is fetched | Automated mocked-fetch test |
| Archive MIME | Inventory not JSON or capture not HTML | Stop safely; never parse/render the body as archive evidence | Automated mocked-fetch test |
| Archive body | Declared or actual body over 2,500,000 bytes | Stop that bounded read with an explicit response-budget error | Automated mocked-fetch test |
| Empty archive | No usable public HTML capture rows | Honest failed recovery: “No usable public HTML captures were found.” | Automated mocked inventory test |
| Insufficient evidence | Fewer than five preserved pages, or weak page connectivity | Persist `complete` with `outcome: insufficient_evidence`; open the Atlas evidence state | Live recovery through the compiled Worker |
| Requested era | Year is malformed or not one of at most three deterministic candidates | Reject the request/edition; list only supported candidate years | Automated selection and mocked inventory tests |
| Concurrent work | Second recovery while singleton lock is active | `409`, `Retry-After: 15`; active recovery is not disturbed | Compiled Worker matrix |
| Client disconnect | Requesting client cancels a live NDJSON stream after its first event | Require Workerd to propagate cancellation, persist the exact connection-closed reason, and release the lock; bounded archive deadlines remain a separate safety net, not substitute proof | Compiled Worker matrix |
| Durable result cap | Serialized result exceeds 1.8 MB | Fail before D1's 2 MB row limit with the durable-storage-budget reason | Automated persistence-budget test |
| Legacy result | Additive v2 arrays are missing from an otherwise compatible row | Normalize safe empty arrays and supporting witness IDs; continue rendering | Automated compatibility test |
| Stale/corrupt result | Invalid JSON or incompatible durable result shape | Treat result as unavailable instead of throwing from every read route | Automated compatibility test |
| Completed polling payload | Internal `result_json` exists beside its parsed result | Return only parsed `result`; never duplicate the full evidence packet in public JSON | Automated hydration test |
| Receipt unavailable | Missing, running, failed, or incompatible persisted result | `409` JSON with `no-store` and `nosniff`; never `200 undefined` | Automated pure response test; compiled Worker matrix while running |

## Executed local evidence

- The Phase 38 compiled candidate passed all eight matrix scenarios once, including an ordinary public-archive recovery that completed honestly as `insufficient_evidence`. After the final receipt-identity compatibility corrections and clean rebuild, compiled packaging/smoke passed. The exact final version 16 rerun reached active control recovery `acf8f871-0291-4396-8d32-15a0bcfb3772`, but public Wayback CDX timed out while `finding_captures` and the recovery failed honestly with `Archive request timed out.` The final rerun is recorded as an external archive block, not a passing matrix result; no timeout was relaxed.

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
