# OpenAI Build Week submission draft

Status: authenticated Devpost version 20 About and judge instructions, project thumbnail, six-image gallery, and public YouTube video are synchronized and Preview-verified. Rules acceptance and final submission remain pending.

## Project

**Alexandria Here — a witnessed restoration engine for the lost web**

Recommended track: **Education**

Tagline: **The lost web, present again—without pretending the gaps were never there.**

Live product: https://alexandria-here.cinemaexile.chatgpt.site

Code repository: https://github.com/jpart99/alexandria-here

Demo video: https://youtu.be/z1FJLdJS93o

Codex Session ID: `019f7304-e394-7f11-ba64-26e415135ff6`

## Inspiration

The web loses places, not just pages: community archives, memorials, independent publications, classrooms, and cultural projects disappear into partial captures. Snapshot tools can show individual moments, while generative systems are tempted to smooth over missing material. Alexandria Here asks a stricter question: can a vanished site be returned as a coherent place while making every surviving witness, structural inference, conflict, and absence inspectable?

## What it does

Give Alexandria one vanished public URL. It ranks at most three bounded public Wayback evidence windows. Without a requested year, code selects the highest-ranked candidate; a supported requested year is selected mechanically from those candidates before model output. Alexandria then extracts inert evidence blocks, builds a Temporal Evidence Graph, and returns a browsable site when the surviving evidence is connected enough.

Every returned block can reveal its witness in **Show the Seams**. The **Ghost Map** shows preserved pages, reconstructed structure, and referenced-but-uncaptured absences. The **Recovery Receipt** records source IDs, hashes, archive timestamps, model/schema versions, decisions, warnings, and deterministic validation results.

When the evidence is insufficient, Alexandria does not fabricate a site. It returns a complete Atlas explaining what survived and where the surviving record ends.

**iExile is one witnessed production proof, not Alexandria's product boundary. Alexandria's product is the lost public web wherever surviving witnesses exist.** The same ordinary engine is designed for vanished sites, pages, forums, journals, institutions, communities, and other public web places. One address bounds the evidence for a run; it does not bound the concept.

Alexandria is content-neutral memory infrastructure. It has no topic or viewpoint moderation layer and does not decide which ideas deserve preservation. Politically, culturally, or personally contentious material receives the same evidence contract as any other archive record. Network controls protect systems, not sensibilities; evidence validation protects provenance, not people from ideas. Preservation is not endorsement.

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

Alexandria calls this the **Papyrus Principle**: when the page is gone, its neighbors become witnesses. In the current release, those neighbors are bounded same-site archive records and their surviving internal references: direct captures may supply exact body blocks, while linked evidence may support only structure or known absence; unwitnessed material remains missing.

Its signature interaction is not generation; it is challengeability. A beautiful returned site can be toggled into an evidentiary view where every seam becomes visible. Alexandria's most important output may be where the record breaks: uncaptured paths, unresolved variants, conflicts, and missing assets supported only by surviving references.

## How we used Codex

Codex served as the build integrator across architecture, implementation, security hardening, release operations, deployment, and audit. Work was split into bounded archive, chronology, witness, reliability, deployment, and browser-QA tracks, then merged behind explicit phase gates. Production version 20 at audited runtime commit `6c7d8df04db7c9b4ac56b05e61b367f1b025d529` passes 99 tests, TypeScript, lint, a clean production build, fourteen static/local release-contract checks, receipt validation, public browser regression, the hosted content-neutral/query-bearing URL and font-alias boundary gates, malformed-ID rejection before D1, private no-store recovery 404s, the live submission proof, and a zero-vulnerability production dependency audit. Production version 20 passed the full eight-boundary compiled failure matrix. Codex also localized and repaired real hosted regressions in requested-year discovery, model-decision provenance, receipt warning ownership, production font delivery, protocol reconciliation, exact replay identity, synthetic-label provenance, query-bearing identity, legacy-receipt temporal replay, persisted query-title hydration, streamed request admission, media-type validation, and recovery-read boundaries, then verified each correction through explicit phase gates.

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

