from __future__ import annotations

from hashlib import sha256
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "submission-assets"
SOURCES = OUT / "source-captures-v23"
BG = "#0b1118"
PANEL = "#121a22"
INK = "#f2ede3"
MUTED = "#91a2b2"
BLUE = "#75b9ef"
GOLD = "#d2ae59"
LINE = "#2b3743"

SOURCE_HASHES = {
    "01-iexile-returned-v23.png": "441C03C0D6CBBFDF3BE69419041A383820AD98ACECD7E440960D9EE2CF5BBA94",
    "02-iexile-seams-v23.png": "563A84937A65E6AA396C306153A010A425066E8CA02E1005671531924D1E00DC",
    "03-pathfinder-returned-v23.png": "B708A5723D1207F797C71473ABA61350F5D44CBE21CC3CD590AB28BCD8D77F93",
    "05-pathfinder-missing-seams-v23.png": "E662A065A44F3D15BF17A8E186C470D8F9EB5F33B0D23EC8CEBE080F8379B8C6",
    "06-pathfinder-ghost-map-v23.png": "D034B046A8D82C7D68DE1D772CED7F16746BA638302F1A421467BE4C205467AD",
    "07-pathfinder-timeline-2001-v23.png": "605730A793E6B2CAF517B6CA7C7E590DCEFE5E3A33153BFBAE4FFA23F03BD119",
    "08-pathfinder-witnesses-24-v23.png": "DE82225D0BEAC989F1CD01B28FF706DB3696A814703B1A69F9EDCB5D7CC9EE47",
    "10-pathfinder-receipt-v23.png": "53DC84252ED1E41C61B87BA20ADDD29360AE42A58C86693DCC942B2741EE730E",
}

OUTPUT_HASHES = {
    "07-youtube-thumbnail.png": "9D3BA06F82E7C7187BCCCD52D68AFD25D79F0EBF3060DED3DE306F0BF4AAF725",
    "08-devpost-cover.png": "CDEBA1AC93656D178B53A3D416283C75201D0E6B39667A4D18E943364B3E25D3",
    "09-devpost-gallery-iexile-returned.png": "4A5298D5C34714E33AF9C2127357CF488A1EB95B2E6430379A84B5D14BDD451F",
    "10-devpost-gallery-iexile-seams.png": "8FCB09512022734A21ED3C19FA53BD7E04007A372C025000728A7141516D4A68",
    "11-devpost-gallery-pathfinder-returned.png": "D84996DC402F9F80119972B7E2754E3BE7C0761A51D36923EE40A01F5415ED02",
    "12-devpost-gallery-pathfinder-timeline.png": "A87C1388FFA9CE1685C4C1268342FE224021EF09EFA0D0BD0549CBEA022E00C9",
    "13-devpost-gallery-pathfinder-absence.png": "3A25ACD400C4E7201EEB466F799A1AB9EA6886B90E0882FB1851252F6F3FB760",
    "14-devpost-gallery-witness-receipt.png": "4748BEF2294C2167E12E4983345B0E6C448BCCA0FB86AEE8A21B7E3299D42800",
}

DEVPOST_NAMES = tuple(name for name in OUTPUT_HASHES if name != "07-youtube-thumbnail.png")


def verify_hashes(root: Path, expected: dict[str, str], label: str) -> None:
    for name, expected_hash in expected.items():
        target = root / name
        if not target.is_file():
            raise FileNotFoundError(f"Missing {label}: {target}")
        actual_hash = sha256(target.read_bytes()).hexdigest().upper()
        if actual_hash != expected_hash:
            raise RuntimeError(
                f"{label.capitalize()} hash mismatch for {name}: "
                f"expected {expected_hash}, got {actual_hash}"
            )


