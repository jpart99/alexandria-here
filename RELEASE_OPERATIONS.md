# Alexandria Here — Release Operations

This runbook separates evidence that can be produced safely on the local machine from actions that require credentials or explicit authority. A pending external gate does not invalidate a local release candidate, and a passing local gate does not imply that Alexandria has been published or that GPT-5.6 was invoked.

## Gate A — static local candidate

Run this while either development server is active; it never builds, deploys, mutates D1, contacts the archive, or reads secret values:

```bash
npm run qa:release
```

It runs the unit suite, TypeScript, lint, and the non-mutating release manifest audit. It verifies the Sites binding declaration, environment contract, source-control exclusions, migration journal, and failure-matrix coverage. It also reports whether the existing `dist` artifact is complete and current, but does not fail Gate A merely because a new build has not been produced.

## Gate B — compiled local candidate

Only one process may own the compiled preview. Before rebuilding on Windows, identify the listener on port 3100 and stop it only if its command belongs to Alexandria's Wrangler preview. Never stop an arbitrary process merely because it owns that port.

With that exact preview stopped:

```bash
npm run build
npm start -- --port 3100 --ip 127.0.0.1 --persist-to .wrangler/production-preview
```

In a second terminal:

```bash
npm run qa:release:compiled
npm run qa:failure-matrix
```

The compiled release check is loopback-only and never starts, stops, or rebuilds the Worker. `npm start` launches from a fresh random rebased config under ignored root `.wrangler`, generates a preview-only admission secret off the command line, strips inherited cloud/output/process-env controls, rejects linked path components and remote/tunnel/content/config overrides, and constrains persistence beneath root `.wrangler`. The gate requires synchronized Worker output, Sites metadata, D1 migrations, physical font bytes, absent static alias files, and generated-state exclusions; then it checks the landing route, browser-only `/witness-fonts/` aliases, ordinary asset bypass, GET/HEAD/Range (`206` or exact-full-`200` platform fallback)/ETag/conditional-`304` behavior, unsafe-URL rejection, malformed and unknown recovery-read boundaries, and receipt fail-closed behavior. The failure matrix is the separate live archive and persistence gate and may create local D1 rows. Production version 23 passed the full eight-boundary compiled failure matrix. If public Wayback CDX is unavailable during a later rerun, record that execution as externally blocked rather than as a passing archive gate.

Stop the exact compiled preview before any later rebuild or Sites packaging operation.

## Gate C — external authority

Do not execute these steps without explicit user approval:

1. Create or reuse the Sites project and persist only `project_id`, `d1`, and `r2` in `.openai/hosting.json`.
2. Configure `RECOVERY_RATE_LIMIT_SECRET` as a random hosted secret of at least 16 characters. Configure `OPENAI_API_KEY` when model planning is enabled. `OPENAI_MODEL` may remain at its `gpt-5.6` default.
3. Commit and push the exact validated source using the short-lived Sites source credential without storing the credential in Git configuration or a remote URL.
4. Package the existing successful build with the Sites packaging helper, save one version, deploy it, and wait for a successful deployment result.
5. Set `ALEXANDRIA_BASE_URL` to the deployed HTTPS origin and run `npm run qa:production`. This hosted boundary gate must pass before the release is accepted; packaged `_headers` alone is only a fallback and does not prove Sites applied the font contract. It deliberately admits no recovery, so it does not replace the real bounded-recovery gate below.
6. Run a real bounded recovery and inspect its receipt. Model execution is proven only when `receipt.planner` is `gpt-5.6`, `receipt.model` is populated, and all mechanical validation results pass. A deterministic fallback is valid product behavior but is not model-execution proof.
7. Run `reference:produce` against the production URL through the ordinary public API, then persist the printed `NEXT_PUBLIC_REFERENCE_RECOVERY_PATH`. Confirm that the path resolves from production D1 after deployment.
8. After the per-client cooldown allows one admitted request, run `proof:model` with `ALEXANDRIA_BASE_URL` set to production. Keep the resulting recovery only when the command proves the GPT-5.6 planner and every deterministic validation.

No external gate may be marked complete from a local fallback recovery, a local Miniflare row, an unpersisted reference path, or the presence of credentials alone.

Immediately before saving the final Devpost copy, run `npm run qa:submission:live`. This is a read-only production gate pinned to the public iExile judging recovery and Mars Pathfinder presentation recovery. It rejects drift in returned/missing page totals, receipt counts, source hashes, model attribution, decision attribution, validations, manifest hashes, Atlas routes, and the accepted font-delivery boundary. It does not save Devpost, upload media, publish YouTube, accept rules, or submit the entry.

## Judging availability hold

Keep the public Sites deployment, managed D1 judging row `18026989-33be-4011-86ee-19e1754cb22c`, managed D1 Pathfinder row `c6adb317-ee2f-4530-9298-e9eb5fe6efd2`, public GitHub repository, and public YouTube video available free and unrestricted through **August 5, 2026 at 5:00 PM PDT (Pacific Time)**. Do not delete, privatize, rotate away, or replace those judging surfaces during the hold.

Run `npm run qa:submission:live` immediately after final submission and at least once per day through the judging deadline. The gate pins both current presentation rows and receipts. Treat any failure as a release incident. Restore the exact public surface and rerun the gate; never recreate or relabel either persisted proof row merely to make a check pass.

## Accepted production record

