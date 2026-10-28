# -*- coding: utf-8 -*-
"""
把 public/pdf/SxxEyy.pdf 按季合并成「一本书」一样的整季 PDF。

一册的结构：
    封面（季名 + 九宫格剧照拼贴）
    目录（集号 / 剧名 / 中文名 / 页码，带引导点）
    正文（每集原 A4 页，页脚加「集号 · 剧名 …… 页码 / 总页数」）
    PDF 书签（封面 / 目录 / 每集，可跳转）
    文档属性（标题、作者、关键词）

用法：
    python scripts/merge-pdf.py            # 合并 + 写 manifest
    python scripts/merge-pdf.py --check    # 只校验不写盘
    python scripts/merge-pdf.py --season 2 # 只重做某一季

产物：
    public/pdf/season-XX.pdf
    public/pdf/manifest.json

依赖：pymupdf（PyMuPDF）
"""
import datetime
import json
import math
import os
import sys

import pymupdf as fitz

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PDF_DIR = os.path.join(ROOT, "public", "pdf")
IMG_DIR = os.path.join(ROOT, "public", "img")
LESSONS = os.path.join(ROOT, "lib", "lessons.json")

check_only = "--check" in sys.argv
only_season = None
if "--season" in sys.argv:
    idx = sys.argv.index("--season")
    if idx + 1 < len(sys.argv):
        only_season = int(sys.argv[idx + 1])

# ---------- 版式常量（A4 点值） ----------
W, H = 595.92, 842.88

ORANGE = (0.961, 0.510, 0.122)   # f5821f
ORANGE_SOFT = (0.996, 0.945, 0.890)
PURPLE = (0.482, 0.298, 0.627)   # 7b4ca0
TEAL = (0.0, 0.655, 0.627)
INK = (0.180, 0.141, 0.106)
INK2 = (0.337, 0.275, 0.227)
MUTED = (0.604, 0.533, 0.455)
PAPER = (1.0, 1.0, 1.0)          # 纯白：彩打省墨，避免整页米色底
WHITE = (1, 1, 1)

FONT_R = None
FONT_B = None


def load_fonts():
    """优先用系统里的等线（Deng），没有就退回 PyMuPDF 内置简体中文字体。"""
    global FONT_R, FONT_B
    reg = "C:/Windows/Fonts/Deng.ttf"
    bold = "C:/Windows/Fonts/Dengb.ttf"
    FONT_R = fitz.Font(fontfile=reg) if os.path.exists(reg) else fitz.Font("china-s")
    FONT_B = fitz.Font(fontfile=bold) if os.path.exists(bold) else FONT_R


class Pen:
    """按（颜色, 字重）分组写文字，避免每段都重复嵌字体。"""

    def __init__(self, page):
        self.page = page
        self.groups = {}

    def text(self, x, y, s, size=10, color=INK, bold=False):
        if not s:
            return 0
        key = (color, bold)
        tw = self.groups.get(key)
        if tw is None:
            tw = fitz.TextWriter(self.page.rect)
            self.groups[key] = tw
        font = FONT_B if bold else FONT_R
        tw.append((x, y), s, font=font, fontsize=size)
        return font.text_length(s, fontsize=size)

    def width(self, s, size=10, bold=False):
        font = FONT_B if bold else FONT_R
        return font.text_length(s, fontsize=size)

    def centered(self, cx, y, s, size=10, color=INK, bold=False):
        w = self.width(s, size, bold)
        return self.text(cx - w / 2, y, s, size, color, bold)

    def right(self, rx, y, s, size=10, color=INK, bold=False):
        w = self.width(s, size, bold)
        return self.text(rx - w, y, s, size, color, bold)

    def flush(self):
        for (color, _bold), tw in self.groups.items():
            if tw.text_rect is None:
                continue
            tw.write_text(self.page, color=color)


def new_page(doc):
    page = doc.new_page(width=W, height=H)
    page.draw_rect(page.rect, color=None, fill=PAPER)
    return page


