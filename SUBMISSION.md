# OpenAI Build Week submission draft

Status: copy-ready draft. Public access, repository, track, `/feedback` Session ID, and receipt-proven GPT-5.6 run are confirmed. Do not submit until the public video URL is added and Jaia personally accepts the official-rules checkbox.

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

Give Alexandria one vanished public URL. It inventories a bounded set of public Wayback captures, selects the strongest coherent historical window, extracts inert evidence blocks, builds a Temporal Evidence Graph, and returns a browsable site when the surviving evidence is connected enough.

Every returned block can reveal its witness in **Show the Seams**. The **Ghost Map** shows preserved pages, reconstructed structure, and referenced-but-uncaptured absences. The **Recovery Receipt** records source IDs, hashes, archive timestamps, model/schema versions, decisions, warnings, and deterministic validation results.

When the evidence is insufficient, Alexandria does not fabricate a site. It returns a complete Atlas explaining what survived and why it refused to claim more.

## How we built it

- TypeScript with Vinext/Next App Router on a Cloudflare Worker-compatible runtime.
- Managed D1 persistence with streamed, persisted recovery stages.
- One archive provider, strict URL validation, redirect revalidation, MIME/size/time budgets, and no submitted-origin fetch.
- Cheerio extraction that treats archived HTML as hostile inert data and strips scripts, forms, embeds, event handlers, and unsafe protocols.
- Content-addressed evidence blocks using SHA-256.
- A deterministic temporal score that rewards page coverage and link density while penalizing date spread, conflicts, and duplicate captures.
- A constrained GPT-5.6 Chronologist using the Responses API and strict Zod structured output. From a bounded evidence packet, it may return only a complete visible-page order and one supplied primary record ID per page. It cannot browse, choose rendered blocks or supporting sources, or create historical content; those structures are derived mechanically.
- A deterministic Witness validator that rejects unknown IDs, unsupported decisions, hash mismatches, missing evidence, and invalid page/body states before rendering.
- A deterministic fallback that keeps the product useful and explicitly records why the model was not used.

## What makes it different

Wayback shows snapshots. Alexandria returns a place—with witnesses.

Its signature interaction is not generation; it is challengeability. A beautiful returned site can be toggled into an evidentiary view where every seam becomes visible. Alexandria's most important output may be what it refuses to claim: uncaptured paths, unresolved variants, conflicts, and missing assets supported only by surviving references.

## How we used Codex

Codex served as the build integrator across architecture, implementation, security hardening, release operations, deployment, and audit. Work was split into bounded archive, chronology, witness, reliability, deployment, and browser-QA tracks, then merged behind explicit phase gates. Production version 6 at commit `f434249d673911bb5de89689313248b68a389b52` passes 36 tests, TypeScript, lint, a clean production build, ten release-contract checks, a seven-scenario failure matrix, receipt validation, public browser regression, and a zero-vulnerability production dependency audit. Codex also localized and repaired real hosted regressions in requested-year discovery and model-output contracts, then proved each correction through the ordinary public recovery endpoint.

## How GPT-5.6 is used

GPT-5.6 is the Chronologist, not the historian. Code mechanically selects the evidence window; GPT-5.6 makes exactly two consequential judgments inside that boundary: a complete page order and one primary witness per visible page. Supporting witnesses, navigation labels and citations, and receipt decisions are constructed mechanically from those accepted choices. Code validates every returned identifier and citation. Historical text and images always come from hashed archive evidence blocks, never from model prose.

