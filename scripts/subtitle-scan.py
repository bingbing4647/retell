# -*- coding: utf-8 -*-
"""全片字幕时间轴扫描：按固定间隔抽字幕带 -> OCR -> 时间轴 JSON。

用法:
  python scripts/subtitle-scan.py S05E04 S05E07    # 扫指定集（每 15 秒一帧）
  python scripts/subtitle-scan.py S05E04 --step 10 # 自定义间隔秒

产物: tmp/sub_<ID>.json  [{t: 秒, text: "..."}...]
"""
import json
import os
import re
import subprocess
import sys

import cv2
import numpy as np

SITE = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
ROOT = os.path.abspath(os.path.join(SITE, ".."))
TMP = os.path.join(SITE, "tmp")
BAND_TOP = 0.84


def find_src(eid):
    s = int(eid[1:3])
    d = os.path.join(ROOT, "朵拉爱冒险-Season %02d" % s)
    for fn in os.listdir(d):
        if fn.upper().startswith(eid + "_") or fn.upper() == eid + ".MP4":
            return os.path.join(d, fn)
    raise SystemExit("找不到片源 " + eid)


def dur(p):
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                        "-of", "csv=p=0", p], capture_output=True, text=True)
    return float(r.stdout.strip())


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    step = 15
    for a in sys.argv[1:]:
        if a.startswith("--step"):
            step = int(a.split("=")[1]) if "=" in a else int(sys.argv[sys.argv.index(a) + 1])
    from rapidocr_onnxruntime import RapidOCR
    engine = RapidOCR()

    for eid in args:
        eid = eid.upper()
        dst = os.path.join(TMP, "sub_%s.json" % eid)
        if os.path.exists(dst) and os.path.getsize(dst) > 100:
            print("skip", eid)
            continue
        src = find_src(eid)
        total = dur(src)
        n = int(total // step)
        workdir = os.path.join(TMP, "bands_%s" % eid)
        os.makedirs(workdir, exist_ok=True)
        subprocess.run(
            ["ffmpeg", "-nostdin", "-loglevel", "error", "-i", src,
             "-vf", "fps=1/%d,scale=768:576,crop=768:92:0:%d" % (step, int(576 * BAND_TOP)),
             "-q:v", "3", "-y", os.path.join(workdir, "b%05d.jpg")],
            check=True)
        tl = []
        files = sorted(os.listdir(workdir))
        for i, fn in enumerate(files):
            p = os.path.join(workdir, fn)
            im = cv2.imdecode(np.fromfile(p, dtype=np.uint8), cv2.IMREAD_COLOR)
            if im is None:
                continue
            im = cv2.resize(im, None, fx=2.0, fy=2.0, interpolation=cv2.INTER_CUBIC)
            gray = cv2.cvtColor(im, cv2.COLOR_BGR2GRAY)
            gray = cv2.convertScaleAbs(gray, alpha=1.6, beta=-40)
            result, _ = engine(gray)
            text = " ".join(r[1] for r in result).strip() if result else ""
            text = re.sub(r"\s+", " ", text)
            tl.append({"t": (i + 1) * step, "text": text})
        with open(dst, "w", encoding="utf-8") as f:
            json.dump(tl, f, ensure_ascii=False, indent=0)
        # 清理带图目录
        for fn in files:
            os.remove(os.path.join(workdir, fn))
        os.rmdir(workdir)
        print("done %s: %d 帧字幕 -> %s" % (eid, len(tl), dst))


if __name__ == "__main__":
    main()