def rule(page, y, x0, x1, color=ORANGE, width=1.2):
    page.draw_line(fitz.Point(x0, y), fitz.Point(x1, y), color=color, width=width)


# ---------- 封面 ----------
def build_cover(doc, season, sids, lessons, first_cell_imgs):
    page = new_page(doc)
    pen = Pen(page)

    page.draw_rect(fitz.Rect(0, 6, W, 8.4), color=None, fill=ORANGE)
    page.draw_rect(fitz.Rect(0, H - 8.4, W, H - 6), color=None, fill=ORANGE)

    pen.centered(W / 2, 62, "D O R A   T H E   E X P L O R E R", 9, ORANGE)
    pen.centered(W / 2, 78, "R E T E L L   W I T H   9   F R A M E S", 7.5, MUTED)

    pen.centered(W / 2, 132, "朵拉爱冒险", 44, PURPLE, bold=True)
    pen.centered(W / 2, 166, "九宫格英语复述", 19, INK2)
    pen.centered(
        W / 2, 192, f"Season {season} 合订本  ·  共 {len(sids)} 集", 12.5, ORANGE
    )

    rule(page, 210, W / 2 - 34, W / 2 + 34, ORANGE, 1.4)

    # 3×3 剧照拼贴
    cell_w, cell_h, gap = 148, 111, 9
    total_w = cell_w * 3 + gap * 2
    x0 = (W - total_w) / 2
    y0 = 232
    for n, img in enumerate(first_cell_imgs[:9]):
        r, c = divmod(n, 3)
        x = x0 + c * (cell_w + gap)
        y = y0 + r * (cell_h + gap)
        rect = fitz.Rect(x, y, x + cell_w, y + cell_h)
        if img and os.path.exists(img):
            try:
                page.insert_image(rect, filename=img, keep_proportion=False)
            except Exception:
                page.draw_rect(rect, color=None, fill=ORANGE_SOFT)
        else:
            page.draw_rect(rect, color=None, fill=ORANGE_SOFT)
        page.draw_rect(rect, color=WHITE, width=1.5)

    grid_bottom = y0 + cell_h * 3 + gap * 2

    pen.centered(W / 2, grid_bottom + 44, f"{len(sids)} 集 · {len(sids)} 张 A4 复述练习", 13, INK, bold=True)
    pen.centered(
        W / 2,
        grid_bottom + 66,
        "看完一集，看着九张图把故事讲一遍：先说短句，再连成一段。",
        10,
        MUTED,
    )

    # 「怎么用」小卡片，把封面下半页的空档填起来（白底描边，不铺底色）
    box = fitz.Rect(96, 690, W - 96, 786)
    page.draw_rect(box, color=(0.94, 0.88, 0.78), fill=None, width=0.8)
    steps = [
        ("1", "看完一集，翻到这集的九宫格"),
        ("2", "指着图说短句，再把九句连成一段"),
        ("3", "卡住了就照英文原句跟读两遍"),
    ]
    for k, (num, txt) in enumerate(steps):
        sy = 718 + k * 25
        page.draw_circle(fitz.Point(118, sy - 3.4), 7, color=None, fill=ORANGE)
        pen.centered(118, sy, num, 8.5, WHITE, bold=True)
        pen.text(134, sy, txt, 10, INK2)

    today = datetime.date.today()
    pen.centered(
        W / 2, H - 40, f"{today.year} 年 {today.month} 月 编  ·  retell.app.workbuddy.host", 8, MUTED
    )
    pen.flush()
    return page


# ---------- 目录 ----------
TOC_TITLE_H = 168
TOC_ROW_H = 21.5


