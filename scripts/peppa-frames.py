#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
按 tmp/peppa/plan/<集号>.json 的时间点抽剧照，并拼 3×3 核对图。

裁切公式沿用第一季前三集（片源顶部有一行广告水印，y≈40–145，必须切掉）：
  crop=1920:930:0:150 → 去掉水印后的画幅 → 缩到 432 高 → 居中裁 768×432（16:9）
时间点取「台词起点 + 1.0 秒」，避开切镜的第一帧。

产物：
  public/img/<小写集号>/f1..f9.jpg
  tmp/peppa/chk/chk_<集号>.jpg        3×3 拼图（行优先 1,2,3 / 4,5,6 / 7,8,9）

用法：
  python scripts/peppa-frames.py             # 全部（已有 9 张的集自动跳过）
  python scripts/peppa-frames.py P01E09      # 单集
  python scripts/peppa-frames.py P01E09 --force
"""

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = Path(
    "F:/002-学习资料/001-育儿教育/03英语/曼琳妈妈/3-小猪佩奇/小猪佩奇-中英双字幕版第1季52集"
)
PLAN = ROOT / "tmp" / "peppa" / "plan"
IMG = ROOT / "public" / "img"
CHK = ROOT / "tmp" / "peppa" / "chk"

VF = "crop=1920:930:0:150,scale=-2:432,crop=768:432"


def grab_at(c):
    """取帧时刻：句子中点，但只要不超过 0.8 秒。
    短句（1 秒内）必须取中点，否则 +1 秒会跨到下一条字幕，画面就配错台词了。"""
    dur = max(0.1, c["end"] - c["t"])
    return c["t"] + min(0.8, dur / 2)


def ff(cmd):
    r = subprocess.run(cmd, capture_output=True)
    if r.returncode != 0:
        raise RuntimeError(r.stderr.decode("utf-8", "ignore")[-300:])


def grab(mp4, t, dest):
    ff([
        "ffmpeg", "-v", "error", "-ss", f"{t:.2f}", "-i", str(mp4),
        "-frames:v", "1", "-vf", VF, "-q:v", "3", "-y", str(dest),
    ])


def tile(paths, dest):
    """9 张图按行优先拼 3×3。本机 ffmpeg 不支持 -pattern_type glob，只能 9 个 -i。"""
    cmd = ["ffmpeg", "-v", "error"]
    for p in paths:
        cmd += ["-i", str(p)]
    cmd += [
        "-filter_complex",
        "".join(f"[{i}:v]" for i in range(9)) + "concat=n=9:v=1:a=0,tile=3x3,format=yuvj420p",
        "-frames:v", "1", "-q:v", "4", "-y", str(dest),
    ]
    ff(cmd)


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    force = "--force" in sys.argv
    want = [a.upper() for a in args]
    episodes = json.loads((ROOT / "lib" / "peppa" / "episodes.json").read_text(encoding="utf-8"))
    by_id = {e["id"]: e for e in episodes}
    CHK.mkdir(parents=True, exist_ok=True)

    done = skipped = 0
    for eid in sorted(p.name[:-5] for p in PLAN.glob("*.json")):
        if want and eid not in want:
            continue
        plan = json.loads((PLAN / f"{eid}.json").read_text(encoding="utf-8"))
        ep = by_id[eid]
        mp4 = SRC / ep["f"]
        if not mp4.exists():
            print(f"{eid} 找不到片源 {mp4.name}")
            continue

        outdir = IMG / eid.lower()
        files = [outdir / f"f{i}.jpg" for i in range(1, 10)]
        if not force and all(f.exists() and f.stat().st_size > 4096 for f in files):
            skipped += 1
            continue

        outdir.mkdir(parents=True, exist_ok=True)
        for c, dest in zip(plan["cells"], files):
            grab(mp4, grab_at(c), dest)
        tile(files, CHK / f"chk_{eid}.jpg")
        done += 1
        print(f"{eid} {ep['t']}  9 张 OK", flush=True)

    print(f"\n新抽 {done} 集，跳过 {skipped} 集（已有剧照）")


if __name__ == "__main__":
    main()