Production Sites version 27 is the accepted public record. Its audited source commit is `af3092b4bdb5d0e0be36c70624907e30c34953f1`; saved version `appgprj_6a5b165146ec8191a6507491526ca6eb~appgver_6513171548c881919378f367ce79936f`; deployment `appgdep_6a60b9d31a908191b5803b9e552ec573`; environment revision 7. The source gate passed 100 tests, TypeScript, lint, a clean build, `qa:release`, and the zero-vulnerability shipped dependency audit. Hosted acceptance passed the light landing and Recovery Atlas, exact 320 px and desktop containment, zero-console hydration, the persisted evidence ribbon, all five Atlas panels, Show the Seams, receipt download, and a fresh ordinary bare-host recovery. Recovery `705709f4-e9c8-4037-8c5e-c78d4857341e` completed as honest `insufficient_evidence`, rendered at `/r/:id` instead of raw `Not Found`, and exposed a receipt `1.3` GPT-5.6 record. The exact judging row remains receipt `1.0`; v27 serves and audits it without rewriting or reattributing it. Version 23 remains the historical release that passed the full compiled failure matrix and submission/live-proof gates.

Historical v23 submission provenance remains exact: Production Sites version 23 was accepted only after the hosted gate passed against the public origin. Its audited source commit is `65b39285520cf871df1081d6899b083af3edbd83`; saved version `appgprj_6a5b165146ec8191a6507491526ca6eb~appgver_bf2e23910c90819193de0e5adf1b785d`; deployment `appgdep_6a5d57fbccb08191b868daeaf3d8e0d8`; environment revision 7. Neither record should be relabeled as generated by v23. These statements preserve the sealed v23 media and proof contract; they do not describe the current deployed interface.

Historical Sites release v22 used runtime commit `8291a2ef5d92503349ba7346cc9c3f6d1de3b17a`, saved version `appgprj_6a5b165146ec8191a6507491526ca6eb~appgver_1f55f0478180819189cd0b2b8d97186b`, deployment `appgdep_6a5d42d6ba9481918078b196f495ada1`, and environment revision 7; its deployment-time source gate passed 99 tests and its full eight-boundary compiled failure matrix passed.

Historical Sites release v20 used runtime commit `6c7d8df04db7c9b4ac56b05e61b367f1b025d529`, saved version `appgprj_6a5b165146ec8191a6507491526ca6eb~appgver_e0e0becb32ec8191aaec526418590d31`, deployment `appgdep_6a5d33a6af448191ab4ba6a7eeaf0b63`, and environment revision 7; its source gate passed 99 tests and its full eight-boundary compiled failure matrix passed.

Sites version 21 was rejected because its packaged `dist` was stale. It was never accepted as production.

Historical Sites release v19 used runtime commit `88a4dce91b42a3fcc1d2adf9710de6bea651dfc4`, saved version `appgprj_6a5b165146ec8191a6507491526ca6eb~appgver_d92c137f12788191bf5e69709b3809df`, deployment `appgdep_6a5ccae8dcf48191b85e5a80613dc594`, and environment revision 7; its source gate passed 96 tests.

Historical Sites release v18 used runtime commit `174e05a38d5a49a17d5d116cb79f8a3c53963286`, saved version `appgprj_6a5b165146ec8191a6507491526ca6eb~appgver_29be18fd06788191b4499c75b4bdabad`, deployment `appgdep_6a5caab525508191ac8eb45c0b3e7fae`, and environment revision 7; its source gate passed 93 tests.

Production version 18 restored ordinary production recovery `52a87f55-914f-4f17-a2b3-40021351f442` to HTTP 200 without rewriting its receipt 1.3 manifest or relabeling its `insufficient_evidence` outcome. Its public Atlas and receipt now both return HTTP 200, its exact visible witnessed title renders, and its persisted manifest remains unchanged. Fresh ordinary production recovery `ec9ab849-611a-4644-86d9-2ef82de1c61e` then completed, hydrated, and rendered at HTTP 200 with its Missing root retained, receipt `1.3`, planner `gpt-5.6`, model `gpt-5.6-sol`, and manifest hash `c615fc3375be9a0d7c10e8fd3753fc9f29701d54f7901ccfd5db94a867f4ec3c`. Keep both rows during the judging hold; neither supersedes or relabels the pinned proof row.

Historical Sites release v16 used runtime commit `d32ab887e880d7f3d4bbf1c9d71e0aec37388a43`, saved version `appgprj_6a5b165146ec8191a6507491526ca6eb~appgver_76f67dace6088191b2b415d5e4b1d17b`, deployment `appgdep_6a5c90b3020c81919c73b5a84e39580e`, and environment revision 7; its source gate passed 91 tests. The exact final version 16 failure-matrix rerun was externally blocked because public Wayback CDX returned zero bytes or timed out; no timeout was relaxed.

Historical Sites release v17 used runtime commit `c7112dbf9edde6531b02f1e6e3547667fa6f8003`, saved version `appgprj_6a5b165146ec8191a6507491526ca6eb~appgver_a32fbc5b2a0481919cede26452bc7033`, deployment `appgdep_6a5ca4a4cc788191924a28d69120d106`, and environment revision 7. That landing/Atlas release passed its hosted submission contract; the subsequent ordinary iExile submission exposed the persisted query-title defect that v18 repaired without rewriting D1.

The proof recovery remains attributed to version 7 runtime `042215042dd46ded14b501f961f4d9e7debb8178`. Historical compatibility release v8 used runtime commit `f7f8f529285ed9e01fdbe02e868833fc86de5475`; ordinary probe `6e467987-af60-4153-8d27-7653f56475aa` records that release's native receipt/model path. The historical version-8 probe now fails closed under the current evidence-replay validator; its machine receipt is unavailable. Neither record should be relabeled as generated by v27. The v8 row must not be presented as current clickable judge proof.
