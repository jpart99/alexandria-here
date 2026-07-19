# Alexandria Here — final submission handoff

The application is on accepted production version 22, but the submission media has not been finalized. The current public YouTube video and Devpost media are placeholder presentation media, not the final version 22 submission set. Final media and Devpost synchronization remain pending; Jaia's official-rules acceptance and final submission must follow those gates.

Immediately before final submission, run `npm run qa:submission`. It is read-only, uses no network or secrets, prints the canonical absolute placeholder-media paths, verifies their byte integrity plus required submission claims and operator contracts, and exits nonzero on local drift. Final video, captions, thumbnails, gallery, hashes, YouTube metadata, and Devpost synchronization must be regenerated together only after the application and presentation sequence are locked. `npm run qa:submission -- --final` refuses every remaining `PENDING` gate.

## 1. Placeholder YouTube publication — replacement pending

- Public URL: https://youtu.be/z1FJLdJS93o
- Channel: **Julian A** (`@JulianA-r6o8b`)
- Published: **July 19, 2026**

- Video: `submission-assets/alexandria-here-build-week-demo.mp4`
- SHA-256: `B2EA9AFC1967B0BA6CC0B06BFC2E628ABB09BD237D0145D5F9A84C4BB04583BA`
- Thumbnail: `submission-assets/07-youtube-thumbnail.png`
- Captions: `submission-assets/alexandria-here-build-week-demo.en.vtt`
- Title, description, chapters, disclosure, and settings: `YOUTUBE_METADATA.md`