Production version 20 at audited runtime commit `6c7d8df04db7c9b4ac56b05e61b367f1b025d529` passes 99 tests. The accepted Sites record is saved version `appgprj_6a5b165146ec8191a6507491526ca6eb~appgver_e0e0becb32ec8191aaec526418590d31`, deployment `appgdep_6a5d33a6af448191ab4ba6a7eeaf0b63`, environment revision 7. It retains requested-year discovery, durable per-client cooldown enforcement, truthful decision provenance, exact Wayback replay identity, non-fabricated fallback labels, permanent legacy-receipt compatibility, witnessed browser-only font aliases, bounded streamed-body admission, exact JSON/HTML media-type checks, malformed-ID rejection before D1, private no-store recovery 404s, and branded fail-closed persisted-result boundaries. It accepts bare, query-bearing, and archived `.onion` HTTP(S) locators through the same content-neutral safety boundary; it never contacts the submitted origin. For a query-bearing locator, discovery inventories the exact query plus the query-cleared sibling path across HTTP and HTTPS variants, merges and deduplicates surviving witnesses, and keeps the exact 12-record inventory and 8-capture fetch budgets. Receipt `1.3` gives that query-bearing identity an opaque full-SHA-256 route; receipts `1.0`–`1.2` permanently retain pathname-only relationship and replay semantics. The hosted production and live submission gates verified those contracts, pre-admission private-address rejection, exact font bytes, MIME, cache, `nosniff`, route markers, GET/HEAD/Range/ETag/304 behavior, lack of physical-path leakage, and the pinned durable judging receipt.

Historical Sites release v19 used runtime commit `88a4dce91b42a3fcc1d2adf9710de6bea651dfc4`, saved version `appgprj_6a5b165146ec8191a6507491526ca6eb~appgver_d92c137f12788191bf5e69709b3809df`, deployment `appgdep_6a5ccae8dcf48191b85e5a80613dc594`, and environment revision 7; its source gate passed 96 tests.

Historical Sites release v18 used runtime commit `174e05a38d5a49a17d5d116cb79f8a3c53963286`, saved version `appgprj_6a5b165146ec8191a6507491526ca6eb~appgver_29be18fd06788191b4499c75b4bdabad`, deployment `appgdep_6a5caab525508191ac8eb45c0b3e7fae`, and environment revision 7; its source gate passed 93 tests.

Production version 18 restored ordinary production recovery `52a87f55-914f-4f17-a2b3-40021351f442` to HTTP 200 without rewriting its receipt 1.3 manifest or relabeling its `insufficient_evidence` outcome. That row was created through the ordinary production form on v17 and retains its original content-addressed manifest; v18 narrowly accepts the exact historical Missing-root title shape and derives the visitor-facing title only from visible witnessed pages. Fresh ordinary production recovery `ec9ab849-611a-4644-86d9-2ef82de1c61e` then completed, hydrated, and rendered at HTTP 200 with its Missing root retained, receipt `1.3`, planner `gpt-5.6`, model `gpt-5.6-sol`, and manifest hash `c615fc3375be9a0d7c10e8fd3753fc9f29701d54f7901ccfd5db94a867f4ec3c`. It is historical v18 producer evidence, not a replacement or relabeling of the judging row above.

Historical Sites release v16 used runtime commit `d32ab887e880d7f3d4bbf1c9d71e0aec37388a43`, saved version `appgprj_6a5b165146ec8191a6507491526ca6eb~appgver_76f67dace6088191b2b415d5e4b1d17b`, deployment `appgdep_6a5c90b3020c81919c73b5a84e39580e`, and environment revision 7; its source gate passed 91 tests. The exact final version 16 failure-matrix rerun was externally blocked because public Wayback CDX returned zero bytes or timed out; no timeout was relaxed.

Historical Sites release v17 used runtime commit `c7112dbf9edde6531b02f1e6e3547667fa6f8003`, saved version `appgprj_6a5b165146ec8191a6507491526ca6eb~appgver_a32fbc5b2a0481919cede26452bc7033`, deployment `appgdep_6a5ca4a4cc788191924a28d69120d106`, and environment revision 7. It shipped the invocation-first landing and Recovery Atlas treatment before the ordinary iExile submission exposed the persisted-title compatibility defect.

The judging recovery above was generated by proof-producing version 7 runtime `042215042dd46ded14b501f961f4d9e7debb8178`; current production Sites version 20 serves and audits that persisted receipt 1.0 row but did not generate its GPT-5.6 decisions. Supporting witnesses, navigation, citations, and decision records were derived mechanically before validation.

Historical compatibility release v8 used runtime commit `f7f8f529285ed9e01fdbe02e868833fc86de5475`; its ordinary schema/model probe is recovery `6e467987-af60-4153-8d27-7653f56475aa`. That probe completed as an honest `insufficient_evidence` result with a native 1.1 receipt, and current v20 preserves v8's non-mutating legacy-row compatibility behavior, including pathname-only relationship and temporal-replay identity for every receipt from `1.0` through `1.2`.

