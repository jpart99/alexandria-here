from __future__ import annotations

from hashlib import sha256
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "submission-assets"
BG = "#0b1118"
PANEL = "#111b25"
INK = "#f2ede3"
MUTED = "#91a2b2"
BLUE = "#75b9ef"
GOLD = "#d2ae59"
LINE = "#2b3743"


def font(size: int, bold: bool = False, italic: bool = False) -> ImageFont.FreeTypeFont:
    if bold:
        names = ["seguisb.ttf", "arialbd.ttf"]
    elif italic:
        names = ["segoeuii.ttf", "ariali.ttf"]
    else:
        names = ["segoeui.ttf", "arial.ttf"]
    for name in names:
        path = Path("C:/Windows/Fonts") / name
        if path.exists():
            return ImageFont.truetype(str(path), size)
    return ImageFont.load_default()


def contain(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    copy = image.copy()
    copy.thumbnail(size, Image.Resampling.LANCZOS)
    return copy


def crop_fill(image: Image.Image, size: tuple[int, int], anchor_y: float = 0.0, anchor_x: float = 0.5) -> Image.Image:
    target_w, target_h = size
    scale = max(target_w / image.width, target_h / image.height)
    resized = image.resize((round(image.width * scale), round(image.height * scale)), Image.Resampling.LANCZOS)
    left = round(max(0, resized.width - target_w) * anchor_x)
    top = round(max(0, resized.height - target_h) * anchor_y)
    return resized.crop((left, top, left + target_w, top + target_h))


def paste_rounded(
    canvas: Image.Image,
    image: Image.Image,
    box: tuple[int, int, int, int],
    radius: int = 20,
    anchor_x: float = 0.5,
) -> None:
    x0, y0, x1, y1 = box
    target = crop_fill(image, (x1 - x0, y1 - y0), 0.0, anchor_x)
    mask = Image.new("L", target.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, target.width, target.height), radius=radius, fill=255)
    shadow = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    shadow_mask = Image.new("L", canvas.size, 0)
    ImageDraw.Draw(shadow_mask).rounded_rectangle((x0 + 14, y0 + 18, x1 + 14, y1 + 18), radius=radius, fill=175)
    shadow_mask = shadow_mask.filter(ImageFilter.GaussianBlur(20))
    shadow.paste((0, 0, 0, 190), (0, 0), shadow_mask)
    canvas.alpha_composite(shadow)
    canvas.paste(target, (x0, y0), mask)
    ImageDraw.Draw(canvas).rounded_rectangle(box, radius=radius, outline=LINE, width=3)


def badge(draw: ImageDraw.ImageDraw, xy: tuple[int, int], text: str, fill: str = BLUE) -> int:
    x, y = xy
    label_font = font(20, True)
    width = round(draw.textlength(text, font=label_font)) + 34
    draw.rounded_rectangle((x, y, x + width, y + 42), radius=21, fill=PANEL, outline=LINE, width=2)
    draw.ellipse((x + 14, y + 16, x + 22, y + 24), fill=fill)
    draw.text((x + 28, y + 9), text, font=label_font, fill=INK)
    return width


def youtube_thumbnail() -> None:
    canvas = Image.new("RGBA", (1280, 720), BG)
    draw = ImageDraw.Draw(canvas)
    draw.rectangle((0, 0, 18, 720), fill=GOLD)
    draw.rectangle((58, 46, 108, 96), outline=GOLD, width=2)
    draw.text((83, 71), "AH", font=font(19, True), fill=GOLD, anchor="mm")
    draw.text((126, 59), "ALEXANDRIA HERE", font=font(24, True), fill=INK)
    draw.text((60, 142), "A WITNESSED RESTORATION ENGINE", font=font(18, True), fill=BLUE)
    draw.text((58, 187), "A LOST SITE,", font=font(68, True), fill=INK)
    draw.text((58, 264), "RETURNED.", font=font(68, True), fill=INK)
    draw.text((60, 370), "Nothing here is claimed", font=font(30, italic=True), fill=MUTED)
    draw.text((60, 410), "without a witness.", font=font(30, italic=True), fill=MUTED)
    draw.ellipse((60, 505, 72, 517), fill=GOLD)
    draw.text((88, 495), "SHOW THE SEAMS · TEMPORAL GRAPH · RECEIPT", font=font(18, True), fill=INK)
    draw.text((60, 612), "The model proposes evidence choices. Deterministic validation decides what may render.", font=font(16), fill=MUTED)
    draw.line((60, 652, 600, 652), fill=LINE, width=2)
    draw.text((60, 669), "OPENAI BUILD WEEK · EDUCATION", font=font(16, True), fill=GOLD)

    witnesses = Image.open(ASSETS / "04-witnesses-focused.png").convert("RGB")
    receipt = Image.open(ASSETS / "06-receipt-focused.png").convert("RGB")
    paste_rounded(canvas, witnesses, (620, 72, 1230, 500), 22, anchor_x=0.0)
    paste_rounded(canvas, receipt, (790, 430, 1225, 680), 18)
    draw.rounded_rectangle((637, 88, 838, 126), radius=19, fill="#0b1118dd", outline=BLUE, width=2)
    draw.text((655, 96), "WITNESS LEDGER", font=font(17, True), fill=INK)
    draw.rounded_rectangle((807, 458, 1014, 496), radius=19, fill="#0b1118dd", outline=GOLD, width=2)
    draw.text((825, 466), "RECOVERY RECEIPT", font=font(17, True), fill=INK)
    canvas.convert("RGB").save(ASSETS / "07-youtube-thumbnail.png", quality=95)


