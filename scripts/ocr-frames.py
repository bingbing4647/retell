# -*- coding: utf-8 -*-
"""OCR 读帧字幕：把 public/img/<id>/f*.jpg 底部字幕区的英文台词读出来。

用法:
  python scripts/ocr-frames.py S05E03            # 单集，打印
  python scripts/ocr-frames.py S05E03 S05E13 ... # 多集
  python scripts/ocr-frames.py S05E03 --json     # 输出 JSON（写 tmp/ocr_<ID>.json）

字幕在画面底部（约 y 86%-100%），先裁带再 2 倍放大，提高识别率。
"""
import json
import os
import sys

import cv2
import numpy as np

SITE = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
IMG = os.path.join(SITE, "public", "img")

# 底部字幕带（比例），Dora 字幕在约 88%-100%
BAND_TOP = 0.84


def ocr_cell(engine, path):
    im = cv2.imdecode(np.fromfile(path, dtype=np.uint8), cv2.IMREAD_COLOR)
    h, w = im.shape[:2]
    band = im[int(h * BAND_TOP):, :]
    band = cv2.resize(band, None, fx=2.0, fy=2.0, interpolation=cv2.INTER_CUBIC)
    # 字幕是白字带深描边，灰度 + 轻对比增强
    gray = cv2.cvtColor(band, cv2.COLOR_BGR2GRAY)
    gray = cv2.convertScaleAbs(gray, alpha=1.6, beta=-40)
    result, _ = engine(gray)
    if not result:
        return ""
    # 按置信度降序，拼接所有识别行
    lines = [r[1] for r in result]
    return " | ".join(lines).strip()


def main():
    from rapidocr_onnxruntime import RapidOCR
    engine = RapidOCR()
    as_json = "--json" in sys.argv
    ids = [a for a in sys.argv[1:] if not a.startswith("--")]
    for eid in ids:
        eid = eid.upper()
        d = os.path.join(IMG, eid.lower())
        out = {}
        for i in range(1, 10):
            p = os.path.join(d, "f%d.jpg" % i)
            out["f%d" % i] = ocr_cell(engine, p) if os.path.exists(p) else None
        if as_json:
            dst = os.path.join(SITE, "tmp", "ocr_%s.json" % eid)
            with open(dst, "w", encoding="utf-8") as f:
                json.dump(out, f, ensure_ascii=False, indent=1)
            print("json ->", dst)
        print("== %s ==" % eid)
        for k, v in out.items():
            print(" %s: %s" % (k, v))


if __name__ == "__main__":
    main()
