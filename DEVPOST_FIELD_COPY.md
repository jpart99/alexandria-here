# Devpost field copy package

This file is the exact field-aligned source for the authenticated OpenAI Build Week draft. Copy only the contents beneath the matching field heading. Do not copy this preface or the saved-field reference into Devpost.

## About the project

## Inspiration

I founded **iExile.com** in 2007 around anthropology and the greater good. That experience left me with a lasting conviction: online communities are not disposable software artifacts. They are cultural records—places where people gathered, learned, mourned, organized, and made meaning together.

But the web loses places, not just pages. Community archives, memorials, independent publications, classrooms, cultural projects, forums, and institutional sites disappear into partial captures. Snapshot tools show isolated moments, while generative systems are tempted to smooth over missing material. Alexandria Here asks a stricter question: can a vanished site be returned as a coherent place while making every surviving witness, structural inference, conflict, and absence inspectable?

> Alexandria does not generate the past. It reconciles its surviving witnesses.

**iExile is one witnessed production proof, not Alexandria's product boundary. Alexandria's product is the lost public web wherever surviving witnesses exist.** One submitted address bounds the evidence for a challengeable recovery; it does not bound the product to one site, founder story, subject, era, or culture.

## What it does

Give Alexandria one vanished public address. It inventories bounded public Wayback evidence, mechanically ranks coherent historical windows, extracts inert evidence blocks, builds a Temporal Evidence Graph, and returns a browsable site when the surviving evidence is connected enough.

Every returned block can reveal its witness in **Show the Seams**. The **Ghost Map** shows preserved pages, reconstructed structure, and referenced-but-uncaptured absences. The **Recovery Receipt** records source IDs, hashes, archive timestamps, model and schema versions, accepted decisions, warnings, and deterministic validation results.

When the evidence is insufficient, Alexandria does not fabricate a site. It returns a complete Atlas explaining what survived, what is known to be absent, and why it refused to claim more.

## How we built it

Alexandria is a TypeScript application built with Vinext and the Next App Router for a Cloudflare Worker-compatible runtime, with managed D1 persistence and streamed, persisted recovery stages. The engine:

1. Safely normalizes a public HTTP(S) locator or bare hostname/path and never fetches the submitted live origin.
2. Queries only the allowlisted `web.archive.org` provider.
3. Considers at most 12 inventory records and fetches at most 8 archived HTML captures.
4. Treats archived HTML as hostile, inert data and strips scripts, forms, embeds, event handlers, and unsafe protocols.
5. Extracts exact evidence blocks and hashes them with SHA-256.
6. Builds a Temporal Evidence Graph containing captures, pages, URL variants, references, conflicts, and known absences.
7. Mechanically ranks coherent eras before any model output.
8. Uses a constrained GPT-5.6 Chronologist through the Responses API with strict Zod structured output.
9. Deterministically validates every model-returned ID, citation, hash, page state, and decision before rendering.
10. Persists either a returned site or an honest insufficient-evidence result.
11. Enforces a durable, privacy-preserving per-client cooldown before any paid model call.

GPT-5.6 is the Chronologist, not the historian. It receives a prevalidated evidence packet—not the open web—and makes exactly two kinds of consequential judgment: a complete order of the returned preserved pages and one supplied primary witness for each returned page. Supporting witnesses, navigation labels, citations, era selection, and absence records are constructed mechanically. The model cannot browse, invent historical prose, override the selected era, or introduce unknown IDs.

> The model proposes a historical reading. The evidence system decides what may be returned.

If the model provider is unavailable, Alexandria records the reason and falls back to its deterministic planner. It never substitutes generated historical content.

## What makes it different

Wayback shows snapshots. Alexandria returns a place—with witnesses.

Alexandria calls this the **Papyrus Principle**: when the page is gone, its neighbors become witnesses. In the current release, those neighbors are bounded same-site archive records and their surviving internal references. Direct captures may supply exact body blocks; linked evidence may support only structure or known absence; unwitnessed material remains missing.

Alexandria is content-neutral memory infrastructure. It does not decide which ideas deserve preservation, and it has no topic or viewpoint moderation layer. Network controls protect systems, not sensibilities; evidence validation protects provenance, not people from ideas. Preservation is not endorsement.

## Challenges

Archive evidence is messy: captures are incomplete, timestamps disagree, URLs drift, navigation points to uncaptured pages, and archived markup must be treated as untrusted executable input. The hardest product decision was refusing to optimize for a visually complete fiction. We built mechanical invariants so unsupported content cannot render, then designed missing material as a first-class, dignified result instead of an error void.