Build Week requirements, verified against the [Official Rules](https://openai.devpost.com/rules) and [FAQ](https://openai.devpost.com/details/faqs):

- Runtime: **less than 3:00**; the audited master is 2:35.26
- Visibility: **Public**
- Host: **YouTube**; paste the public YouTube URL into Devpost
- Audio/voiceover: clearly explain what was built, how Codex was used, and how GPT-5.6 is integrated
- Language: English, or provide an English translation
- Rights check: no unlicensed third-party trademarks, copyrighted music, or other copyrighted material

Recommended YouTube and accessibility settings:

- Allow embedding: **On**, so Devpost can render the video in its submission player
- Audience: **No, it is not made for kids**
- Age restriction: **None**
- Synthetic-content disclosure: **Yes — synthetic narration only**
- English captions: **Published** from the exact audited WebVTT file
- Custom thumbnail: the exact asset remains ready, but YouTube blocked custom-thumbnail upload until this channel completes phone verification; the public video currently uses YouTube's strongest generated frame

Publication verification passed for the historical placeholder: an unauthenticated HTTP fetch returned `200` with the exact title and exposed 1080p, audio, caption-track, and `playableInEmbed` metadata; YouTube Studio shows the audited English captions as Published; and authenticated Devpost Preview rendered the public YouTube player with the exact title and channel. The exact public URL is saved in `SUBMISSION.md` and Devpost as placeholder provenance; it does not satisfy the final-media gate.

## 2. Finish the Devpost draft

- Project: **Alexandria Here**
- Track: **Education**
- Production: https://alexandria-here.cinemaexile.chatgpt.site
- Public repository: https://github.com/jpart99/alexandria-here
- GPT-5.6 recovery: https://alexandria-here.cinemaexile.chatgpt.site/r/18026989-33be-4011-86ee-19e1754cb22c
- Receipt: https://alexandria-here.cinemaexile.chatgpt.site/api/recover/18026989-33be-4011-86ee-19e1754cb22c/receipt
- Mars Pathfinder recovery: https://alexandria-here.cinemaexile.chatgpt.site/r/c6adb317-ee2f-4530-9298-e9eb5fe6efd2
- Mars Pathfinder receipt: https://alexandria-here.cinemaexile.chatgpt.site/api/recover/c6adb317-ee2f-4530-9298-e9eb5fe6efd2/receipt
- Claim-to-witness index: `JUDGE_EVIDENCE.md`
- Sealed-video capture provenance (earlier ordinary production row, not the current decision-attribution proof): https://alexandria-here.cinemaexile.chatgpt.site/r/8ea53a47-437b-4afe-ad2c-29c81637a327. The historical video-capture row now fails closed under the current evidence-replay validator; its machine receipt is unavailable.
- Primary Codex Session ID: `019f7304-e394-7f11-ba64-26e415135ff6`
- Project thumbnail: `submission-assets/08-devpost-cover.png` (1500×1000 PNG, Devpost-preferred 3:2, below the live field's 5 MB cap)
- Gallery, in upload order: `09-devpost-gallery-returned-site.png`, `10-devpost-gallery-show-the-seams.png`, `11-devpost-gallery-timeline.png`, `12-devpost-gallery-what-survived.png`, `13-devpost-gallery-witnesses.png`, `14-devpost-gallery-receipt.png`
- Devpost media checksums: `submission-assets/devpost-media.sha256`
- Copy-ready narrative and checklist: `SUBMISSION.md`
- Exact field-aligned public story, judge instructions, and saved-field reference: `DEVPOST_FIELD_COPY.md`

Keep this scope sentence verbatim in both the public YouTube description and the Devpost narrative: **iExile is one witnessed production proof, not Alexandria's product boundary. Alexandria's product is the lost public web wherever surviving witnesses exist.**

Authenticated synchronization on July 19, 2026 saved the historical version 20 About story and judge instructions from `DEVPOST_FIELD_COPY.md`, the exact audited placeholder project thumbnail, the six ordered placeholder gallery cards, and public video https://youtu.be/z1FJLdJS93o; Devpost Preview was then verified to show the embedded player, `99 passing tests`, judging recovery `18026989-33be-4011-86ee-19e1754cb22c`, the general lost-public-web scope, and all six persisted gallery cards, with gallery tabs `1 of 6` through `6 of 6`. The draft is now at **4/5 steps done**. Project name, elevator pitch, technology tags, live-product link, Individual submitter type, United States, Education, repository URL, and Codex Session ID remain saved correctly. The remaining live state is exact:

- The project thumbnail is the exact audited `08-devpost-cover.png`, persisted after an authenticated reload.
- The image gallery contains exactly six audited cards in numbered order, and the public Preview exposes all six slides.
- The required video-demo field contains https://youtu.be/z1FJLdJS93o, and Preview renders the public embedded player.
- The official-rules checkbox is unchecked and the project remains an unsubmitted Draft.

Final media and Devpost synchronization remain pending. Do not overwrite the placeholder set until the application and iExile/Mars Pathfinder presentation sequence are locked and one complete replacement package has passed its audit.

The authenticated live form currently accepts a JPG, PNG, or GIF project thumbnail up to 5 MB and recommends 3:2. Its image gallery accepts up to 15 images with the same displayed format, size, and ratio guidance. The six prepared gallery cards are optional and intentionally stay below those limits.

Ordered completion actions:

1. Lock the application and presentation sequence.
2. Regenerate, audit, publish, and synchronize the final version 22 video, captions, thumbnail, gallery, hashes, YouTube metadata, and Devpost fields as one unit.
3. Jaia personally accepts the official-rules checkbox; this remains within Jaia's authority.
4. Jaia submits before **July 21, 2026 at 5:00 PM PDT (Pacific Time)**.

Submit early: Devpost permits edits to the judged entry until the deadline, when the hackathon submission locks.

## Judging availability hold

Keep the public Sites deployment, managed D1 judging row `18026989-33be-4011-86ee-19e1754cb22c`, managed D1 Pathfinder row `c6adb317-ee2f-4530-9298-e9eb5fe6efd2`, public GitHub repository, and public YouTube video available free and unrestricted through **August 5, 2026 at 5:00 PM PDT (Pacific Time)**. Do not delete, privatize, rotate away, or replace any of those judging surfaces during the hold.

Run `npm run qa:submission:live` immediately after final submission and at least once per day through the judging deadline. The gate pins both current presentation rows and receipts. Any failure is a release incident: restore the exact public surface first, then rerun the gate without rewriting either persisted proof row or receipt.

Do not replace the current judging recovery path or model metrics. Replace the placeholder video, captions, thumbnail, gallery, and hashes only as one final audited set after the application and presentation sequence are locked.