## Challenges

Archive evidence is messy: captures are incomplete, timestamps disagree, URLs drift, navigation points to uncaptured pages, and archived markup must be treated as untrusted executable input. The hardest product decision was showing visible gaps instead of optimizing for synthetic completeness. We built mechanical invariants so every returned block keeps its witness, then designed missing material as a first-class, inspectable evidence outcome instead of an error state.

## Accomplishments

- General live recovery within strict, legible budgets.
- Stable Returned Site and five-panel Recovery Atlas.
- Block-level provenance and downloadable audit receipts containing manifest and evidence hashes.
- Honest insufficient-evidence and model-fallback outcomes.
- Archive-only network boundary and aggressive inert-data sanitization.
- Durable hosted recovery produced through the same path as every visitor.

## What we learned

Reliability is easier to trust when it is visible. “AI checks itself” is not a sufficient reliability mechanism; a constrained proposal followed by a mechanical evidence validator is. Missing evidence is also not merely a backend failure. When represented clearly, absence becomes meaningful archival information.

## What's next

Support multiple genuinely evidenced editions from the same recovery, conflict-aware cross-fragment entity resolution, more archive providers behind the same evidence contract, and institutional export workflows for libraries, educators, and community archivists.

## Audited 2:35 demo

The upload-ready master is `submission-assets/alexandria-here-build-week-demo.mp4`; its sidecar SHA-256 is `B2EA9AFC1967B0BA6CC0B06BFC2E628ABB09BD237D0145D5F9A84C4BB04583BA`. It is 2:35.26 at 1920×1080 with normalized 48 kHz narration, exact English WebVTT captions, and a real production interaction sequence from 0:19–0:59. The public repository packages the video, captions, YouTube thumbnail, description/chapters, a Devpost-preferred 1500×1000 3:2 cover, and six ordered 3:2 gallery cards. The sealed master was captured from [ordinary production row `8ea53a47-437b-4afe-ad2c-29c81637a327`](https://alexandria-here.cinemaexile.chatgpt.site/r/8ea53a47-437b-4afe-ad2c-29c81637a327) on version 6 runtime `f434249d673911bb5de89689313248b68a389b52` and sealed in commit `4755a6472b0ce7f22599a259ac55ae288bd9bae2`; the current judging proof is corrected receipt 1.0 row `18026989-33be-4011-86ee-19e1754cb22c`, generated by version 7 runtime `042215042dd46ded14b501f961f4d9e7debb8178` and now served by production Sites version 20. The historical video-capture row now fails closed under version 20's stricter witness validation; its machine receipt is unavailable.

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
- [x] Accept production Sites version 18 only after its hosted content-neutral/query-bearing URL, font-alias/browser boundary, exact reference-recovery, persisted iExile rescue, and live submission gates passed.
- [x] Accept production Sites version 20 only after its 99-test source gate, compiled matrix, hosted/live proof gates, malformed-ID/no-store read boundary, exact MIME boundary, and streamed request-body admission passed.
- [x] Render and audit the public-video master at less than 3:00 with English audio explaining the product, Codex use, and GPT-5.6 integration.
- [x] Upload the exact audited master as Public on YouTube, enable embedding, attach the English captions, add the URL above, and record the account-level thumbnail state.
- [x] Verify the unauthenticated public YouTube page exposes 1080p, audio, captions, and embedding, then paste the same URL into Devpost and verify its embedded player.
- [x] Render and audit the Devpost-preferred 3:2 project thumbnail and six ordered 3:2 gallery cards.
- [x] Add the read-only `npm run qa:submission` preflight for sealed hashes, media roles, captions, required claims, and external-pending boundaries.
- [x] Add and run the read-only `npm run qa:submission:live` gate against the exact public judging row, receipt metrics, decision attribution, production Atlas, and selective font boundary.
- [x] Replace the saved Devpost About and judge instructions with the version 20 `DEVPOST_FIELD_COPY.md`, save, then verify Preview shows `99 passing tests` and the current judging recovery.
- [x] Upload the audited Devpost thumbnail and gallery media, then verify the public preview.
- [x] Replace every bracketed placeholder.
- [x] Confirm the production URL, iExile reference recovery, receipt download, 320×800 layout, and zero console errors in the production browser audit.
- [ ] Submit before July 21, 2026 at 5:00 PM PDT (Pacific Time).