def devpost_cover() -> None:
    # Devpost recommends a 3:2 project thumbnail. Keep every embedded product
    # frame at its native 1521:680 aspect ratio so no evidence UI is cropped.
    canvas = Image.new("RGBA", (1500, 1000), BG)
    draw = ImageDraw.Draw(canvas)
    draw.rectangle((0, 0, 20, 1000), fill=GOLD)
    draw.rectangle((76, 70, 138, 132), outline=GOLD, width=2)
    draw.text((107, 101), "AH", font=font(23, True), fill=GOLD, anchor="mm")
    draw.text((164, 78), "ALEXANDRIA HERE", font=font(24, True), fill=INK)
    draw.text((78, 178), "A LOST SITE,", font=font(76, True), fill=INK)
    draw.text((78, 264), "RETURNED.", font=font(76, True), fill=INK)
    draw.text((78, 382), "Nothing here is claimed", font=font(34, italic=True), fill=MUTED)
    draw.text((78, 430), "without a witness.", font=font(34, italic=True), fill=MUTED)
    draw.ellipse((78, 520, 92, 534), fill=GOLD)
    draw.text((111, 510), "A WITNESSED RESTORATION ENGINE", font=font(21, True), fill=BLUE)
    draw.text((78, 585), "Coherent returned site", font=font(23), fill=INK)
    draw.text((78, 626), "Block-level provenance", font=font(23), fill=INK)
    draw.text((78, 667), "Mechanical recovery receipt", font=font(23), fill=INK)
    draw.line((78, 754, 548, 754), fill=LINE, width=2)
    draw.text((78, 784), "Nothing here is claimed", font=font(22, True), fill=INK)
    draw.text((78, 817), "without a witness.", font=font(22, True), fill=INK)
    draw.text((78, 925), "OPENAI BUILD WEEK · EDUCATION", font=font(18, True), fill=GOLD)

    witnesses = Image.open(ASSETS / "04-witnesses-focused.png").convert("RGB")
    receipt = Image.open(ASSETS / "06-receipt-focused.png").convert("RGB")
    ghost = Image.open(ASSETS / "05-what-survived-focused.png").convert("RGB")
    paste_rounded(canvas, witnesses, (620, 70, 1440, 437), 24)
    paste_rounded(canvas, ghost, (620, 493, 1010, 667), 18)
    paste_rounded(canvas, receipt, (1030, 493, 1440, 676), 18)
    draw.rounded_rectangle((644, 94, 822, 136), radius=21, fill="#0b1118dd", outline=GOLD, width=2)
    draw.text((665, 103), "WITNESS LEDGER", font=font(18, True), fill=INK)
    draw.rounded_rectangle((644, 516, 828, 554), radius=19, fill="#0b1118dd", outline=BLUE, width=2)
    draw.text((663, 524), "WHAT SURVIVED", font=font(16, True), fill=INK)
    draw.rounded_rectangle((1054, 516, 1256, 554), radius=19, fill="#0b1118dd", outline=GOLD, width=2)
    draw.text((1073, 524), "RECOVERY RECEIPT", font=font(16, True), fill=INK)

    draw.rounded_rectangle((620, 720, 1440, 920), radius=24, fill=PANEL, outline=LINE, width=2)
    draw.text((650, 748), "FEATURED WITNESSED RECOVERY", font=font(17, True), fill=GOLD)
    draw.text((650, 786), "GPT-5.6 proposes evidence choices.", font=font(26, True), fill=INK)
    draw.text((650, 826), "Deterministic validation decides what may render.", font=font(21), fill=MUTED)
    first_badge_width = badge(draw, (650, 865), "GPT-5.6 CHRONOLOGIST", BLUE)
    badge(draw, (650 + first_badge_width + 18, 865), "10/10 VALIDATIONS", GOLD)
    canvas.convert("RGB").save(ASSETS / "08-devpost-cover.png", quality=95)


