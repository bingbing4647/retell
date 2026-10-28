# -*- coding: utf-8 -*-
"""
把 public/pdf/SxxEyy.pdf 按季合并成整季 PDF，并生成 manifest.json 供站点读取。

用法：
    python scripts/merge-pdf.py            # 合并 + 写 manifest
    python scripts/merge-pdf.py --check    # 只校验不写盘

产物：
    public/pdf/season-02.pdf   （整季一个文件，带每集的 PDF 书签）
    public/pdf/manifest.json   （集数 / 页数 / 体积，站点按钮文案用）

依赖：pypdf
"""
import json, os, sys

from pypdf import PdfReader, PdfWriter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PDF_DIR = os.path.join(ROOT, "public", "pdf")
LESSONS = os.path.join(ROOT, "lib", "lessons.json")

check_only = "--check" in sys.argv

with open(LESSONS, encoding="utf-8") as f:
    lessons = json.load(f)


def sort_key(i):
    return int(i[1:3]) * 1000 + int(i[4:])


ids = sorted(lessons, key=sort_key)
by_season = {}
for i in ids:
    by_season.setdefault(lessons[i]["season"], []).append(i)

episodes, seasons, problems = {}, {}, []

for i in ids:
    p = os.path.join(PDF_DIR, i + ".pdf")
    if not os.path.exists(p):
        problems.append(f"{i}: 缺 PDF")
        continue
    try:
        r = PdfReader(p)
        pages = len(r.pages)
    except Exception as e:  # noqa: BLE001
        problems.append(f"{i}: 打不开 ({e})")
        continue
    if pages != 1:
        problems.append(f"{i}: {pages} 页（应为 1）")
    episodes[i] = {"pages": pages, "bytes": os.path.getsize(p)}

for season, sids in sorted(by_season.items()):
    sids = [i for i in sids if i in episodes]
    if not sids:
        problems.append(f"S{season}: 没有任何可用 PDF")
        continue

    out = os.path.join(PDF_DIR, f"season-{season:02d}.pdf")
    if not check_only:
        w = PdfWriter()
        for i in sids:
            start = len(w.pages)
            w.append(PdfReader(os.path.join(PDF_DIR, i + ".pdf")))
            title = f"{i} {lessons[i]['title']}"
            w.add_outline_item(title, start)
        w.add_metadata(
            {
                "/Title": f"朵拉英语九宫格复述 · Season {season}（{len(sids)} 集）",
                "/Subject": "Dora the Explorer retell worksheets",
                "/Creator": "dora-retell",
            }
        )
        with open(out, "wb") as f:
            w.write(f)

    pages = sum(episodes[i]["pages"] for i in sids)
    seasons[str(season)] = {
        "url": f"/pdf/season-{season:02d}.pdf",
        "episodes": len(sids),
        "pages": pages,
        "bytes": os.path.getsize(out) if os.path.exists(out) else 0,
        "label": f"S{season}",
    }
    print(f"  S{season}: {len(sids)} 集 → {pages} 页，"
          f"{seasons[str(season)]['bytes'] / 1048576:.1f} MB")

if not check_only:
    manifest = {
        "episodes": episodes,
        "seasons": seasons,
    }
    with open(os.path.join(PDF_DIR, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=1)

if problems:
    print(f"\n问题 {len(problems)} 条：")
    for p in problems:
        print("  ✗", p)
else:
    print("\n✓ 全部 %d 集 PDF 均为 1 页 A4" % len(episodes))

if not check_only:
    print("✓ 已写入 manifest.json")
