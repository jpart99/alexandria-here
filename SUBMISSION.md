# OpenAI Build Week submission draft

Status: copy-ready draft. Public access, repository, track, `/feedback` Session ID, and receipt-attributed GPT-5.6 run are confirmed. Do not submit until the public video URL is added and Jaia personally accepts the official-rules checkbox.

## Project

**Alexandria Here — a witnessed restoration engine for the lost web**

Recommended track: **Education**

Tagline: **The lost web, present again—without pretending the gaps were never there.**

Live product: https://alexandria-here.cinemaexile.chatgpt.site

Code repository: https://github.com/jpart99/alexandria-here

Demo video: `[ADD PUBLIC YOUTUBE URL — UNDER 3 MINUTES]`

Codex Session ID: `019f7304-e394-7f11-ba64-26e415135ff6`

## Inspiration

The web loses places, not just pages: community archives, memorials, independent publications, classrooms, and cultural projects disappear into partial captures. Snapshot tools can show individual moments, while generative systems are tempted to smooth over missing material. Alexandria Here asks a stricter question: can a vanished site be returned as a coherent place while making every surviving witness, structural inference, conflict, and absence inspectable?

## What it does

Give Alexandria one vanished public URL. It ranks at most three bounded public Wayback evidence windows. Without a requested year, code selects the highest-ranked candidate; a supported requested year is selected mechanically from those candidates before model output. Alexandria then extracts inert evidence blocks, builds a Temporal Evidence Graph, and returns a browsable site when the surviving evidence is connected enough.

Every returned block can reveal its witness in **Show the Seams**. The **Ghost Map** shows preserved pages, reconstructed structure, and referenced-but-uncaptured absences. The **Recovery Receipt** records source IDs, hashes, archive timestamps, model/schema versions, decisions, warnings, and deterministic validation results.

When the evidence is insufficient, Alexandria does not fabricate a site. It returns a complete Atlas explaining what survived and why it refused to claim more.

## How we built it

- TypeScript with Vinext/Next App Router on a Cloudflare Worker-compatible runtime.
- Managed D1 persistence with streamed, persisted recovery stages.
- One archive provider, strict URL validation, redirect revalidation, MIME/size/time budgets, and no submitted-origin fetch.
- Cheerio extraction that treats archived HTML as untrusted input, strips scripts, forms, embeds, event handlers, and unsafe protocols, and emits inert evidence records.
- Content-addressed evidence blocks using SHA-256.
- A deterministic temporal score that rewards page coverage and a directory-neighbour density proxy while penalizing date spread, conflicts, and duplicate captures.
- A constrained GPT-5.6 Chronologist using the Responses API and strict Zod structured output. From a bounded evidence packet, it may return only a complete order of returned preserved page IDs and one supplied primary record ID for each returned page. It cannot browse, choose the year/window, choose rendered blocks or supporting sources, or create historical content; those structures are derived mechanically.
- A deterministic Witness validator that rejects unknown IDs, unsupported decisions, hash mismatches, missing evidence, and invalid page/body states before rendering.
- A deterministic fallback that keeps the product useful and explicitly records why the model was not used.

## What makes it different

Wayback shows snapshots. Alexandria returns a place—with witnesses.

Its signature interaction is not generation; it is challengeability. A beautiful returned site can be toggled into an evidentiary view where every seam becomes visible. Alexandria's most important output may be what it refuses to claim: uncaptured paths, unresolved variants, conflicts, and missing assets supported only by surviving references.

## How we used Codex

Codex served as the build integrator across architecture, implementation, security hardening, release operations, deployment, and audit. Work was split into bounded archive, chronology, witness, reliability, deployment, and browser-QA tracks, then merged behind explicit phase gates. Production version 15 at audited runtime commit `f823db6aaba4251a54839f4aa3be6cc67dbac451` passes 87 tests, TypeScript, lint, a clean production build, eleven static/local release-contract checks, receipt validation, public browser regression, the hosted bare-address and font-alias boundary gates, the live submission proof, and a zero-vulnerability production dependency audit. The live CDX portion of the eight-scenario failure matrix is externally blocked because public Wayback CDX returned zero bytes or timed out; it is not counted as a passing v15 gate. Codex also localized and repaired real hosted regressions in requested-year discovery, model-decision provenance, receipt warning ownership, production font delivery, protocol reconciliation, exact replay identity, and synthetic-label provenance, then verified each correction through explicit phase gates.

## How GPT-5.6 is used

GPT-5.6 is the Chronologist, not the historian. Code mechanically selects the evidence window; GPT-5.6 makes two kinds of consequential judgment: one complete order of the returned preserved pages and one primary-witness selection for each returned page. The receipt records those accepted choices as GPT-attributed `page_order` and `primary_witness` decisions; supporting witnesses, navigation labels, citations, and era/absence decisions are derived mechanically. Code validates every returned identifier and citation. Historical text and images always come from hashed archive evidence blocks, never from model prose.

