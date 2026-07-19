# Alexandria Here — final submission handoff

Everything below is prepared and audited. The Devpost text, project thumbnail, six-card gallery, and public YouTube video are saved and Preview-verified. The only remaining actions that require Jaia's authority are Devpost's official-rules acceptance and final submission.

Immediately before final submission, run `npm run qa:submission`. It is read-only, uses no network or secrets, prints the canonical absolute media paths, verifies the sealed video/captions/thumbnails/gallery plus required submission claims and operator contracts, and exits nonzero on local drift. Its one remaining aggregate external action stays `PENDING` until Jaia completes it. After that action is recorded, `npm run qa:submission -- --final` also refuses any remaining `PENDING` gate.

## 1. Public YouTube video — complete

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

Publication verification passed: an unauthenticated HTTP fetch returned `200` with the exact title and exposed 1080p, audio, caption-track, and `playableInEmbed` metadata; YouTube Studio shows the audited English captions as Published; and authenticated Devpost Preview rendered the public YouTube player with the exact title and channel. The exact public URL is saved in `SUBMISSION.md` and Devpost.

## 2. Finish the Devpost draft

- Project: **Alexandria Here**
- Track: **Education**
- Production: https://alexandria-here.cinemaexile.chatgpt.site
- Public repository: https://github.com/jpart99/alexandria-here
- GPT-5.6 recovery: https://alexandria-here.cinemaexile.chatgpt.site/r/18026989-33be-4011-86ee-19e1754cb22c
- Receipt: https://alexandria-here.cinemaexile.chatgpt.site/api/recover/18026989-33be-4011-86ee-19e1754cb22c/receipt
- Claim-to-witness index: `JUDGE_EVIDENCE.md`
- Sealed-video capture provenance (earlier ordinary production row, not the current decision-attribution proof): https://alexandria-here.cinemaexile.chatgpt.site/r/8ea53a47-437b-4afe-ad2c-29c81637a327
- Primary Codex Session ID: `019f7304-e394-7f11-ba64-26e415135ff6`
- Project thumbnail: `submission-assets/08-devpost-cover.png` (1500×1000 PNG, Devpost-preferred 3:2, below the live field's 5 MB cap)
- Gallery, in upload order: `09-devpost-gallery-returned-site.png`, `10-devpost-gallery-show-the-seams.png`, `11-devpost-gallery-timeline.png`, `12-devpost-gallery-what-survived.png`, `13-devpost-gallery-witnesses.png`, `14-devpost-gallery-receipt.png`
- Devpost media checksums: `submission-assets/devpost-media.sha256`
- Copy-ready narrative and checklist: `SUBMISSION.md`
- Exact field-aligned public story, judge instructions, and saved-field reference: `DEVPOST_FIELD_COPY.md`

Keep this scope sentence verbatim in both the public YouTube description and the Devpost narrative: **iExile is one witnessed production proof, not Alexandria's product boundary. Alexandria's product is the lost public web wherever surviving witnesses exist.**

Authenticated synchronization on July 19, 2026 saved the exact About story and judge instructions from `DEVPOST_FIELD_COPY.md`, the exact audited project thumbnail, the six ordered gallery cards, and public video https://youtu.be/z1FJLdJS93o; Devpost Preview was then verified to show the embedded player, `96 passing tests`, judging recovery `18026989-33be-4011-86ee-19e1754cb22c`, the general lost-public-web scope, and gallery tabs `1 of 6` through `6 of 6`. The draft is now at **4/5 steps done**. Project name, elevator pitch, technology tags, live-product link, Individual submitter type, United States, Education, repository URL, and Codex Session ID remain saved correctly. The remaining live state is exact:

- The project thumbnail is the exact audited `08-devpost-cover.png`, persisted after an authenticated reload.
- The image gallery contains exactly six audited cards in numbered order, and the public Preview exposes all six slides.
- The required video-demo field contains https://youtu.be/z1FJLdJS93o, and Preview renders the public embedded player.
- The official-rules checkbox is unchecked and the project remains an unsubmitted Draft.

Devpost media and video synchronization are complete. Do not disturb the already verified category boundary, current judging recovery, receipt, public video, project thumbnail, or six-slide gallery.

The authenticated live form currently accepts a JPG, PNG, or GIF project thumbnail up to 5 MB and recommends 3:2. Its image gallery accepts up to 15 images with the same displayed format, size, and ratio guidance. The six prepared gallery cards are optional and intentionally stay below those limits.

Final user-controlled actions:

1. Personally accept the official-rules checkbox.
2. Submit before **July 21, 2026 at 5:00 PM PDT (Pacific Time)**.

Submit early: Devpost permits edits to the judged entry until the deadline, when the hackathon submission locks.

## Judging availability hold

Keep the public Sites deployment, managed D1 judging row `18026989-33be-4011-86ee-19e1754cb22c`, public GitHub repository, and public YouTube video available free and unrestricted through **August 5, 2026 at 5:00 PM PDT (Pacific Time)**. Do not delete, privatize, rotate away, or replace any of those judging surfaces during the hold.

Run `npm run qa:submission:live` immediately after final submission and at least once per day through the judging deadline. Any failure is a release incident: restore the exact public surface first, then rerun the gate without rewriting the persisted proof row or its receipt.

Do not replace the current judging recovery path, the separate sealed-video capture path, model metrics, video master, captions, or hashes without re-running the corresponding audit gates.