def font(size: int, *, serif: bool = False, bold: bool = False, italic: bool = False) -> ImageFont.FreeTypeFont:
    if serif:
        names = ["georgiab.ttf" if bold else "georgiai.ttf" if italic else "georgia.ttf"]
    elif bold:
        names = ["seguisb.ttf", "arialbd.ttf"]
    elif italic:
        names = ["segoeuii.ttf", "ariali.ttf"]
    else:
        names = ["segoeui.ttf", "arial.ttf"]
    for name in names:
        candidate = Path("C:/Windows/Fonts") / name
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size)
    return ImageFont.load_default()


def fit(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    result = image.copy()
    result.thumbnail(size, Image.Resampling.LANCZOS)
    return result


def rounded_frame(
    canvas: Image.Image,
    source: Path,
    box: tuple[int, int, int, int],
    *,
    anchor_y: float = 0.0,
    radius: int = 20,
    contain: bool = False,
) -> None:
    image = Image.open(source).convert("RGB")
    x0, y0, x1, y1 = box
    target_w, target_h = x1 - x0, y1 - y0
    scale = (min if contain else max)(target_w / image.width, target_h / image.height)
    resized = image.resize((round(image.width * scale), round(image.height * scale)), Image.Resampling.LANCZOS)
    if contain:
        matte = Image.new("RGB", (target_w, target_h), PANEL)
        matte.paste(resized, ((target_w - resized.width) // 2, (target_h - resized.height) // 2))
        image = matte
    else:
        left = max(0, (resized.width - target_w) // 2)
        top = round(max(0, resized.height - target_h) * anchor_y)
        image = resized.crop((left, top, left + target_w, top + target_h))

    shadow_mask = Image.new("L", canvas.size, 0)
    ImageDraw.Draw(shadow_mask).rounded_rectangle((x0 + 12, y0 + 14, x1 + 12, y1 + 14), radius=radius, fill=160)
    shadow_mask = shadow_mask.filter(ImageFilter.GaussianBlur(18))
    shadow = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    shadow.paste((0, 0, 0, 190), (0, 0), shadow_mask)
    canvas.alpha_composite(shadow)

    mask = Image.new("L", image.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, image.width, image.height), radius=radius, fill=255)
    canvas.paste(image, (x0, y0), mask)
    ImageDraw.Draw(canvas).rounded_rectangle(box, radius=radius, outline=LINE, width=3)


def mark(draw: ImageDraw.ImageDraw, x: int, y: int, size: int = 50) -> None:
    draw.rectangle((x, y, x + size, y + size), outline=GOLD, width=2)
    draw.text((x + size / 2, y + size / 2), "AH", font=font(round(size * 0.36), serif=True), fill=GOLD, anchor="mm")


def chip(draw: ImageDraw.ImageDraw, x: int, y: int, label: str, *, accent: str = BLUE) -> int:
    face = font(17, bold=True)
    width = round(draw.textlength(label, font=face)) + 44
    draw.rounded_rectangle((x, y, x + width, y + 40), radius=20, fill="#0b1118dd", outline=accent, width=2)
    draw.ellipse((x + 14, y + 15, x + 24, y + 25), fill=accent)
    draw.text((x + 31, y + 9), label, font=face, fill=INK)
    return width


def header(draw: ImageDraw.ImageDraw, index: int | None = None) -> None:
    mark(draw, 62, 44)
    draw.text((132, 57), "ALEXANDRIA HERE", font=font(22, bold=True), fill=INK)
    if index is not None:
        draw.text((1438, 61), f"{index:02d} / 06", font=font(18, bold=True), fill=MUTED, anchor="ra")


def save(canvas: Image.Image, name: str) -> None:
    target = OUT / name
    canvas.convert("RGB").save(target, format="PNG", optimize=True)


def youtube_thumbnail() -> None:
    canvas = Image.new("RGBA", (1280, 720), BG)
    draw = ImageDraw.Draw(canvas)
    draw.rectangle((0, 0, 16, 720), fill=GOLD)
    mark(draw, 48, 38, 48)
    draw.text((114, 49), "ALEXANDRIA HERE", font=font(22, bold=True), fill=INK)
    draw.text((48, 122), "THE LOST WEB,", font=font(59, serif=True), fill=INK)
    draw.text((48, 185), "RETURNED WITH WITNESSES.", font=font(50, serif=True), fill=INK)
    draw.text((50, 257), "Two real recoveries. One evidence-only engine.", font=font(24, italic=True), fill=MUTED)
    rounded_frame(canvas, SOURCES / "01-iexile-returned-v23.png", (48, 318, 618, 618), anchor_y=0.05, radius=18)
    rounded_frame(canvas, SOURCES / "03-pathfinder-returned-v23.png", (662, 318, 1232, 618), anchor_y=0.05, radius=18)
    chip(draw, 68, 336, "iEXILE · 2009", accent=BLUE)
    chip(draw, 682, 336, "MARS PATHFINDER · 1999", accent=GOLD)
    draw.text((48, 662), "GPT-5.6 CHRONOLOGIST", font=font(17, bold=True), fill=BLUE)
    draw.text((316, 662), "·", font=font(17, bold=True), fill=MUTED)
    draw.text((340, 662), "DETERMINISTIC VERIFICATION", font=font(17, bold=True), fill=GOLD)
    draw.text((1232, 662), "OPENAI BUILD WEEK", font=font(17, bold=True), fill=INK, anchor="ra")
    save(canvas, "07-youtube-thumbnail.png")


def cover() -> None:
    canvas = Image.new("RGBA", (1500, 1000), BG)
    draw = ImageDraw.Draw(canvas)
    draw.rectangle((0, 0, 20, 1000), fill=GOLD)
    header(draw)
    draw.text((62, 166), "The lost web,", font=font(78, serif=True), fill=INK)
    draw.text((62, 246), "present again.", font=font(78, serif=True, italic=True), fill=INK)
    draw.text((64, 360), "A witnessed restoration engine", font=font(22, bold=True), fill=BLUE)
    draw.text((64, 402), "returns only what surviving public", font=font(24), fill=MUTED)
    draw.text((64, 436), "evidence can support—and exposes", font=font(24), fill=MUTED)
    draw.text((64, 470), "where that evidence ends.", font=font(24), fill=MUTED)
    rounded_frame(canvas, SOURCES / "01-iexile-returned-v23.png", (620, 72, 1440, 492), anchor_y=0.02, radius=22)
    rounded_frame(canvas, SOURCES / "03-pathfinder-returned-v23.png", (620, 530, 1440, 950), anchor_y=0.02, radius=22)
    chip(draw, 644, 95, "HUMAN & CULTURAL MEMORY · iEXILE", accent=BLUE)
    chip(draw, 644, 553, "SCIENTIFIC MEMORY · MARS PATHFINDER", accent=GOLD)
    draw.rounded_rectangle((62, 550, 554, 830), radius=20, fill=PANEL, outline=LINE, width=2)
    draw.text((92, 584), "THE CHRONOLOGIST", font=font(18, bold=True), fill=BLUE)
    draw.text((92, 628), "GPT-5.6 orders only supplied", font=font(24, bold=True), fill=INK)
    draw.text((92, 663), "pages and selects supplied", font=font(24, bold=True), fill=INK)
    draw.text((92, 698), "primary witnesses.", font=font(24, bold=True), fill=INK)
    draw.line((92, 742, 518, 742), fill=LINE, width=2)
    draw.text((92, 765), "Deterministic validation decides", font=font(19), fill=MUTED)
    draw.text((92, 798), "what may render.", font=font(19), fill=MUTED)
    draw.text((64, 906), "NOTHING HERE IS CLAIMED WITHOUT A WITNESS.", font=font(18, bold=True), fill=GOLD)
    draw.text((64, 942), "OPENAI BUILD WEEK · EDUCATION", font=font(17, bold=True), fill=INK)
    save(canvas, "08-devpost-cover.png")


def gallery_card(
    *,
    index: int,
    output: str,
    sources: list[tuple[str, tuple[int, int, int, int], float, bool]],
    label: str,
    title: str,
    subtitle: str,
    accent: str,
) -> None:
    canvas = Image.new("RGBA", (1500, 1000), BG)
    draw = ImageDraw.Draw(canvas)
    draw.rectangle((0, 0, 20, 1000), fill=GOLD)
    header(draw, index)
    chip(draw, 400, 49, label, accent=accent)
    for source, box, anchor_y, contain in sources:
        rounded_frame(canvas, SOURCES / source, box, anchor_y=anchor_y, radius=22, contain=contain)
    draw.text((62, 792), title, font=font(46, serif=True), fill=INK)
    draw.text((62, 857), subtitle, font=font(24), fill=MUTED)
    draw.line((62, 930, 1440, 930), fill=LINE, width=2)
    draw.text((62, 953), "ALEXANDRIA DOES NOT GENERATE THE PAST. IT RECONCILES SURVIVING WITNESSES.", font=font(16, bold=True), fill=GOLD)
    save(canvas, output)


def gallery() -> None:
    single = (62, 126, 1438, 744)
    gallery_card(index=1, output="09-devpost-gallery-iexile-returned.png", sources=[("01-iexile-returned-v23.png", single, 0.0, False)], label="iEXILE · RETURNED SITE", title="A community place, returned.", subtitle="Five Preserved pages and two witnessed Missing states from public archive evidence.", accent=BLUE)
    gallery_card(index=2, output="10-devpost-gallery-iexile-seams.png", sources=[("02-iexile-seams-v23.png", single, 0.0, False)], label="SHOW THE SEAMS", title="Every returned block keeps its witness.", subtitle="Source, capture date, lineage, and SHA-256 remain inspectable.", accent=GOLD)
    gallery_card(index=3, output="11-devpost-gallery-pathfinder-returned.png", sources=[("03-pathfinder-returned-v23.png", single, 0.0, False)], label="MARS PATHFINDER · RETURNED SITE", title="The same engine crosses domains.", subtitle="A second ordinary recovery: eight captures, seven Preserved pages, one Missing state.", accent=BLUE)
    gallery_card(index=4, output="12-devpost-gallery-pathfinder-timeline.png", sources=[("07-pathfinder-timeline-2001-v23.png", single, 0.0, False)], label="TEMPORAL EVIDENCE GRAPH", title="Fragments reconciled into supported eras.", subtitle="Alternate windows inspect persisted evidence without creating or switching the recovery.", accent=GOLD)
    gallery_card(index=5, output="13-devpost-gallery-pathfinder-absence.png", sources=[("05-pathfinder-missing-seams-v23.png", (62, 126, 736, 744), 0.0, True), ("06-pathfinder-ghost-map-v23.png", (764, 126, 1438, 744), 0.0, True)], label="WHAT ALEXANDRIA REFUSED TO CLAIM", title="Absence remains part of the record.", subtitle="A Missing page retains its cited references; the Ghost Map reveals the surviving shape.", accent=BLUE)
    gallery_card(index=6, output="14-devpost-gallery-witness-receipt.png", sources=[("08-pathfinder-witnesses-24-v23.png", (62, 126, 736, 744), 0.0, True), ("10-pathfinder-receipt-v23.png", (764, 126, 1438, 744), 0.0, True)], label="WITNESSES + RECOVERY RECEIPT", title="A challengeable restoration, not an assertion.", subtitle="GPT-5.6 proposes evidence choices. Deterministic validation decides what may render.", accent=GOLD)


def manifest() -> None:
    lines = [f"{OUTPUT_HASHES[name]}  {name}" for name in DEVPOST_NAMES]
    (OUT / "devpost-media.sha256").write_bytes(("\n".join(lines) + "\n").encode("ascii"))


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    verify_hashes(SOURCES, SOURCE_HASHES, "source capture")
    youtube_thumbnail()
    cover()
    gallery()
    verify_hashes(OUT, OUTPUT_HASHES, "publication image")
    manifest()
    print(f"Rendered final v23 YouTube thumbnail and Devpost publication images to {OUT}")
