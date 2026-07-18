from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont
from moviepy import AudioFileClip, ImageClip, concatenate_videoclips


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "submission-assets"
WORK = ROOT / "work" / "demo-video"
OUT = ASSETS / "alexandria-here-build-week-demo.mp4"
SIZE = (1920, 1080)
BG = "#0d1218"
INK = "#f2ede3"
MUTED = "#8ca0b3"
ACCENT = "#d5af5b"


SHOTS = [
    ("00-landing.png", "A witnessed restoration engine", "One public URL. Only surviving public evidence."),
    ("01-returned-site.png", "A returned place—not a screenshot", "Five visible pages from eight capture records · Aug–Nov 2009"),
    ("02-show-the-seams.png", "Show the Seams", "Block-level provenance makes every historical claim challengeable."),
    ("04-witnesses-focused.png", "Every claim has a witness", "Primary evidence renders. Alternates remain visible and unblended."),
    ("03-timeline-focused.png", "Temporal Evidence Graph", "Capture dates, URL variants, and conflicts resolve into one supported edition."),
    ("05-what-survived-focused.png", "Ghost Map", "Returned pages, inferred connections, and eight known absences."),
    ("06-receipt-focused.png", "Mechanical Recovery Receipt", "GPT-5.6 · gpt-5.6-sol · 347 blocks · 10/10 validations"),
    ("00-landing.png", "Built with Codex. Reconciled by GPT-5.6.", "The model proposes evidence choices. Deterministic validation decides what may render."),
    ("01-returned-site.png", "Alexandria Here returns a place—with witnesses.", "The lost web, present again—without pretending the gaps were never there."),
]


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    candidates = [
        Path("C:/Windows/Fonts/seguisb.ttf" if bold else "C:/Windows/Fonts/segoeui.ttf"),
        Path("C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf"),
    ]
    for candidate in candidates:
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size)
    return ImageFont.load_default()


def fitted(source: Image.Image, bounds: tuple[int, int]) -> Image.Image:
    image = source.copy()
    image.thumbnail(bounds, Image.Resampling.LANCZOS)
    return image


def frame(source_path: Path, title: str, subtitle: str, index: int) -> Path:
    canvas = Image.new("RGB", SIZE, BG)
    draw = ImageDraw.Draw(canvas)
    source = fitted(Image.open(source_path).convert("RGB"), (1660, 820))
    x = (SIZE[0] - source.width) // 2
    y = 108 + (820 - source.height) // 2
    draw.rounded_rectangle((x - 4, y - 4, x + source.width + 4, y + source.height + 4), 8, fill="#26313b")
    canvas.paste(source, (x, y))
    draw.text((130, 36), "ALEXANDRIA HERE", font=font(26, True), fill=ACCENT)
    draw.text((1790, 42), f"{index:02d}", font=font(20, True), fill=MUTED, anchor="ra")
    draw.rectangle((0, 932, 1920, 1080), fill="#111821")
    draw.text((130, 958), title, font=font(40, True), fill=INK)
    draw.text((130, 1018), subtitle, font=font(24), fill=MUTED)
    target = WORK / f"frame-{index:02d}.png"
    canvas.save(target, quality=95)
    return target


def render(audio_path: Path) -> None:
    WORK.mkdir(parents=True, exist_ok=True)
    audio = AudioFileClip(str(audio_path))
    # Keep the closing frame long enough to land; distribute the rest by narrative section.
    weights = [18, 25, 18, 17, 15, 15, 28, 24, 9]
    scale = audio.duration / sum(weights)
    durations = [value * scale for value in weights]
    frame_paths = [frame(ASSETS / name, title, subtitle, i + 1) for i, (name, title, subtitle) in enumerate(SHOTS)]
    clips = [ImageClip(str(path)).with_duration(duration) for path, duration in zip(frame_paths, durations)]
    video = concatenate_videoclips(clips, method="compose").with_audio(audio)
    video.write_videofile(
        str(OUT),
        fps=24,
        codec="libx264",
        audio_codec="aac",
        bitrate="3500k",
        audio_bitrate="192k",
        preset="veryfast",
        threads=4,
        ffmpeg_params=["-pix_fmt", "yuv420p", "-movflags", "+faststart"],
    )
    print(f"Rendered {OUT}")
    print(f"Duration: {audio.duration:.2f}s")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("audio", type=Path)
    args = parser.parse_args()
    render(args.audio.resolve())
