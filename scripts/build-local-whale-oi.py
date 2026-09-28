"""Make local-only whale-style variations of user-supplied oi clips.

Input audio and rendered packs are private: keep them in ignored data/ or sounds/.
This is sound design (pitch, EQ and ambience), not a clone of a fan creator's voice.
Requires an FFmpeg executable passed through --ffmpeg.
"""

from argparse import ArgumentParser
from pathlib import Path
import subprocess


PROFILES = {
    "小鲸鱼-清亮": (
        "rubberband=pitch=1.19:formant=shifted:transients=smooth:detector=soft,"
        "highpass=f=170,lowpass=f=8500,equalizer=f=3300:t=q:w=1.3:g=2,"
        "acompressor=threshold=-18dB:ratio=1.7:attack=4:release=80,"
        "aecho=0.8:0.22:42:0.08,alimiter=limit=0.9"
    ),
    "小鲸鱼-软萌": (
        "rubberband=pitch=1.29:tempo=0.95:formant=shifted:transients=smooth:detector=soft,"
        "highpass=f=145,lowpass=f=6200,equalizer=f=420:t=q:w=1:g=1.5,"
        "acompressor=threshold=-21dB:ratio=2.2:attack=5:release=100,"
        "aecho=0.8:0.20:60:0.09,alimiter=limit=0.85"
    ),
    "小鲸鱼-水泡": (
        "rubberband=pitch=1.13:formant=shifted:transients=smooth:detector=soft,"
        "highpass=f=170,lowpass=f=7600,chorus=0.8:0.45:24:0.12:0.18:1.2,"
        "aecho=0.75:0.30:74:0.18,alimiter=limit=0.85"
    ),
}


def main():
    parser = ArgumentParser()
    parser.add_argument("--ffmpeg", required=True, type=Path)
    parser.add_argument("--source-dir", required=True, type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    args = parser.parse_args()
    sources = sorted(args.source_dir.glob("*.m4a"))
    if not sources:
        parser.error("source directory contains no m4a clips")
    if not args.ffmpeg.is_file():
        parser.error("FFmpeg executable was not found")
    for name, filters in PROFILES.items():
        target_dir = args.output_dir / name
        target_dir.mkdir(parents=True, exist_ok=True)
        for source in sources:
            target = target_dir / source.name
            command = [str(args.ffmpeg), "-hide_banner", "-loglevel", "error", "-y",
                       "-i", str(source), "-af", filters, "-ar", "44100", "-ac", "1",
                       "-c:a", "aac", "-b:a", "128k", str(target)]
            subprocess.run(command, check=True)
        print(f"{name}: {len(sources)} clips")


if __name__ == "__main__":
    main()
