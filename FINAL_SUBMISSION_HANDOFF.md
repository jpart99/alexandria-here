# Alexandria Here — final submission handoff

Everything below is prepared and audited. The only actions that require Jaia's authority are synchronizing the prepared Devpost text and media, public YouTube publication, Devpost's official-rules acceptance, and final submission.

Immediately before selecting any upload file, run `npm run qa:submission`. It is read-only, uses no network or secrets, prints the canonical absolute upload paths, verifies the sealed video/captions/thumbnails/gallery plus required submission claims and operator contracts, and exits nonzero on local drift. Its three external actions remain `PENDING` until their user-controlled steps are completed. After those actions are recorded, `npm run qa:submission -- --final` also refuses any remaining `PENDING` gate.

## 1. Publish the YouTube video

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
- Upload the custom thumbnail and English captions before copying the URL

After processing finishes, verify 1080p playback, audible narration, visible captions, public access in a signed-out window, and embedding. Then paste the public URL into `SUBMISSION.md` and Devpost.

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

Authenticated read-only audit on July 19, 2026 found the draft at **3/5 steps done**. Project name, elevator pitch, technology tags, live-product link, Individual submitter type, United States, Education, repository URL, and Codex Session ID are already saved correctly. The remaining live state is exact:

- The project thumbnail is still the placeholder.
- The public About story still says `36 passing tests` and cites the earlier video-capture row instead of the current decision-attribution proof.
- The image gallery is empty.
- The required video-demo field is empty.
- Judge test instructions still point to the earlier video-capture row as the primary recovery.
- The official-rules checkbox is unchecked and the project remains an unsubmitted Draft.

Before any media upload or final submit, replace the complete About field and judge test-instructions field with their exact sections from `DEVPOST_FIELD_COPY.md`. Then upload the audited media, add the public YouTube URL, save, open Preview, and verify the category boundary, current judging recovery, receipt, all seven 3:2 images, and embedded video. Do not accept the official rules or press **Submit project** during synchronization.

The authenticated live form currently accepts a JPG, PNG, or GIF project thumbnail up to 5 MB and recommends 3:2. Its image gallery accepts up to 15 images with the same displayed format, size, and ratio guidance. The six prepared gallery cards are optional and intentionally stay below those limits.

Final user-controlled actions:

1. Upload the project thumbnail and the six gallery cards in the listed order.
2. Add the public YouTube URL.
3. Confirm the thumbnail, gallery, and embedded video render correctly in Preview.
4. Personally accept the official-rules checkbox.
5. Submit before **July 21, 2026 at 5:00 PM PDT (Pacific Time)**.

Submit early: Devpost permits edits to the judged entry until the deadline, when the hackathon submission locks.

## Judging availability hold

Keep the public Sites deployment, managed D1 judging row `18026989-33be-4011-86ee-19e1754cb22c`, public GitHub repository, and public YouTube video available free and unrestricted through **August 5, 2026 at 5:00 PM PDT (Pacific Time)**. Do not delete, privatize, rotate away, or replace any of those judging surfaces during the hold.

Run `npm run qa:submission:live` immediately after final submission and at least once per day through the judging deadline. Any failure is a release incident: restore the exact public surface first, then rerun the gate without rewriting the persisted proof row or its receipt.

Do not replace the current judging recovery path, the separate sealed-video capture path, model metrics, video master, captions, or hashes without re-running the corresponding audit gates.