def toc_rows_per_page(n):
    usable = H - TOC_TITLE_H - 70
    return max(1, int(usable // TOC_ROW_H)), usable


def build_toc_pages(doc, season, sids, lessons, start_page_no):
    """start_page_no：本画册第 1 页的物理页码（封面 = 1）。"""
    n = len(sids)
    per_page, _ = toc_rows_per_page(n)
    page_count = max(1, math.ceil(n / per_page))
    pages = []

    for p in range(page_count):
        page = new_page(doc)
        pen = Pen(page)
        page.draw_rect(fitz.Rect(0, 6, W, 8.4), color=None, fill=ORANGE)

        pen.text(56, 68, "C O N T E N T S", 9, ORANGE)
        title = "目录" if page_count == 1 else f"目录（{p + 1}/{page_count}）"
        pen.text(56, 104, title, 28, INK, bold=True)
        pen.text(56, 126, f"Season {season} · 共 {n} 集", 10.5, MUTED)
        rule(page, 142, 56, W - 56, (0.92, 0.88, 0.82), 0.9)

        chunk = sids[p * per_page : (p + 1) * per_page]
        y = TOC_TITLE_H
        for k, ep in enumerate(chunk):
            no = p * per_page + k + 1
            lesson = lessons[ep]
            page_no = start_page_no + (p * per_page + k)

            pen.text(56, y, f"{no:02d}", 9.5, ORANGE, bold=True)
            pen.text(84, y, ep, 9, MUTED)
            tw = pen.text(132, y, lesson["title"], 12, INK)
            cn = lesson.get("titleCn") or ""
            x_cn = 132 + tw + 10
            if cn:
                pen.text(x_cn, y, cn, 9.5, MUTED)

            # 引导点：从右侧内容后一点，到页码前
            right_edge = 132 + tw + (pen.width(cn, 9.5) + 10 if cn else 0)
            dot_start = min(right_edge + 10, W - 120)
            dot_end = W - 74
            if dot_end > dot_start:
                page.draw_line(
                    fitz.Point(dot_start, y - 2.5),
                    fitz.Point(dot_end, y - 2.5),
                    color=(0.78, 0.71, 0.62),
                    width=0.9,
                    dashes="[1 2.6] 0",
                )
            pen.right(W - 56, y, str(page_no), 10, INK2, bold=True)
            y += TOC_ROW_H

        pen.text(56, H - 46, "页码与正文页脚一致；PDF 阅读器左侧书签可直接跳转。", 8, MUTED)
        pen.flush()
        pages.append(page)

    return pages, page_count


# ---------- 正文页：原页缩进版心 + 页脚 ----------
BODY_MARGIN = 20      # 左右留白
BODY_TOP = 14         # 上留白


def place_episode(doc, src_path):
    """把单集 A4 原页按比例缩放后放进版心（原页底边已被「自评/家长签字」占满，不能直接压页脚）。"""
    src = fitz.open(src_path)
    page = new_page(doc)
    box = src[0].rect
    s = (W - 2 * BODY_MARGIN) / box.width
    tw_, th_ = box.width * s, box.height * s
    target = fitz.Rect(BODY_MARGIN, BODY_TOP, BODY_MARGIN + tw_, BODY_TOP + th_)
    page.show_pdf_page(target, src, 0)
    src.close()
    return page, target
def _base14_ok(s):
    """helv（Base14）用 WinAnsi 编码，编不出的字符就走嵌入字体。"""
    try:
        s.encode("cp1252")
    except UnicodeEncodeError:
        return False
    return True


def stamp_footer(page, ep, title, page_no, total_pages, body_bottom):
    """页脚：左侧集号+剧名，右侧「页码 / 总页数」，上方一条细线。"""
    y = min(body_bottom + 22, H - 20)
    size = 7.8
    color = (0.62, 0.56, 0.47)
    left = f"{ep}  ·  {title}"
    right = f"{page_no} / {total_pages}"
    rule(page, y - 11, BODY_MARGIN, W - BODY_MARGIN, (0.90, 0.86, 0.79), 0.6)
    if _base14_ok(left):
        page.insert_text((BODY_MARGIN, y), left, fontname="helv", fontsize=size, color=color)
    else:  # 标题里出现 Base14 编不出的字符时退回嵌入字体
        pen = Pen(page)
        pen.text(BODY_MARGIN, y, left, size, color)
        pen.flush()
    w = fitz.get_text_length(right, fontname="helv", fontsize=size)
    page.insert_text((W - BODY_MARGIN - w, y), right, fontname="helv", fontsize=size, color=color)


# ---------- 主流程 ----------
def main():
    load_fonts()

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
            r = fitz.open(p)
            pages = len(r)
            r.close()
        except Exception as e:  # noqa: BLE001
            problems.append(f"{i}: 打不开 ({e})")
            continue
        if pages != 1:
            problems.append(f"{i}: {pages} 页（应为 1）")
        episodes[i] = {"pages": pages, "bytes": os.path.getsize(p)}

    for season, sids in sorted(by_season.items()):
        if only_season is not None and season != only_season:
            continue
        sids = [i for i in sids if i in episodes]
        if not sids:
            problems.append(f"S{season}: 没有任何可用 PDF")
            continue

        out_path = os.path.join(PDF_DIR, f"season-{season:02d}.pdf")
        n = len(sids)
        # 封面 1 页 + 目录 N 页 + 正文 n 页
        per_page, _ = toc_rows_per_page(n)
        toc_pages = max(1, math.ceil(n / per_page))
        body_start = 1 + toc_pages + 1
        total_pages = toc_pages + 1 + n

        if not check_only:
            doc = fitz.open()

            # 封面用第一集的九张剧照
            first_id = sids[0].lower()
            imgs = [
                os.path.join(IMG_DIR, first_id, f"f{k}.jpg") for k in range(1, 10)
            ]
            build_cover(doc, season, sids, lessons, imgs)
            build_toc_pages(doc, season, sids, lessons, body_start)

            toc_items = [[1, "封面", 1]]
            toc_items.append([1, "目录", 2])

            for k, ep in enumerate(sids):
                page, target = place_episode(doc, os.path.join(PDF_DIR, ep + ".pdf"))
                page_no = body_start + k
                stamp_footer(page, ep, lessons[ep]["title"], page_no, total_pages, target.y1)
                toc_items.append([1, f"{ep} {lessons[ep]['title']}", page_no])

            doc.set_toc(toc_items)
            doc.set_metadata(
                {
                    "title": f"朵拉爱冒险 · 九宫格英语复述 · Season {season}（{n} 集）",
                    "author": "dora-retell",
                    "subject": "Dora the Explorer retell worksheets",
                    "keywords": "Dora, retell, 九宫格, 英语复述, 三年级",
                    "creator": "dora-retell",
                    "producer": "PyMuPDF",
                }
            )
            # Deng.ttf 整字库约 10 MB/字重，封面+目录直接嵌会白胖 20 MB；
            # 子集化只留实际用到的字形（正文的网页字体已带 AAAAAA+ 前缀，会被跳过）。
            try:
                doc.subset_fonts()
            except Exception as e:  # noqa: BLE001
                print(f"  ! S{season} 字体子集化失败（不影响正确性）：{e}")
            doc.save(out_path, garbage=4, deflate=True)
            doc.close()

        seasons[str(season)] = {
            "url": f"/pdf/season-{season:02d}.pdf",
            "episodes": n,
            "pages": total_pages,
            "bytes": os.path.getsize(out_path) if os.path.exists(out_path) else 0,
            "label": f"S{season}",
        }
        print(
            f"  S{season}: {n} 集 → {total_pages} 页"
            f"（封面 1 + 目录 {toc_pages} + 正文 {n}），"
            f"{seasons[str(season)]['bytes'] / 1048576:.1f} MB"
        )

    if not check_only:
        manifest = {"episodes": episodes, "seasons": seasons}
        # 只重做某一季时，别把其它季的记录抹掉
        if only_season is not None:
            mpath = os.path.join(PDF_DIR, "manifest.json")
            if os.path.exists(mpath):
                with open(mpath, encoding="utf-8") as f:
                    old = json.load(f)
                merged = old.get("seasons", {})
                merged.update(seasons)
                manifest = {"episodes": episodes or old.get("episodes", {}), "seasons": merged}
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


if __name__ == "__main__":
    main()
