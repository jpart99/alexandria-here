# Alexandria Here — final submission handoff

The application and the final local media package are locked. The final dual-example version 23 media package is locally audited and integrity-pinned; public YouTube publication and Devpost synchronization remain pending. Jaia's official-rules acceptance and final submission must follow those gates.

Immediately before publication, run `npm run qa:media`. After the final files are installed in `submission-assets/`, run `npm run qa:submission`. Both commands are read-only and use no network or secrets. `npm run qa:submission -- --final` refuses every remaining `PENDING` gate.

## 1. Final YouTube package — publication pending

- Final public URL: **[ADD FINAL PUBLIC YOUTUBE URL — UNDER 3 MINUTES]**
- Historical public URL: https://youtu.be/z1FJLdJS93o
- Channel: **Julian A** (`@JulianA-r6o8b`)
- Video: `submission-assets/alexandria-here-build-week-demo.mp4`
- SHA-256: `ED270F6902CFA3AB96C0081E204A62670161E2E392DD470388306C9D57B3CA37`
- Thumbnail: `submission-assets/07-youtube-thumbnail.png`
- Captions: `submission-assets/alexandria-here-build-week-demo.en.vtt`
- Title, description, chapters, disclosure, and settings: `YOUTUBE_METADATA.md`

The final master is 2:31.04 at 1920×1080 and 30 fps (4531 frames), with 56 exact English caption cues ending at 2:29.238, normalized 48 kHz synthetic narration, and SHA-256 `ED270F6902CFA3AB96C0081E204A62670161E2E392DD470388306C9D57B3CA37`.

Build Week requirements, verified against the [Official Rules](https://openai.devpost.com/rules) and [FAQ](https://openai.devpost.com/details/faqs):

- Runtime: **less than 3:00**; the audited master is 2:31.04
- Visibility: **Public**
- Host: **YouTube**; paste the final public YouTube URL into Devpost
- Audio/voiceover: explains what was built, how Codex was used, and how GPT-5.6 is integrated
- Language: English
- Rights check: no music or generated historical imagery; production archive material is shown as product output with its witnesses visible

Recommended YouTube and accessibility settings:

- Allow embedding: **On**, so Devpost can render the video in its submission player
- Audience: **No, it is not made for kids**
- Age restriction: **None**
- Synthetic-content disclosure: **Yes — synthetic narration only**
- English captions: upload the exact audited WebVTT file
- Custom thumbnail: upload `07-youtube-thumbnail.png`; if YouTube still requires channel phone verification, complete that owner-controlled step first

Publication verification passed for the historical publication: an unauthenticated HTTP fetch returned `200` with its exact title and exposed 1080p, audio, captions, and `playableInEmbed` metadata; authenticated Devpost Preview rendered that public player. The earlier public video at https://youtu.be/z1FJLdJS93o is retained only as historical publication provenance until the audited final video is published and verified.

## 2. Final Devpost synchronization

- Project: **Alexandria Here**
- Track: **Education**
- Production: https://alexandria-here.cinemaexile.chatgpt.site
- Public repository: https://github.com/jpart99/alexandria-here
- iExile recovery: https://alexandria-here.cinemaexile.chatgpt.site/r/18026989-33be-4011-86ee-19e1754cb22c
- iExile receipt: https://alexandria-here.cinemaexile.chatgpt.site/api/recover/18026989-33be-4011-86ee-19e1754cb22c/receipt
- Mars Pathfinder recovery: https://alexandria-here.cinemaexile.chatgpt.site/r/c6adb317-ee2f-4530-9298-e9eb5fe6efd2
- Mars Pathfinder receipt: https://alexandria-here.cinemaexile.chatgpt.site/api/recover/c6adb317-ee2f-4530-9298-e9eb5fe6efd2/receipt
- Claim-to-witness index: `JUDGE_EVIDENCE.md`
- Earlier video-capture row, retained only for historical provenance: https://alexandria-here.cinemaexile.chatgpt.site/r/8ea53a47-437b-4afe-ad2c-29c81637a327. The historical video-capture row now fails closed under the current evidence-replay validator; its machine receipt is unavailable.
- Primary Codex Session ID: `019f7304-e394-7f11-ba64-26e415135ff6`
- Project thumbnail: `submission-assets/08-devpost-cover.png` (1500×1000 RGB PNG, below 5 MB)
- Gallery, in upload order: `09-devpost-gallery-iexile-returned.png`, `10-devpost-gallery-iexile-seams.png`, `11-devpost-gallery-pathfinder-returned.png`, `12-devpost-gallery-pathfinder-timeline.png`, `13-devpost-gallery-pathfinder-absence.png`, `14-devpost-gallery-witness-receipt.png`
- Devpost media checksums: `submission-assets/devpost-media.sha256`
- Exact field copy: `DEVPOST_FIELD_COPY.md`

Keep this scope sentence verbatim in both the public YouTube description and Devpost narrative: **iExile is one witnessed production proof, not Alexandria's product boundary. Alexandria's product is the lost public web wherever surviving witnesses exist.**

Authenticated synchronization on July 19, 2026 saved the historical version 20 About story and judge instructions from `DEVPOST_FIELD_COPY.md`, the exact audited historical project thumbnail, six ordered historical gallery cards, and public video https://youtu.be/z1FJLdJS93o; Devpost Preview was then verified to show the embedded player, `99 passing tests`, judging recovery `18026989-33be-4011-86ee-19e1754cb22c`, the general lost-public-web scope, and all six cards, with gallery tabs `1 of 6` through `6 of 6`. The draft is now at **4/5 steps done**. This records the prior live state, not completion of the final synchronization.

- The project thumbnail is the exact audited `08-devpost-cover.png` after final upload and authenticated reload.
- The image gallery contains exactly six audited cards in numbered order after final upload, and Preview exposes all six slides.
- Before replacement, the required video-demo field contains https://youtu.be/z1FJLdJS93o; after replacement it must contain the new final public URL and render the new embedded player.
- The official-rules checkbox is unchecked and the project remains an unsubmitted Draft.

Public media synchronization remains pending. Upload the sealed package as one unit; do not mix final and historical video, captions, thumbnail, or gallery roles.

The authenticated live form accepts a JPG, PNG, or GIF project thumbnail up to 5 MB and recommends 3:2. Its image gallery accepts up to 15 images with the same displayed format, size, and ratio guidance. The six final cards satisfy those constraints.

Ordered completion actions:

1. Run both local media/readiness gates and require zero failures.
2. Publish the final video, captions, thumbnail, and metadata; verify signed-out playback, 1080p, captions, audio, and embedding.
3. Replace the Devpost video, project thumbnail, six gallery cards, About copy, and judge instructions; save and verify Preview.
4. Jaia personally accepts the official-rules checkbox; this remains within Jaia's authority.
5. Jaia submits before **July 21, 2026 at 5:00 PM PDT (Pacific Time)**.

## Judging availability hold

Keep the public Sites deployment, managed D1 judging row `18026989-33be-4011-86ee-19e1754cb22c`, managed D1 Pathfinder row `c6adb317-ee2f-4530-9298-e9eb5fe6efd2`, public GitHub repository, and public YouTube video available free and unrestricted through **August 5, 2026 at 5:00 PM PDT (Pacific Time)**. Do not delete, privatize, rotate away, or replace any of those judging surfaces during the hold.

Run `npm run qa:submission:live` immediately after final submission and at least once per day through the judging deadline. The gate pins both current presentation rows and receipts. Any failure is a release incident: restore the exact public surface first, then rerun the gate without rewriting either persisted proof row or receipt.