The [production iExile receipt](https://alexandria-here.cinemaexile.chatgpt.site/api/recover/18026989-33be-4011-86ee-19e1754cb22c/receipt) records `planner: "gpt-5.6"`, model `gpt-5.6-sol`, deterministic `era_selection`, GPT-5.6 `page_order` and `primary_witness` decisions, and 10 of 10 deterministic validations passing. Its returned site is [publicly inspectable](https://alexandria-here.cinemaexile.chatgpt.site/r/18026989-33be-4011-86ee-19e1754cb22c), and the [`JUDGE_EVIDENCE.md`](JUDGE_EVIDENCE.md) index states what each witness does and does not prove.

## Verified historical context: iExile

[Trish Hopkinson's June 19, 2026 editor interview](https://trishhopkinson.com/2026/06/19/no-fee-submission-call-editor-interview-iexile-deadline-always-open/) provides a third-party-published attribution that Jaia Papitz founded iExile in 2007. It is not independent corroboration of the interview statement, an Alexandria capture, a recovery witness, a receipt, or evidence for any hosted recovery metric.

## Hosted production evidence (separate from historical sourcing)

The ordinary hosted public pipeline recovered `http://www.9-11commission.gov/` into a coherent edition spanning April 13 through October 28, 2003:

- 8 manifest pages: 6 returned and 2 represented honestly as missing
- 154 preserved evidence blocks
- 24 witnessed internal-reference edges
- 8 known absences
- 10 of 10 deterministic receipt validations passing
- durable managed-D1 path: `/r/de5bb377-5b53-4ea4-b074-feb106e02113`

This earlier production proof remains persisted as an ordinary recovery row and directly accessible at the path above. The same public workflow can be rerun; archive-dependent captures and outcomes need not be identical. There is no fixture, seed route, or demo-only engine. The landing page now links the receipt-backed iExile recovery below.

The same production pipeline explicitly requested iExile's 2009 edition and returned [a witnessed recovery whose receipt attributes page ordering and primary-witness selection to GPT-5.6](https://alexandria-here.cinemaexile.chatgpt.site/r/18026989-33be-4011-86ee-19e1754cb22c) with 5 returned preserved pages plus 2 witnessed Missing states from 8 capture records, 347 rendered blocks, 946 content-addressed extracted evidence blocks, 36 inferred edges, 8 known absences, and all 10 deterministic receipt checks passing.

## Current build boundary

Production version 15 at audited runtime commit `f823db6aaba4251a54839f4aa3be6cc67dbac451` passes 87 tests. The accepted Sites record is saved version `appgprj_6a5b165146ec8191a6507491526ca6eb~appgver_56e85afb595c8191af9b0b7e48bdadda`, deployment `appgdep_6a5c784ec5f081919b04d5c5fefd9191`, environment revision 7. It retains requested-year discovery, durable per-client cooldown enforcement, sensitive-query rejection, truthful decision provenance, exact Wayback replay identity, non-fabricated fallback labels, additive legacy-receipt compatibility, and witnessed browser-only font aliases. It also accepts bare public addresses through the same safety boundary, queries both HTTP and HTTPS archive variants, merges and deduplicates their surviving witnesses, and keeps the exact 12-record inventory and 8-capture fetch budgets. The hosted production and live submission gates verified the form contract, pre-admission private-address rejection, exact font bytes, MIME, cache, `nosniff`, route markers, GET/HEAD/Range/ETag/304 behavior, lack of physical-path leakage, and the pinned durable judging receipt.

The judging recovery above was generated by proof-producing version 7 runtime `042215042dd46ded14b501f961f4d9e7debb8178`; current production Sites version 15 serves and audits that persisted row but did not generate its GPT-5.6 decisions. Supporting witnesses, navigation, citations, and decision records were derived mechanically before validation.

Historical compatibility release v8 used runtime commit `f7f8f529285ed9e01fdbe02e868833fc86de5475`; its ordinary schema/model probe is recovery `6e467987-af60-4153-8d27-7653f56475aa`. That probe completed as an honest `insufficient_evidence` result with a native 1.1 receipt, and current v15 preserves v8's non-mutating legacy-row compatibility behavior.

## Challenges

Archive evidence is messy: captures are incomplete, timestamps disagree, URLs drift, navigation points to uncaptured pages, and archived HTML must be treated as hostile. The hardest product decision was refusing to optimize for a visually complete fiction. We built mechanical invariants so unsupported content cannot render, then designed the missing material as a first-class, dignified outcome instead of an error state.

## Accomplishments

- General live recovery within strict, legible budgets.
- Stable Returned Site and five-panel Recovery Atlas.
- Block-level provenance and downloadable audit receipts containing manifest and evidence hashes.
- Honest insufficient-evidence and model-fallback outcomes.
- Archive-only network boundary and aggressive inert-data sanitization.
- Durable hosted recovery produced through the same path as every visitor.

## What we learned

Reliability is easier to trust when it is visible. “AI checks itself” is not a sufficient safety story; a constrained proposal followed by a mechanical evidence validator is. Missing evidence is also not merely a backend failure. When represented clearly, absence becomes meaningful archival information.

## What's next

Support multiple genuinely evidenced editions from the same recovery, conflict-aware cross-fragment entity resolution, more archive providers behind the same evidence contract, and institutional export workflows for libraries, educators, and community archivists.

## Audited 2:35 demo

The upload-ready master is `submission-assets/alexandria-here-build-week-demo.mp4`; its sidecar SHA-256 is `B2EA9AFC1967B0BA6CC0B06BFC2E628ABB09BD237D0145D5F9A84C4BB04583BA`. It is 2:35.26 at 1920×1080 with normalized 48 kHz narration, exact English WebVTT captions, and a real production interaction sequence from 0:19–0:59. The public repository packages the video, captions, YouTube thumbnail, description/chapters, a Devpost-preferred 1500×1000 3:2 cover, and six ordered 3:2 gallery cards. The sealed master was captured from [ordinary production row `8ea53a47-437b-4afe-ad2c-29c81637a327`](https://alexandria-here.cinemaexile.chatgpt.site/r/8ea53a47-437b-4afe-ad2c-29c81637a327) on version 6 runtime `f434249d673911bb5de89689313248b68a389b52` and sealed in commit `4755a6472b0ce7f22599a259ac55ae288bd9bae2`; the current judging proof is corrected row `18026989-33be-4011-86ee-19e1754cb22c`, generated by version 7 runtime `042215042dd46ded14b501f961f4d9e7debb8178` and now served by production Sites version 15.

**0:00–0:19 — The promise.** Introduce Alexandria as a witnessed restoration engine and iExile as the founder's real lost community.

**0:19–0:42 — The returned place.** Browse the live production Returned Site and one internal page.

**0:42–1:05 — Show the Seams.** Toggle block provenance, reveal markers, and open the Witness ledger.

**1:05–1:26 — Time and absence.** Show the Temporal Evidence Graph and Ghost Map.

**1:26–1:57 — Receipt and reliability.** Hold on GPT-5.6, model, hashes, blocks, known absences, and ten passing checks.

**1:57–2:27 — Codex and GPT-5.6.** Explain Codex's build-integrator role and GPT-5.6's constrained Chronologist contract.

**2:27–2:35 — Close.** “Alexandria Here returns a place—with witnesses.”

## Final submission checklist

- [x] Join the OpenAI Build Week challenge on Devpost.
- [ ] Jaia personally accepts the official-rules checkbox immediately before submission.
- [x] Select Education.
- [x] Confirm that the Sites deployment is publicly reachable without an authenticated session (`200 OK` verified July 17, 2026 Pacific / July 18 UTC).
- [x] Publish the public judging repository with setup instructions and reference details: https://github.com/jpart99/alexandria-here
- [x] Add the `/feedback` Codex Session ID (`019f7304-e394-7f11-ba64-26e415135ff6`).
- [x] Produce and link one receipt-attributed GPT-5.6 recovery.
- [x] Clean-build, package, deploy, and verify the requested-year discovery and decision-provenance fixes in production version 7.
- [x] Accept production Sites version 15 only after its hosted bare-address, font-alias/browser boundary, exact reference-recovery, and live submission gates passed.
- [x] Render and audit the public-video master at less than 3:00 with English audio explaining the product, Codex use, and GPT-5.6 integration.
- [ ] Upload the exact audited master as Public on YouTube, enable embedding, attach the English captions and custom thumbnail, and add the URL above.
- [ ] Verify signed-out public YouTube playback at 1080p with audible narration, captions, and embedding, then paste the same URL into Devpost.
- [x] Render and audit the Devpost-preferred 3:2 project thumbnail and six ordered 3:2 gallery cards.
- [x] Add the read-only `npm run qa:submission` preflight for sealed hashes, media roles, captions, required claims, and external-pending boundaries.
- [x] Add and run the read-only `npm run qa:submission:live` gate against the exact public judging row, receipt metrics, decision attribution, production Atlas, and selective font boundary.
- [ ] Upload the audited Devpost thumbnail and gallery media, then verify the public preview.
- [x] Replace every bracketed placeholder except the pending public YouTube URL.
- [x] Confirm the production URL, iExile reference recovery, receipt download, 320×800 layout, and zero console errors in the production browser audit.
- [ ] Submit before July 21, 2026 at 5:00 PM PDT (Pacific Time).
