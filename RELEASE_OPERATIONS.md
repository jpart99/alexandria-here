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

The compiled release check is loopback-only and never starts, stops, or rebuilds the Worker. It requires synchronized Worker output, Sites metadata, and D1 migrations; then it checks the landing route, unsafe-URL rejection, and receipt fail-closed behavior. The failure matrix is the separate live archive and persistence gate and may create local D1 rows.

Stop the exact compiled preview before any later rebuild or Sites packaging operation.

## Gate C — external authority

Do not execute these steps without explicit user approval:

1. Create or reuse the Sites project and persist only `project_id`, `d1`, and `r2` in `.openai/hosting.json`.
2. Commit and push the exact validated source using the short-lived Sites source credential without storing the credential in Git configuration or a remote URL.
3. Package the existing successful build with the Sites packaging helper, save one version, deploy it privately, and wait for a successful deployment result.
4. Configure `RECOVERY_RATE_LIMIT_SECRET` as a random hosted secret of at least 16 characters. Configure `OPENAI_API_KEY` when model planning is enabled. `OPENAI_MODEL` may remain at its `gpt-5.6` default.
5. Run a real bounded recovery and inspect its receipt. Model execution is proven only when `receipt.planner` is `gpt-5.6`, `receipt.model` is populated, and all mechanical validation results pass. A deterministic fallback is valid product behavior but is not model-execution proof.
6. Run `reference:produce` against the production URL through the ordinary public API, then persist the printed `NEXT_PUBLIC_REFERENCE_RECOVERY_PATH`. Confirm that the path resolves from production D1 after deployment.

No external gate may be marked complete from a local fallback recovery, a local Miniflare row, an unpersisted reference path, or the presence of credentials alone.
