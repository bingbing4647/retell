# -*- coding: utf-8 -*-
"""
把 lib/parts/*.json（分批产出）校验后合并进 lib/lessons.json。

用法：
    python scripts/merge-lessons.py          # 校验 + 合并
    python scripts/merge-lessons.py --check  # 只校验不写盘

校验项：必填字段、9 格且序号连续、12 个词、图片文件真实存在且不是空文件、
英文句子长度合理、key 里的词确实出现在 en 里。
"""
import json, os, sys, glob, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PARTS = os.path.join(ROOT, "lib", "parts")
TARGET = os.path.join(ROOT, "lib", "lessons.json")
PUBLIC = os.path.join(ROOT, "public")

REQUIRED = ["id", "season", "episode", "title", "titleCn", "hook", "cover", "cells", "words", "opener", "ending"]
CELL_REQUIRED = ["no", "time", "img", "t", "en", "cn", "key"]

errors, warns = [], []


def check_lesson(lid, d, path):
    for k in REQUIRED:
        if k not in d:
            errors.append(f"{lid}: 缺字段 {k}")
    if d.get("id") != lid:
        errors.append(f"{lid}: id 字段({d.get('id')}) 与文件名不一致")

    cells = d.get("cells", [])
    if len(cells) != 9:
        errors.append(f"{lid}: cells 有 {len(cells)} 条，应为 9")
    for i, c in enumerate(cells, 1):
        for k in CELL_REQUIRED:
            if k not in c:
                errors.append(f"{lid} 第{i}格: 缺字段 {k}")
        if c.get("no") != i:
            errors.append(f"{lid} 第{i}格: no={c.get('no')} 序号错位")
        en = c.get("en", "")
        n = len(en.split())
        if n < 6 or n > 22:
            warns.append(f"{lid} 第{i}格: 英文 {n} 词（建议 8-14）: {en[:50]}")
        if c.get("t") and c.get("en") and c["t"].lower() in c["en"].lower():
            warns.append(f"{lid} 第{i}格: 标题与句子重复: {c['t']}")
        img = c.get("img", "")
        fp = os.path.join(PUBLIC, img.lstrip("/"))
        if not img:
            errors.append(f"{lid} 第{i}格: img 为空")
        elif not os.path.exists(fp):
            errors.append(f"{lid} 第{i}格: 图片不存在 {img}")
        elif os.path.getsize(fp) < 4000:
            errors.append(f"{lid} 第{i}格: 图片过小 {os.path.getsize(fp)}B")
        # key 里每个词应出现在 en 中
        for kw in [x.strip() for x in c.get("key", "").split("·") if x.strip()]:
            if kw.lower() not in en.lower():
                warns.append(f"{lid} 第{i}格: key「{kw}」未出现在句子里")

    words = d.get("words", [])
    if len(words) != 12:
        warns.append(f"{lid}: words 有 {len(words)} 组，建议 12")
    for w in words:
        if not (isinstance(w, list) and len(w) == 2):
            errors.append(f"{lid}: words 格式错误 {w}")

    for k in ("opener", "ending"):
        if len(d.get(k, "")) < 10:
            errors.append(f"{lid}: {k} 过短")


def main():
    check_only = "--check" in sys.argv
    parts = sorted(glob.glob(os.path.join(PARTS, "*.json")))
    if not parts:
        print("没有待合并的分片")
        return

    incoming = {}
    for p in parts:
        lid = os.path.splitext(os.path.basename(p))[0]
        try:
            with open(p, encoding="utf-8") as f:
                d = json.load(f)
        except Exception as e:
            errors.append(f"{lid}: JSON 解析失败 {e}")
            continue
        check_lesson(lid, d, p)
        incoming[lid] = d

    with open(TARGET, encoding="utf-8") as f:
        merged = json.load(f)
    before = len(merged)
    merged.update(incoming)

    # 按季、集排序
    def key(k):
        return int(k[1:3]) * 1000 + int(k[4:])
    merged = {k: merged[k] for k in sorted(merged, key=key)}

    print(f"分片 {len(incoming)} 集 → 合并后共 {len(merged)} 集（原 {before} 集）")
    if errors:
        print(f"\n错误 {len(errors)} 条：")
        for e in errors:
            print("  ✗", e)
    if warns:
        print(f"\n提醒 {len(warns)} 条：")
        for w in warns[:40]:
            print("  !", w)
        if len(warns) > 40:
            print(f"  ... 还有 {len(warns) - 40} 条")

    if errors:
        print("\n存在错误，未写入 lessons.json")
        sys.exit(1)

    if not check_only:
        with open(TARGET, "w", encoding="utf-8") as f:
            json.dump(merged, f, ensure_ascii=False, indent=2)
        print(f"\n✓ 已写入 {TARGET}（{len(merged)} 集）")


if __name__ == "__main__":
    main()