The release audit also found and repaired real streaming and cancellation races, stale-result compatibility failures, unsafe receipt behavior, mobile overflow, query-bearing identity collisions, and a producer/reader disagreement that made an otherwise complete production recovery unreadable. Each correction was closed behind adversarial tests and public runtime proof.

## Accomplishments

- General live recovery within strict, legible evidence budgets.
- A stable Returned Site and five-panel Recovery Atlas.
- Block-level provenance and downloadable content-addressed receipts.
- Honest insufficient-evidence and model-fallback outcomes.
- An archive-only network boundary and aggressive inert-data sanitization.
- A durable hosted judging recovery produced through the same public path as every visitor.
- Production version 19 at audited runtime commit `88a4dce91b42a3fcc1d2adf9710de6bea651dfc4`: 96 passing tests, clean TypeScript and lint, a full compiled failure matrix, public desktop/mobile browser audits, and zero production dependency vulnerabilities.

The ordinary pipeline returned a receipt-proven 2009 iExile edition with 5 preserved pages plus 2 witnessed Missing states from 8 capture records, 347 rendered blocks, 946 content-addressed evidence blocks, 36 inferred edges, 8 known absences, and all 10 deterministic validations passing. Its receipt records planner `gpt-5.6` and model `gpt-5.6-sol`:

https://alexandria-here.cinemaexile.chatgpt.site/r/18026989-33be-4011-86ee-19e1754cb22c

https://alexandria-here.cinemaexile.chatgpt.site/api/recover/18026989-33be-4011-86ee-19e1754cb22c/receipt

The judging recovery above was generated by proof-producing version 7 runtime `042215042dd46ded14b501f961f4d9e7debb8178`; current production Sites version 19 serves and audits that persisted receipt 1.0 row but did not generate its GPT-5.6 decisions.

## What we learned

Reliability is easier to trust when it is visible. “AI checks itself” is not a sufficient reliability story; a constrained proposal followed by a mechanical evidence validator is. Missing evidence is also not merely a backend failure. When represented clearly, absence becomes meaningful archival information.

## What's next

Support multiple genuinely evidenced editions from the same recovery, conflict-aware cross-fragment entity resolution, additional archive providers behind the same evidence contract, and institutional export workflows for libraries, educators, anthropologists, and community archivists.

**The lost web, present again—without pretending the gaps were never there.**

## Test instructions for judges

Live product (public; no login): https://alexandria-here.cinemaexile.chatgpt.site

Open the exact persisted judging recovery at https://alexandria-here.cinemaexile.chatgpt.site/r/18026989-33be-4011-86ee-19e1754cb22c and its mechanical receipt at https://alexandria-here.cinemaexile.chatgpt.site/api/recover/18026989-33be-4011-86ee-19e1754cb22c/receipt. The receipt records planner `gpt-5.6`, model `gpt-5.6-sol`, GPT-attributed page ordering and primary-witness choices, and 10 of 10 deterministic validations. Test Returned Site, Timeline, What Survived, Witnesses, Receipt, Show the Seams, and receipt download.

The sealed video displays earlier ordinary production row https://alexandria-here.cinemaexile.chatgpt.site/r/8ea53a47-437b-4afe-ad2c-29c81637a327; that URL is video-capture provenance, not the current decision-attribution judging proof.

You may also enter any vanished public address. Every run uses the same archive-only bounded pipeline and may fail honestly when connected evidence is insufficient. iExile is one witnessed production proof, not Alexandria's product boundary. Alexandria's product is the lost public web wherever surviving witnesses exist.

## Saved-field reference

- Project name: `Alexandria Here`
- Elevator pitch: `A witnessed restoration engine that returns a vanished website as a coherent place—and exposes every source, inference, conflict, and absence.`
- Built with: `typescript,react,next.js,vinext,cloudflare-workers,d1,drizzle-orm,openai-responses-api,gpt-5.6,zod,cheerio,web-crypto,codex,openai-sites`
- Try it out: `https://alexandria-here.cinemaexile.chatgpt.site`
- Submitter type: `Individual`
- Country: `United States`
- Category: `Education`
- Repository: `https://github.com/jpart99/alexandria-here`
- Primary Codex Session ID: `019f7304-e394-7f11-ba64-26e415135ff6`
