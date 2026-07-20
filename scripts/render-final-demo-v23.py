from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
STAGE = ROOT / "work" / "final-media-v23"
DEFAULT_OUTPUT = STAGE / "alexandria-here-final-demo-v23.mp4"
DEFAULT_CAPTION_CANDIDATES = (
    "final-captions-v23.vtt",
    "final-narration-v23.vtt",
)
BUNDLED_FFMPEG = (
    ROOT
    / "work"
    / "media-venv"
    / "Lib"
    / "site-packages"
    / "imageio_ffmpeg"
    / "binaries"
    / "ffmpeg-win-x86_64-v7.1.exe"
)

WIDTH = 1920
HEIGHT = 1080
FPS = 30
TAIL_SECONDS = 1.5
MINIMUM_FILM_SECONDS = 104.0
MAXIMUM_FILM_SECONDS = 176.5


@dataclass(frozen=True)
class Scene:
    name: str
    filename: str
    kind: str
    weight: float = 1.0
    fixed_seconds: float | None = None
    source_start_seconds: float = 0.0


# The two WebMs are the live, asserted browser journeys. Stills are used only
# to let dense evidence views breathe long enough to be read; none substitutes
# for either live journey.
SCENES = (
    Scene("Invocation", "00-landing-v23.png", "still", fixed_seconds=10.774),
    Scene("iExile returned", "01-iexile-returned-v23.png", "still", fixed_seconds=19.643),
    Scene(
        "iExile live journey",
        "iexile-story-v23.webm",
        "video",
        fixed_seconds=10.822,
        source_start_seconds=1.500,
    ),
    Scene("iExile seams", "02-iexile-seams-v23.png", "still", fixed_seconds=6.404),
    Scene("iExile Timeline", "11-iexile-timeline-v23.png", "still", fixed_seconds=5.083),
    Scene("iExile Witnesses", "12-iexile-witnesses-v23.png", "still", fixed_seconds=4.595),
    Scene("iExile Ghost Map", "13-iexile-ghost-map-v23.png", "still", fixed_seconds=5.024),
    Scene("iExile Recovery Receipt", "14-iexile-receipt-v23.png", "still", fixed_seconds=7.941),
    Scene("Pathfinder reveal", "03-pathfinder-returned-v23.png", "still", fixed_seconds=4.714),
    Scene(
        "Pathfinder live proof",
        "pathfinder-proof-v23.webm",
        "video",
        fixed_seconds=46.929,
        source_start_seconds=1.500,
    ),
    Scene("Title witness", "04-pathfinder-title-seam-v23.png", "still", fixed_seconds=2.400),
    Scene("Known absence", "05-pathfinder-missing-seams-v23.png", "still", fixed_seconds=2.800),
    Scene("Ghost Map", "06-pathfinder-ghost-map-v23.png", "still", fixed_seconds=2.900),
    Scene("Supported 2001 edition", "07-pathfinder-timeline-2001-v23.png", "still", fixed_seconds=2.700),
    Scene("Witnesses", "08-pathfinder-witnesses-24-v23.png", "still", fixed_seconds=3.000),
    Scene("Mechanical receipt", "10-pathfinder-receipt-v23.png", "still", fixed_seconds=4.057),
    Scene("Closing invocation", "00-landing-v23.png", "still", weight=1.0),
)


def fail(message: str) -> "None":
    raise SystemExit(f"final-demo-v23: {message}")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def portable_report_path(path: Path, stage: Path) -> str:
    """Record artifact identity without exposing the operator's workstation path."""
    try:
        return path.relative_to(stage).as_posix()
    except ValueError:
        return path.name


def find_audio(stage: Path) -> Path:
    candidates = (
        "final-narration-v23.wav",
        "final-narration-v23-normalized.wav",
        "final-narration-v23.m4a",
        "final-narration-v23.mp3",
    )
    for name in candidates:
        candidate = stage / name
        if candidate.is_file():
            return candidate
    fail("missing narration; expected " + ", ".join(str(stage / name) for name in candidates))


