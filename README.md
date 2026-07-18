# Alexandria Here

Alexandria Here is a witnessed restoration engine for the lost web. Give it one vanished public URL and it reconstructs the strongest coherent edition supported by public archive evidence, then exposes every source, inference, validation, and known absence.

> Alexandria does not generate the past. It reconciles its surviving witnesses.

## Live product

The public production deployment is available at [alexandria-here.cinemaexile.chatgpt.site](https://alexandria-here.cinemaexile.chatgpt.site). An unauthenticated request returned `200 OK` on July 17, 2026 Pacific / July 18 UTC. Its reference Atlas was produced through the same public recovery endpoint used by every visitor; it is not a fixture or privileged demo path.

The deployed engine remains operational when the model provider is unavailable: it records the provider failure in the receipt, uses the deterministic reconciliation path, and never substitutes generated historical content. A submission claim that GPT-5.6 performed a recovery is valid only when that recovery's receipt names the GPT-5.6 planner and model.

## Evidence boundary

[Trish Hopkinson's June 19, 2026 editor interview](https://trishhopkinson.com/2026/06/19/no-fee-submission-call-editor-interview-iexile-deadline-always-open/) independently identifies Jaia Papitz as iExile's founder and records a 2007 founding. That source supports historical founder/year context only. It is not an Alexandria capture, recovery witness, receipt, or source for hosted recovery metrics; those claims must come from the relevant Recovery Receipt.

## Product boundary

- One public HTTP(S) URL per recovery.
- One allowlisted archive provider: `web.archive.org`.
- The submitted origin is never fetched.
- At most 12 inventory records are considered, 8 archived HTML documents are fetched, and 5–8 pages are returned.
- Archived HTML is parsed as hostile, inert data; scripts, forms, embeds, event handlers, and unsafe protocols never render.
- Historical text and images render only when an exact evidence block exists in the Recovery Receipt.
- Insufficient connected evidence returns a complete, inspectable result instead of fabricated content.
- Public archival evidence remains subject to source rights and archive access terms; Alexandria claims neither ownership nor historical completeness.

## License and recovered material

The repository is public for Build Week judging under the terms in [LICENSE](LICENSE). Recovered archival material is evidence from third-party sources and is explicitly excluded from the software license; Alexandria does not claim ownership of it.

## Stack

- Vinext / Next App Router and TypeScript
- Cloudflare Worker-compatible runtime
- D1 locally and hosted, accessed through Drizzle
- Cheerio extraction with SHA-256 block hashes
- OpenAI Responses API with strict structured output when `OPENAI_API_KEY` is present
- Deterministic planner and validator as the safe fallback

## Run locally

Requirements: Node.js 22.13 or newer.

```bash
npm install
cp .env.example .env.local
npm run dev
```

In PowerShell, use `Copy-Item .env.example .env.local` instead of `cp`.

Open `http://localhost:3000`. The app remains fully usable without an OpenAI key; it records that the deterministic fallback was used.

To rehearse the compiled Cloudflare Worker locally, build first and then start it on a separate port:

```bash
npm run build
npm start -- --port 3100 --ip 127.0.0.1 --persist-to .wrangler/production-preview
```

`vinext start` is a Node preview server and cannot provide the `cloudflare:workers` module or D1 binding. Use the Wrangler-backed `npm start` command for this D1 application.

Stop the compiled `npm start` preview before running a fresh `npm run build`. Wrangler keeps temporary files beside `dist/server/wrangler.json` while that preview is active, and on Windows those open files prevent Vite from replacing `dist` cleanly. Build and package first, then restart the compiled preview if it is still needed; the normal `npm run dev` server does not need to be stopped.

## Environment

```text
OPENAI_API_KEY=optional
OPENAI_MODEL=gpt-5.6
RECOVERY_RATE_LIMIT_SECRET=required-random-hosted-secret
```

Do not expose the API key to browser code. The model receives normalized evidence records only and has no browsing tools.

For a hosted release, configure `RECOVERY_RATE_LIMIT_SECRET` as a random secret of at least 16 characters; it keys the HMAC used for short-lived, pseudonymous client cooldown records. `OPENAI_API_KEY` is optional. `OPENAI_MODEL` is optional and defaults to `gpt-5.6`. `NEXT_PUBLIC_REFERENCE_RECOVERY_PATH` is public build-time configuration, not a secret. `ALEXANDRIA_BASE_URL`, `ALEXANDRIA_REFERENCE_URL`, `ALEXANDRIA_PROOF_URL`, and `ALEXANDRIA_PROOF_YEAR` are release-operator variables only.

## Verification

```bash
npm run qa:release
```

This non-mutating local gate runs tests, TypeScript, lint, and the release-manifest audit. It deliberately does not build, deploy, contact the archive, create recoveries, or treat unapproved external work as a local failure.

Production version 6 runs commit `f434249d673911bb5de89689313248b68a389b52`. The release passes 36/36 tests, TypeScript, lint, a clean production build, public browser regression, and a zero-vulnerability production dependency audit. Its ordinary public pipeline produced a [receipt-proven GPT-5.6 iExile recovery](https://alexandria-here.cinemaexile.chatgpt.site/r/8ea53a47-437b-4afe-ad2c-29c81637a327): 5 returned pages from 8 capture records, 347 rendered blocks, 946 content-addressed source blocks, 36 inferred edges, 8 known absences, and all 10 receipt validations passing.

After producing a clean build and starting its Wrangler preview, run:

```bash
npm run qa:release:compiled
npm run qa:failure-matrix
```

The compiled check is loopback-only and never starts, stops, or rebuilds the Worker. The failure matrix separately exercises live local persistence, cancellation, concurrency, and honest insufficient-evidence behavior. The complete operator sequence and the explicit Sites/model/reference authority boundary are in `RELEASE_OPERATIONS.md`.

## Produce a durable reference recovery

After deployment, produce the presentation reference through the same public API as every other recovery:

```bash
set ALEXANDRIA_BASE_URL=https://your-production-host.example
set ALEXANDRIA_REFERENCE_URL=https://the-real-vanished-target.example
npm run reference:produce
```

To produce a receipt-proven GPT-5.6 run without client-side streaming timeouts:

```bash
ALEXANDRIA_BASE_URL=https://your-production-host.example npm run proof:model
```

The command prints persisted progress, fetches the finished receipt, and exits non-zero unless the receipt records `planner: "gpt-5.6"`, a populated model, and zero failed validations. `ALEXANDRIA_PROOF_URL` and `ALEXANDRIA_PROOF_YEAR` default to the bounded iExile 2009 proof target.

The command prints `NEXT_PUBLIC_REFERENCE_RECOVERY_PATH=/r/<id>`. Configure that value in the deployed app to show **View a witnessed recovery** on the landing page. Re-running the command is idempotent while the configured D1 row exists and matches the target; if the row is missing, the command creates a new recovery through `POST /api/recover` and prints the replacement path. No fixture, seed route, or privileged recovery code is used.

Persist the printed path in the deployment environment before re-running the command. Without that configured path, the CLI intentionally has no privileged search endpoint and will create a new ordinary recovery.

## Important routes

- `GET /` — start a recovery and watch persisted stages stream as NDJSON.
- `POST /api/recover` — create one bounded recovery.
- `GET /api/recover/:id` — persisted state for polling and inspection.
- `GET /api/recover/:id/receipt` — machine-readable Recovery Receipt.
- `GET /r/:id` — Returned Site and Recovery Atlas.
- `GET /r/:id/*` — returned internal page.

Successful recoveries open on the Returned Site. Insufficient-evidence recoveries open on the surviving evidence because no site can be returned faithfully.

## Persistence

`.openai/hosting.json` declares the `DB` D1 binding. `vite.config.ts` supplies the same binding through Miniflare locally. Generate migrations after schema changes with:

```bash
npm run db:generate
```

Deploy through the Sites hosting workflow so the managed `DB` resource and packaged `dist/.openai/drizzle` migrations are provisioned together. The zero UUID in generated `dist/server/wrangler.json` is a local placeholder; do not use that file with raw `wrangler deploy`. A manual Cloudflare deployment would require creating a durable D1 database, replacing the placeholder with its real database ID, applying every migration, configuring the Worker assets binding, and setting the OpenAI secret.

The runtime enforces a 1.8 MB serialized-result budget beneath D1's 2 MB row limit. A larger evidence packet fails as an honest terminal recovery instead of surfacing an opaque database error. If a visitor closes the streamed recovery connection, the Worker aborts that recovery, persists the terminal state, and releases the singleton lock.