The [production iExile receipt](https://alexandria-here.cinemaexile.chatgpt.site/api/recover/8ea53a47-437b-4afe-ad2c-29c81637a327/receipt) records `planner: "gpt-5.6"`, model `gpt-5.6-sol`, and 10 of 10 deterministic validations passing. Its returned site is [publicly inspectable](https://alexandria-here.cinemaexile.chatgpt.site/r/8ea53a47-437b-4afe-ad2c-29c81637a327).

## Verified historical context: iExile

[Trish Hopkinson's June 19, 2026 editor interview](https://trishhopkinson.com/2026/06/19/no-fee-submission-call-editor-interview-iexile-deadline-always-open/) identifies Jaia Papitz as iExile's founder and records that iExile was founded in 2007. This independent source establishes founder/year context only. It is not an Alexandria capture, recovery witness, receipt, or evidence for any hosted recovery metric.

## Hosted production evidence (separate from historical sourcing)

The ordinary hosted public pipeline recovered `http://www.9-11commission.gov/` into a coherent edition spanning April 13 through October 28, 2003:

- 8 manifest pages: 6 returned and 2 represented honestly as missing
- 154 preserved evidence blocks
- 24 witnessed internal-reference edges
- 8 known absences
- 10 of 10 deterministic receipt validations passing
- durable managed-D1 path: `/r/de5bb377-5b53-4ea4-b074-feb106e02113`

This earlier production proof remains persisted as an ordinary recovery row and directly accessible at the path above. It can be reproduced through the same public endpoint; there is no fixture, seed route, or demo-only engine. The landing page now links the receipt-proven iExile recovery below.

The same production pipeline explicitly requested iExile's 2009 edition and returned [a GPT-5.6-planned witnessed recovery](https://alexandria-here.cinemaexile.chatgpt.site/r/8ea53a47-437b-4afe-ad2c-29c81637a327) with 5 returned pages from 8 capture records, 347 rendered blocks, 946 content-addressed source blocks, 36 inferred edges, 8 known absences, and all 10 deterministic receipt checks passing.

## Current build boundary

Production version 6 runs runtime commit `f434249d673911bb5de89689313248b68a389b52`. It retains the requested-year CDX discovery correction, adds durable per-client cooldown enforcement and sensitive-query rejection, and constrains GPT-5.6 to a complete visible-page order plus one primary witness per page. Supporting witnesses, navigation, citations, and receipt decisions are derived mechanically before validation. The deployed release is proven by the ordinary hosted 2007 and 2009 iExile recoveries and the receipt-linked GPT-5.6 run above.

## Challenges

Archive evidence is messy: captures are incomplete, timestamps disagree, URLs drift, navigation points to uncaptured pages, and archived HTML must be treated as hostile. The hardest product decision was refusing to optimize for a visually complete fiction. We built mechanical invariants so unsupported content cannot render, then designed the missing material as a first-class, dignified outcome instead of an error state.

## Accomplishments

- General live recovery within strict, legible budgets.
- Stable Returned Site and five-panel Recovery Atlas.
- Block-level provenance and downloadable content-addressed receipts.
- Honest insufficient-evidence and model-fallback outcomes.
- Archive-only network boundary and aggressive inert-data sanitization.
- Durable hosted recovery produced through the same path as every visitor.

## What we learned

Reliability is easier to trust when it is visible. “AI checks itself” is not a sufficient safety story; a constrained proposal followed by a mechanical evidence validator is. Missing evidence is also not merely a backend failure. When represented clearly, absence becomes meaningful archival information.

## What's next

Support multiple genuinely evidenced editions from the same recovery, conflict-aware cross-fragment entity resolution, more archive providers behind the same evidence contract, and institutional export workflows for libraries, educators, and community archivists.

## Audited 2:35 demo

The upload-ready master is `submission-assets/alexandria-here-build-week-demo.mp4`; its sidecar SHA-256 is `B2EA9AFC1967B0BA6CC0B06BFC2E628ABB09BD237D0145D5F9A84C4BB04583BA`. It is 2:35.26 at 1920×1080 with normalized 48 kHz narration, exact English WebVTT captions, and a real production interaction sequence from 0:19–0:59. The public repository packages the video, captions, YouTube thumbnail, description/chapters, a Devpost-preferred 1500×1000 3:2 cover, and six ordered 3:2 gallery cards; the audited video master was sealed in commit `4755a6472b0ce7f22599a259ac55ae288bd9bae2`, while the deployed runtime remains production version 6 commit `f434249d673911bb5de89689313248b68a389b52`.

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
- [x] Produce and link one receipt-proven GPT-5.6 recovery.
- [x] Clean-build, package, deploy, and verify the requested-year discovery and model-contract fixes in production version 6.
- [x] Render and audit the public-video master at less than 3:00 with English audio explaining the product, Codex use, and GPT-5.6 integration.
- [ ] Upload the exact audited master as Public on YouTube, enable embedding, attach the English captions and custom thumbnail, and add the URL above.
- [x] Render and audit the Devpost-preferred 3:2 project thumbnail and six ordered 3:2 gallery cards.
- [ ] Upload the audited Devpost thumbnail and gallery media, then verify the public preview.
- [x] Replace every bracketed placeholder except the pending public YouTube URL.
- [x] Confirm the production URL, iExile reference recovery, receipt download, 320×800 layout, and zero console errors in the production browser audit.
- [ ] Submit before July 21, 2026 at 5:00 PM PDT (Pacific Time).
