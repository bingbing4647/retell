# -*- coding: utf-8 -*-
"""逐集字幕时间轴：抽带 + OCR 一体（单进程，每集全新目录，杜绝混帧）。

用法:
  python scripts/scan-ep.py S05E05 S05E09 --step=20
"""
import json
import os
import re
import shutil
import subprocess
import sys

import cv2
import numpy as np

SITE = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
ROOT = os.path.abspath(os.path.join(SITE, ".."))
TMP = os.path.join(SITE, "tmp")
BAND_TOP = 0.84

_engine = None


def engine():
    global _engine
    if _engine is None:
        from rapidocr_onnxruntime import RapidOCR
        _engine = RapidOCR()
    return _engine


def find_src(eid):
    s = int(eid[1:3])
    d = os.path.join(ROOT, "朵拉爱冒险-Season %02d" % s)
    for fn in os.listdir(d):
        if fn.upper().startswith(eid + "_") or fn.upper() == eid + ".MP4":
            return os.path.join(d, fn)
    raise SystemExit("找不到片源 " + eid)


def ocr_file(p):
    im = cv2.imdecode(np.fromfile(p, dtype=np.uint8), cv2.IMREAD_COLOR)
    if im is None:
        return ""
    im = cv2.resize(im, None, fx=2.0, fy=2.0, interpolation=cv2.INTER_CUBIC)
    g = cv2.cvtColor(im, cv2.COLOR_BGR2GRAY)
    g = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8)).apply(g)
    r, _ = engine()(g)
    return re.sub(r"\s+", " ", " ".join(x[1] for x in r).strip()) if r else ""


def main():
    step = 20
    ids = []
    for a in sys.argv[1:]:
        if a.startswith("--step"):
            step = int(a.split("=")[1])
        else:
            ids.append(a.upper())
    for eid in ids:
        dst = os.path.join(TMP, "sub_%s.json" % eid)
        if os.path.exists(dst) and os.path.getsize(dst) > 200:
            print("skip", eid, flush=True)
            continue
        work = os.path.join(TMP, "b_%s_%d" % (eid, step))
        shutil.rmtree(work, ignore_errors=True)
        os.makedirs(work, exist_ok=True)
        src = find_src(eid)
        subprocess.run(
            ["ffmpeg", "-nostdin", "-loglevel", "error", "-i", src,
             "-vf", "fps=1/%d,scale=768:576,crop=768:92:0:%d" % (step, int(576 * BAND_TOP)),
             "-q:v", "3", "-y", os.path.join(work, "b%05d.jpg")],
            check=True)
        files = sorted(f for f in os.listdir(work) if f.endswith(".jpg"))
        rows = []
        for i, fn in enumerate(files, 1):
            rows.append({"t": i * step, "text": ocr_file(os.path.join(work, fn))})
            if i % 25 == 0:
                print("  %s %d/%d" % (eid, i, len(files)), flush=True)
        with open(dst, "w", encoding="utf-8") as f:
            json.dump(rows, f, ensure_ascii=False, indent=0)
        print("done %s %d 帧（有字幕 %d）" % (eid, len(rows), sum(1 for x in rows if x["text"])), flush=True)
        # 不删临时带图目录：批量删 >50 文件会被 safe-delete 拦，留着不占多少空间


if __name__ == "__main__":
    main()
