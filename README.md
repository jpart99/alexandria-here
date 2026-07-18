# Alexandria Here

Alexandria Here is a witnessed restoration engine for the lost web. Give it one vanished public URL and it reconstructs the strongest coherent edition supported by public archive evidence, then exposes every source, inference, validation, and known absence.

> Alexandria does not generate the past. It reconciles its surviving witnesses.

## Product boundary

- One public HTTP(S) URL per recovery.
- One allowlisted archive provider: `web.archive.org`.
- The submitted origin is never fetched.
- At most 12 inventory records are considered, 8 archived HTML documents are fetched, and 5–8 pages are returned.
- Archived HTML is parsed as hostile, inert data; scripts, forms, embeds, event handlers, and unsafe protocols never render.
- Historical text and images render only when an exact evidence block exists in the Recovery Receipt.
- Insufficient connected evidence returns a complete, inspectable result instead of fabricated content.
- Public archival evidence remains subject to source rights and archive access terms; Alexandria claims neither ownership nor historical completeness.

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
copy .env.example .env.local
npm run dev
```

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
```

Do not expose the API key to browser code. The model receives normalized evidence records only and has no browsing tools.

For a hosted release, `OPENAI_API_KEY` is the only secret. `OPENAI_MODEL` is optional and defaults to `gpt-5.6`. `NEXT_PUBLIC_REFERENCE_RECOVERY_PATH` is public build-time configuration, not a secret. `ALEXANDRIA_BASE_URL` and `ALEXANDRIA_REFERENCE_URL` are used only by the reference-production CLI.

## Verification

```bash
npm run qa:release
```

This non-mutating local gate runs tests, TypeScript, lint, and the release-manifest audit. It deliberately does not build, deploy, contact the archive, create recoveries, or treat unapproved external work as a local failure.

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
