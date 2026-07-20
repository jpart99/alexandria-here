# Final Build Week demo script

Status: final locally audited version 23 narration and visual sequence. Master SHA-256: `ED270F6902CFA3AB96C0081E204A62670161E2E392DD470388306C9D57B3CA37`. Runtime: 2:31.04 at 1920×1080, 30 fps, 4,531 frames. The film uses synthetic narration only; it contains no generated historical imagery or evidence.

## Exact narration

> Imagine if knowledge believed lost with the Library of Alexandria could be recovered—fragment by fragment, witness by witness. The web loses places more quietly, every day.
> Alexandria Here is a witnessed restoration engine for the lost web. Give it one public address. It inventories bounded Wayback evidence, finds a coherent surviving era, and returns a browsable place—without pretending the gaps were never there.
> This is iExile, founded by Jaia Papitz in 2007: a literary community returned from eight public captures spanning August through November 2009. Browse it normally. Then Show the Seams reveals the source, date, and content hash behind every returned block. Missing pages stay missing, with the surviving links that witness their absence.
> The Atlas makes the restoration challengeable. Timeline shows evidence windows. Witnesses exposes primary and alternate sources in groups of twenty-four. What Survived maps preserved rooms, inferred connections, and known absences. The receipt records 347 rendered blocks, 946 source hashes, and ten of ten passing validations.
> Alexandria is not an iExile demo. The same public pipeline returned this historic Mars Pathfinder mission site from eight captures across February through April 1999: seven preserved pages, one missing state, and twelve of twelve validations. Its 2001 window is inspected inside the same persisted recovery—no new archive query, no switched result. A missing path remains visible through cited surviving witnesses.
> GPT-5.6 is the Chronologist, not the historian. Deterministic code selects the evidence window. GPT-5.6 orders the preserved pages and chooses one supplied primary witness for each. Deterministic validation then rejects every unknown identifier, unsupported citation, or altered hash. The model interprets evidence structure. It never writes historical content.
> Codex integrated the architecture, archive retrieval, hostile-HTML handling, temporal reasoning, security, tests, deployment, and browser audits. The result is a shipped public product, not a staged fixture. A recovery can also fail honestly when connected evidence is insufficient.
> Alexandria does not generate the past. It reconciles surviving witnesses. The lost web, present again—without pretending the gaps were never there.

## Audited visual sequence

- `0:00–0:11` — Production invocation and the Library of Alexandria premise.
- `0:11–0:30` — The returned iExile site from production recovery [`18026989-33be-4011-86ee-19e1754cb22c`](https://alexandria-here.cinemaexile.chatgpt.site/r/18026989-33be-4011-86ee-19e1754cb22c).
- `0:30–0:41` — Real iExile browsing and Show the Seams interaction, head-trimmed only to remove the recorder's blank navigation frame.
- `0:41–1:10` — iExile seams and all four Atlas evidence views: Timeline, Witnesses, What Survived, and Receipt.
- `1:10–1:15` — Mars Pathfinder reveal from production recovery [`c6adb317-ee2f-4530-9298-e9eb5fe6efd2`](https://alexandria-here.cinemaexile.chatgpt.site/r/c6adb317-ee2f-4530-9298-e9eb5fe6efd2).
- `1:15–2:02` — Real persisted Pathfinder interaction through the Returned Site and Atlas, with no new recovery request.
- `2:02–2:20` — Cited title seam, known absence, Ghost Map, supported 2001 edition, Witnesses, and mechanical Receipt.
- `2:20–2:31` — Closing invocation and evidence-only promise.

## Audit facts

- Narration: Microsoft Edge TTS `en-US-EmmaMultilingualNeural`, rate `+5%`; synthetic narration is disclosed.
- Audio: mono 48 kHz, normalized to −16.01 LUFS with −1.50 dBTP true peak.
- Captions: 56 non-overlapping English WebVTT cues, first cue at 0:00.083, last cue at 2:29.238; transcript parity passed.
- Capture: public production version 23, no `/api/recover` POST, no recovery created, no browser console errors, and both expected recovery IDs retained.
- Composition: 4,531 frames, hard cuts, full decode passed, embedded-caption transcript parity passed.
- Historical-media rule: every shown historical block, image, absence, and receipt field comes from persisted production evidence. No generated historical imagery or evidence appears in the film.

Run `npm run qa:media` to verify the sealed staging package, then `npm run qa:submission` after the canonical `submission-assets/` replacement is complete.
