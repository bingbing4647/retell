# -*- coding: utf-8 -*-
"""
压缩 public/pdf 里的单集 PDF：把内嵌剧照缩到 MAX_W 宽、重编码为 JPEG，
再把整季 PDF 重建一遍。

Chromium 打印时会把 768×576 的原图原样塞进 PDF，而它在纸面上只占约 60mm 宽，
一张图 ~60-70KB，整体偏大。缩到 480px（约 200dpi@60mm）肉眼看不出差别，
体积能降到 1/4 左右。

用法：
    python scripts/shrink-pdf.py            # 压缩所有单集 + 重建整季
    python scripts/shrink-pdf.py --dry-run  # 只报告能省多少
"""
import io
import json
import os
import subprocess
import sys

import pymupdf

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PDF_DIR = os.path.join(ROOT, "public", "pdf")
LESSONS = os.path.join(ROOT, "lib", "lessons.json")

MAX_W = int(os.environ.get("MAX_W", 480))
QUALITY = int(os.environ.get("QUALITY", 78))
DRY = "--dry-run" in sys.argv


def shrink(path):
    doc = pymupdf.open(path)
    touched = 0
    for page in doc:
        for img in page.get_images(full=True):
            xref, w, h = img[0], img[2], img[3]
            if w <= MAX_W:
                continue
            new_w = MAX_W
            new_h = max(1, round(h * MAX_W / w))
            pix = pymupdf.Pixmap(doc, xref)
            if pix.colorspace and pix.colorspace.n >= 4:  # CMYK → RGB
                pix = pymupdf.Pixmap(pymupdf.csRGB, pix)
            small = pymupdf.Pixmap(pix, new_w, new_h)
            data = small.tobytes("jpeg", jpg_quality=QUALITY)
            page.replace_image(xref, stream=data)
            touched += 1
    if not touched or DRY:
        doc.close()
        return touched, 0, 0

    before = os.path.getsize(path)
    buf = io.BytesIO()
    doc.save(buf, garbage=4, deflate=True, clean=True)
    doc.close()
    with open(path, "wb") as f:
        f.write(buf.getvalue())
    return touched, before, os.path.getsize(path)


def main():
    with open(LESSONS, encoding="utf-8") as f:
        lessons = json.load(f)

    ids = sorted(lessons, key=lambda i: int(i[1:3]) * 1000 + int(i[4:]))
    tot_b = tot_a = 0
    for i in ids:
        p = os.path.join(PDF_DIR, i + ".pdf")
        if not os.path.exists(p):
            continue
        n, b, a = shrink(p)
        tot_b += b
        tot_a += a
        if n:
            print(f"  {i}: {n} 图  {b/1024:.0f}KB → {a/1024:.0f}KB")

    if DRY:
        print(f"\n仅预演，未写盘")
        return

    print(f"\n单集合计 {tot_b/1048576:.1f} MB → {tot_a/1048576:.1f} MB")
    print("接下来重建整季 PDF：")
    # 注意：路径含中文，os.system 走 cmd 会因代码页丢字符，必须用 subprocess 传列表
    subprocess.run(
        [sys.executable, os.path.join(ROOT, "scripts", "merge-pdf.py")],
        check=False,
    )


if __name__ == "__main__":
    main()
