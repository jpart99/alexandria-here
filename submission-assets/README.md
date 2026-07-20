# Final submission assets

This directory is the integrity-pinned version 23 publication package. The application and dual-example presentation sequence are locked; YouTube publication and Devpost synchronization are separate external gates.

## Production screenshots

- `00-landing.png` — production invocation at 1920×1080.
- `01-returned-site.png` — persisted iExile Returned Site.
- `02-show-the-seams.png` — iExile block-level provenance overlay.
- `03-timeline-focused.png` — iExile persisted Timeline.
- `04-witnesses-focused.png` — iExile primary and alternate Witnesses.
- `05-what-survived-focused.png` — iExile Ghost Map / What Survived.
- `06-receipt-focused.png` — iExile mechanical Recovery Receipt.

## Publication images

- `07-youtube-thumbnail.png` — 1280×720 RGB final thumbnail; iExile and Mars Pathfinder share the frame.
- `08-devpost-cover.png` — 1500×1000 RGB final 3:2 cover.
- `09-devpost-gallery-iexile-returned.png` — iExile Returned Site.
- `10-devpost-gallery-iexile-seams.png` — iExile Show the Seams.
- `11-devpost-gallery-pathfinder-returned.png` — Mars Pathfinder Returned Site.
- `12-devpost-gallery-pathfinder-timeline.png` — supported Pathfinder Timeline edition.
- `13-devpost-gallery-pathfinder-absence.png` — cited Missing state and Ghost Map.
- `14-devpost-gallery-witness-receipt.png` — Witnesses and mechanical Receipt.
- `devpost-media.sha256` — exact hashes for the cover and six ordered gallery cards.

## Film, captions, and provenance

- `alexandria-here-build-week-demo.mp4` — final 2:31.04 master, 1920×1080 at 30 fps (4,531 frames), H.264/AAC, normalized 48 kHz mono synthetic narration, embedded English captions, and full-decode pass.
- `alexandria-here-build-week-demo.sha256` — checksum for the exact final master.
- `alexandria-here-build-week-demo.en.vtt` — 56 non-overlapping English cues, ending at 2:29.238.
- `narration.txt` — exact narration transcript.
- `capture-manifest-v23.json` — hashes, public runtime identity, capture assertions, and both live proof identities.
- `narration-audit-v23.json` — voice disclosure, audio format, loudness, cue, transcript-parity, and decode results.
- `final-composition-plan-v23.json` — exact frame allocation, source trims, inputs, output seal, and embedded-caption parity.
- `source-captures-v23/` — eight integrity-pinned browser captures used to reproduce the final publication artwork with `scripts/render-submission-covers.py`.

The master SHA-256 is `ED270F6902CFA3AB96C0081E204A62670161E2E392DD470388306C9D57B3CA37`. Its two live examples are ordinary persisted production recoveries: iExile `18026989-33be-4011-86ee-19e1754cb22c` and Mars Pathfinder `c6adb317-ee2f-4530-9298-e9eb5fe6efd2`. Capture created no recovery and made no `/api/recover` POST.

The film uses synthetic narration only. It contains no generated historical imagery or evidence.

Run `npm run qa:media` to verify this tracked, clone-portable final package and `npm run qa:submission` to verify the canonical upload assets, provenance records, role names, byte counts, hashes, geometry, captions, narration parity, documentation, and external authority gates.

The optional artwork renderer requires Python, Pillow, and the pinned Windows typography available at the paths it validates. That platform-specific rerendering dependency is separate from the clone-portable Node audits of the already sealed publication bytes.