def devpost_gallery_card(
    *,
    output_name: str,
    source_name: str,
    index: int,
    label: str,
    title: str,
    subtitle: str,
    accent: str,
) -> None:
    canvas = Image.new("RGBA", (1500, 1000), BG)
    draw = ImageDraw.Draw(canvas)
    draw.rectangle((0, 0, 20, 1000), fill=GOLD)
    draw.rectangle((60, 45, 110, 95), outline=GOLD, width=2)
    draw.text((85, 70), "AH", font=font(19, True), fill=GOLD, anchor="mm")
    draw.text((132, 57), "ALEXANDRIA HERE", font=font(23, True), fill=INK)
    draw.text((1420, 59), f"{index:02d} / 06", font=font(18, True), fill=MUTED, anchor="ra")

    source = Image.open(ASSETS / source_name).convert("RGB")
    # Fit the complete verified product frame inside the available stage. The
    # returned-site capture is 16:10 while the five Atlas captures are 1521:680;
    # centering a ratio-matched box keeps both classes entirely uncropped.
    stage_x0, stage_y0, stage_x1, stage_y1 = (60, 125, 1440, 742)
    stage_width = stage_x1 - stage_x0
    stage_height = stage_y1 - stage_y0
    source_ratio = source.width / source.height
    stage_ratio = stage_width / stage_height
    if source_ratio < stage_ratio:
        frame_width = round(stage_height * source_ratio)
        frame_x0 = stage_x0 + (stage_width - frame_width) // 2
        frame_box = (frame_x0, stage_y0, frame_x0 + frame_width, stage_y1)
    else:
        frame_height = round(stage_width / source_ratio)
        frame_y0 = stage_y0 + (stage_height - frame_height) // 2
        frame_box = (stage_x0, frame_y0, stage_x1, frame_y0 + frame_height)
    paste_rounded(canvas, source, frame_box, 24)
    badge(draw, (400, 49), label, accent)

    draw.text((60, 792), title, font=font(42, True), fill=INK)
    draw.text((60, 855), subtitle, font=font(24), fill=MUTED)
    draw.line((60, 930, 1440, 930), fill=LINE, width=2)
    draw.text(
        (60, 951),
        "NOTHING HERE IS CLAIMED WITHOUT A WITNESS.",
        font=font(17, True),
        fill=GOLD,
    )
    canvas.convert("RGB").save(ASSETS / output_name, quality=95)


def devpost_gallery() -> None:
    cards = [
        {
            "output_name": "09-devpost-gallery-returned-site.png",
            "source_name": "01-returned-site.png",
            "label": "RETURNED SITE",
            "title": "A coherent place, returned.",
            "subtitle": "Five visible pages from eight capture records, through the same public pipeline.",
            "accent": BLUE,
        },
        {
            "output_name": "10-devpost-gallery-show-the-seams.png",
            "source_name": "02-show-the-seams.png",
            "label": "SHOW THE SEAMS",
            "title": "Every claim can show its seams.",
            "subtitle": "Each returned historical block resolves to archived evidence and a content hash.",
            "accent": GOLD,
        },
        {
            "output_name": "11-devpost-gallery-timeline.png",
            "source_name": "03-timeline-focused.png",
            "label": "TIMELINE",
            "title": "Fragments reconciled into an era.",
            "subtitle": "Capture dates, URL variants, conflicts, and source relationships stay explicit.",
            "accent": BLUE,
        },
        {
            "output_name": "12-devpost-gallery-what-survived.png",
            "source_name": "05-what-survived-focused.png",
            "label": "WHAT SURVIVED",
            "title": "Absence remains visible.",
            "subtitle": "Preserved pages, reconstructed relationships, and eight known absences.",
            "accent": GOLD,
        },
        {
            "output_name": "13-devpost-gallery-witnesses.png",
            "source_name": "04-witnesses-focused.png",
            "label": "WITNESS LEDGER",
            "title": "Every source stays inspectable.",
            "subtitle": "The featured recovery retains 946 content-addressed source blocks.",
            "accent": BLUE,
        },
        {
            "output_name": "14-devpost-gallery-receipt.png",
            "source_name": "06-receipt-focused.png",
            "label": "RECOVERY RECEIPT",
            "title": "A content-addressed recovery receipt.",
            "subtitle": "GPT-5.6, 347 rendered blocks, and 10 of 10 deterministic validations.",
            "accent": GOLD,
        },
    ]
    for index, card in enumerate(cards, start=1):
        devpost_gallery_card(index=index, **card)


def write_devpost_manifest() -> None:
    names = [
        "08-devpost-cover.png",
        "09-devpost-gallery-returned-site.png",
        "10-devpost-gallery-show-the-seams.png",
        "11-devpost-gallery-timeline.png",
        "12-devpost-gallery-what-survived.png",
        "13-devpost-gallery-witnesses.png",
        "14-devpost-gallery-receipt.png",
    ]
    lines = [
        f"{sha256((ASSETS / name).read_bytes()).hexdigest().upper()}  {name}"
        for name in names
    ]
    # Write explicit LF bytes so the checksum manifest is identical on Windows,
    # in Git, and when fetched from the public repository.
    (ASSETS / "devpost-media.sha256").write_bytes(("\n".join(lines) + "\n").encode("ascii"))


if __name__ == "__main__":
    youtube_thumbnail()
    devpost_cover()
    devpost_gallery()
    write_devpost_manifest()
    print("Rendered YouTube thumbnail, Devpost cover, six gallery cards, and checksums")