def find_captions(stage: Path) -> Path:
    for name in DEFAULT_CAPTION_CANDIDATES:
        candidate = stage / name
        if candidate.is_file():
            return candidate
    fail(
        "missing captions; expected "
        + ", ".join(str(stage / name) for name in DEFAULT_CAPTION_CANDIDATES)
    )


def find_ffmpeg(explicit: Path | None) -> Path:
    candidates: list[Path] = []
    if explicit:
        candidates.append(explicit)
    if os.environ.get("ALEXANDRIA_FFMPEG"):
        candidates.append(Path(os.environ["ALEXANDRIA_FFMPEG"]))
    candidates.append(BUNDLED_FFMPEG)
    on_path = shutil.which("ffmpeg")
    if on_path:
        candidates.append(Path(on_path))
    for candidate in candidates:
        if candidate.is_file():
            return candidate.resolve()
    fail("FFmpeg not found; pass --ffmpeg or set ALEXANDRIA_FFMPEG")


def run(command: list[str], *, allow_failure: bool = False) -> subprocess.CompletedProcess[str]:
    result = subprocess.run(command, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if result.returncode and not allow_failure:
        sys.stderr.write(result.stdout)
        sys.stderr.write(result.stderr)
        fail(f"command failed with exit code {result.returncode}: {command[0]}")
    return result


def media_duration(ffmpeg: Path, path: Path) -> float:
    result = run([str(ffmpeg), "-hide_banner", "-i", str(path)], allow_failure=True)
    match = re.search(r"Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)", result.stderr + result.stdout)
    if not match:
        fail(f"could not read media duration: {path}")
    hours, minutes, seconds = match.groups()
    return int(hours) * 3600 + int(minutes) * 60 + float(seconds)


def parse_timestamp(value: str) -> float:
    match = re.fullmatch(r"(\d{2}):(\d{2}):(\d{2})\.(\d{3})", value.strip())
    if not match:
        fail(f"invalid WebVTT timestamp: {value}")
    hours, minutes, seconds, milliseconds = (int(part) for part in match.groups())
    return hours * 3600 + minutes * 60 + seconds + milliseconds / 1000


def validate_captions(path: Path, audio_seconds: float) -> dict[str, float | int]:
    text = path.read_text(encoding="utf-8-sig")
    if not text.lstrip().startswith("WEBVTT"):
        fail(f"captions are not WebVTT: {path}")
    cues = re.findall(
        r"(?m)^(\d{2}:\d{2}:\d{2}\.\d{3})\s+-->\s+(\d{2}:\d{2}:\d{2}\.\d{3})(?:\s+.*)?$",
        text,
    )
    if not cues:
        fail(f"captions contain no timed cues: {path}")
    previous_end = 0.0
    for start_text, end_text in cues:
        start = parse_timestamp(start_text)
        end = parse_timestamp(end_text)
        if end <= start:
            fail(f"caption cue does not advance: {start_text} --> {end_text}")
        if start < previous_end - 0.001:
            fail(f"caption cues overlap: {start_text} begins before {previous_end:.3f}s")
        previous_end = end
    if previous_end > audio_seconds + 0.75:
        fail(f"captions end at {previous_end:.3f}s, after narration ends at {audio_seconds:.3f}s")
    return {"cue_count": len(cues), "last_cue_seconds": round(previous_end, 3)}


def caption_payload(path: Path) -> str:
    payload: list[str] = []
    for line in path.read_text(encoding="utf-8-sig").splitlines():
        stripped = line.strip()
        if (
            not stripped
            or stripped == "WEBVTT"
            or "-->" in stripped
            or stripped.isdecimal()
            or stripped.startswith(("NOTE", "STYLE", "REGION"))
        ):
            continue
        payload.append(stripped)
    return re.sub(r"\s+", " ", " ".join(payload)).strip()


def allocate_durations(
    ffmpeg: Path, stage: Path, target_seconds: float
) -> tuple[list[float], dict[str, dict[str, float | str]]]:
    video_durations: dict[str, float] = {}
    video_audit: dict[str, dict[str, float | str]] = {}
    fixed_seconds = 0.0
    flexible_weight = 0.0
    for scene in SCENES:
        source = stage / scene.filename
        if not source.is_file():
            fail(f"missing scene source: {source}")
        if scene.kind == "video":
            source_duration = media_duration(ffmpeg, source)
            if source_duration <= 1.0:
                fail(f"live recording is unexpectedly short: {source} ({source_duration:.3f}s)")
            if scene.source_start_seconds < 0:
                fail(f"live recording has a negative source start: {source}")
            edit_duration = scene.fixed_seconds if scene.fixed_seconds is not None else source_duration
            source_end = scene.source_start_seconds + edit_duration
            if source_end > source_duration + 0.02:
                fail(
                    f"requested live edit exceeds its source: {source} "
                    f"({scene.source_start_seconds:.3f}s + {edit_duration:.3f}s "
                    f"> {source_duration:.3f}s)"
                )
            video_durations[scene.filename] = edit_duration
            edit_kind = []
            if scene.source_start_seconds > 0.001:
                edit_kind.append("head-trim")
            if source_end < source_duration - 0.02:
                edit_kind.append("tail-trim")
            video_audit[scene.filename] = {
                "source_seconds": round(source_duration, 3),
                "source_start_seconds": round(scene.source_start_seconds, 3),
                "source_end_seconds": round(source_end, 3),
                "edit_seconds": round(edit_duration, 3),
                "edit": "+".join(edit_kind) if edit_kind else "full-source",
            }
            fixed_seconds += edit_duration
        elif scene.fixed_seconds is not None:
            fixed_seconds += scene.fixed_seconds
        else:
            flexible_weight += scene.weight

    still_pool = target_seconds - fixed_seconds
    if still_pool <= 0 or flexible_weight <= 0:
        fail("narration is too short for the two uncut live browser journeys")
    durations = [
        video_durations[scene.filename]
        if scene.kind == "video"
        else scene.fixed_seconds
        if scene.fixed_seconds is not None
        else still_pool * scene.weight / flexible_weight
        for scene in SCENES
    ]
    shortest_still = min(duration for scene, duration in zip(SCENES, durations) if scene.kind == "still")
    if shortest_still < 2.25:
        fail(
            f"narration is too short to keep dense evidence views legible "
            f"(shortest still would be {shortest_still:.2f}s)"
        )
    composed = sum(durations)
    if abs(composed - target_seconds) > 0.02:
        fail(f"composition clock drifted: expected {target_seconds:.3f}s, got {composed:.3f}s")
    return durations, video_audit


def allocate_frames(durations: list[float], target_seconds: float) -> list[int]:
    """Quantize scene clocks once so per-input rounding cannot shorten the film."""
    target_frames = round(target_seconds * FPS)
    raw = [duration * FPS for duration in durations]
    frames = [int(value) for value in raw]
    remaining = target_frames - sum(frames)
    if remaining < 0:
        fail("frame allocation exceeded the target film clock")
    order = sorted(range(len(raw)), key=lambda index: raw[index] - frames[index], reverse=True)
    for index in order[:remaining]:
        frames[index] += 1
    if sum(frames) != target_frames or any(count <= 0 for count in frames):
        fail("frame allocation did not resolve the exact target clock")
    return frames


def ffmpeg_command(
    ffmpeg: Path,
    stage: Path,
    audio: Path,
    captions: Path,
    output: Path,
    frames: list[int],
    target_seconds: float,
) -> tuple[list[str], str]:
    command = [str(ffmpeg), "-hide_banner", "-y"]
    for scene in SCENES:
        source = stage / scene.filename
        if scene.kind == "still":
            command.extend(["-loop", "1", "-framerate", str(FPS)])
        command.extend(["-i", str(source)])

    audio_index = len(SCENES)
    captions_index = audio_index + 1
    command.extend(["-i", str(audio), "-i", str(captions)])

    filters: list[str] = []
    for index, (scene, frame_count) in enumerate(zip(SCENES, frames)):
        source_trim = ""
        if scene.kind == "video" and scene.source_start_seconds > 0.001:
            source_trim = (
                f"trim=start={scene.source_start_seconds:.3f},setpts=PTS-STARTPTS,"
            )
        filters.append(
            f"[{index}:v]"
            f"scale={WIDTH}:{HEIGHT}:force_original_aspect_ratio=increase,"
            f"crop={WIDTH}:{HEIGHT},{source_trim}fps={FPS},"
            f"settb=expr=1/{FPS},setsar=1,trim=end_frame={frame_count},"
            f"setpts=N/({FPS}*TB),format=yuv420p[s{index}]"
        )

    scene_inputs = "".join(f"[s{index}]" for index in range(len(SCENES)))
    filters.append(f"{scene_inputs}concat=n={len(SCENES)}:v=1:a=0[vbase]")
    target_frames = sum(frames)
    # Every scene was quantized under one shared largest-remainder allocation.
    # The final trim is defensive: input-local rounding can no longer accumulate
    # into the half-second video-track contraction caught by the media audit.
    filters.append(
        f"[vbase]trim=end_frame={target_frames},setpts=N/({FPS}*TB)[vout]"
    )

    filters.append(
        f"[{audio_index}:a]aresample={48000}:async=1:first_pts=0,"
        f"apad=pad_dur={TAIL_SECONDS:.3f},atrim=duration={target_seconds:.3f},"
        f"asetpts=PTS-STARTPTS[aout]"
    )
    filter_graph = ";".join(filters)
    command.extend(
        [
            "-filter_complex",
            filter_graph,
            "-map",
            "[vout]",
            "-map",
            "[aout]",
            "-map",
            f"{captions_index}:s:0",
            "-c:v",
            "libx264",
            "-preset",
            "slow",
            "-crf",
            "18",
            "-profile:v",
            "high",
            "-level:v",
            "4.1",
            "-pix_fmt",
            "yuv420p",
            "-r",
            str(FPS),
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            "-ar",
            "48000",
            "-ac",
            "1",
            "-c:s",
            "mov_text",
            "-metadata:s:s:0",
            "language=eng",
            "-metadata:s:s:0",
            "title=English",
            "-metadata",
            "title=Alexandria Here — A witnessed restoration engine",
            "-metadata",
            "comment=Synthetic narration; all recovered content remains source-witnessed.",
            "-movflags",
            "+faststart",
            "-threads",
            "4",
            "-t",
            f"{target_seconds:.3f}",
            str(output),
        ]
    )
    return command, filter_graph


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Compose the audited v23 live captures into the staged final Alexandria Here film."
    )
    parser.add_argument("--stage", type=Path, default=STAGE)
    parser.add_argument("--audio", type=Path)
    parser.add_argument("--captions", type=Path)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--ffmpeg", type=Path)
    parser.add_argument("--plan-only", action="store_true", help="Validate inputs and write the plan without encoding.")
    args = parser.parse_args()

    stage = args.stage.resolve()
    audio = args.audio.resolve() if args.audio else find_audio(stage).resolve()
    captions = args.captions.resolve() if args.captions else find_captions(stage).resolve()
    output = args.output.resolve()
    ffmpeg = find_ffmpeg(args.ffmpeg.resolve() if args.ffmpeg else None)

    if not stage.is_dir():
        fail(f"staging directory does not exist: {stage}")
    if not audio.is_file():
        fail(f"narration does not exist: {audio}")
    if not captions.is_file():
        fail(f"captions do not exist: {captions}")
    if output.parent != stage:
        fail("output must remain inside the staging directory")

    audio_seconds = media_duration(ffmpeg, audio)
    target_seconds = audio_seconds + TAIL_SECONDS
    if target_seconds < MINIMUM_FILM_SECONDS:
        fail(f"narration is too short ({audio_seconds:.3f}s); expected at least {MINIMUM_FILM_SECONDS - TAIL_SECONDS:.1f}s")
    if target_seconds > MAXIMUM_FILM_SECONDS:
        fail(f"film would exceed the 177-second submission ceiling ({target_seconds:.3f}s)")

    caption_summary = validate_captions(captions, audio_seconds)
    durations, video_audit = allocate_durations(ffmpeg, stage, target_seconds)
    frames = allocate_frames(durations, target_seconds)
    command, filter_graph = ffmpeg_command(
        ffmpeg, stage, audio, captions, output, frames, target_seconds
    )

    sources = sorted({(stage / scene.filename).resolve() for scene in SCENES})
    inputs = sources + [audio, captions]
    report = {
        "schema": "alexandria-final-composition/v1",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "status": "planned" if args.plan_only else "encoding",
        "stage": stage.name,
        "output": portable_report_path(output, stage),
        "format": {
            "width": WIDTH,
            "height": HEIGHT,
            "fps": FPS,
            "video_codec": "H.264 High",
            "audio_codec": "AAC-LC",
            "audio_sample_rate_hz": 48000,
            "audio_channels": 1,
            "caption_codec": "mov_text",
        },
        "clock": {
            "narration_seconds": round(audio_seconds, 3),
            "tail_seconds": TAIL_SECONDS,
            "film_seconds": round(target_seconds, 3),
            "video_frames": sum(frames),
            "video_seconds": round(sum(frames) / FPS, 3),
            "transition": "hard-cut",
        },
        "captions": caption_summary,
        "live_recordings": video_audit,
        "scenes": [],
        "inputs": [
            {
                "path": portable_report_path(path, stage),
                "bytes": path.stat().st_size,
                "sha256": sha256(path),
            }
            for path in inputs
        ],
        "ffmpeg": ffmpeg.name,
        "filter_graph": filter_graph,
    }
    scene_clock = 0.0
    for index, (scene, duration, frame_count) in enumerate(zip(SCENES, durations, frames), start=1):
        frame_seconds = frame_count / FPS
        report["scenes"].append(
            {
                "index": index,
                "name": scene.name,
                "source": scene.filename,
                "kind": scene.kind,
                "target_start_seconds": round(sum(durations[: index - 1]), 3),
                "target_end_seconds": round(sum(durations[:index]), 3),
                "start_seconds": round(scene_clock, 3),
                "end_seconds": round(scene_clock + frame_seconds, 3),
                "duration_seconds": round(frame_seconds, 3),
                "frames": frame_count,
            }
        )
        scene_clock += frame_seconds
    report_path = stage / "final-composition-plan-v23.json"
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")

    if args.plan_only:
        print(json.dumps({"status": "planned", "report": str(report_path), "duration": target_seconds}, indent=2))
        return

    output.unlink(missing_ok=True)
    run(command)
    run([str(ffmpeg), "-v", "error", "-i", str(output), "-f", "null", "-"])
    embedded_captions = stage / "final-captions-embedded-v23.vtt"
    embedded_captions.unlink(missing_ok=True)
    run(
        [
            str(ffmpeg),
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-i",
            str(output),
            "-map",
            "0:s:0",
            "-c:s",
            "webvtt",
            str(embedded_captions),
        ]
    )
    if caption_payload(embedded_captions) != caption_payload(captions):
        fail("embedded caption transcript differs from the audited WebVTT source")
    rendered_seconds = media_duration(ffmpeg, output)
    if abs(rendered_seconds - target_seconds) > 0.20:
        fail(f"rendered duration drifted: expected {target_seconds:.3f}s, got {rendered_seconds:.3f}s")

    report["status"] = "complete"
    report["rendered"] = {
        "path": portable_report_path(output, stage),
        "bytes": output.stat().st_size,
        "sha256": sha256(output),
        "duration_seconds": round(rendered_seconds, 3),
        "render_state": "rendered-and-decoded",
        "full_decode": "pass",
        "embedded_captions": {
            "path": portable_report_path(embedded_captions, stage),
            "sha256": sha256(embedded_captions),
            "transcript_parity": "pass",
        },
    }
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": report["status"], "output": str(output), "report": str(report_path)}, indent=2))


if __name__ == "__main__":
    main()
