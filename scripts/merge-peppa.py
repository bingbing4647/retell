#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
把 lib/peppa/parts/*.json（每集一个分片）合并成 lib/peppa/lessons.json，并做体检。

分片结构就是一集完整的课程对象（见 lib/peppa/parts/P01E01.json）。
之所以拆开：一集一个文件，改动只碰一个文件，也不会一次编辑几千行的巨型 JSON。

校验项（任一不过就报错退出，不写库）：
  - 9 格、no 连续 1..9、time/img 齐全
  - 剧照文件存在且 > 4KB
  - 每格 q 以 ? 结尾、a 至少 4 个词、cn 有中文、key 至少 2 个词
  - words 恰好 12 组 [en, cn]
  - helper 的 order / keywords / actions 三段都非空
  - opener / ending 非空

用法：
  python scripts/merge-peppa.py            # 合并
  python scripts/merge-peppa.py --check    # 只校验不写
"""

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PARTS = ROOT / "lib" / "peppa" / "parts"
OUT = ROOT / "lib" / "peppa" / "lessons.json"
IMG = ROOT / "public" / "img"

CJK = re.compile(r"[\u4e00-\u9fff]")
WORD = re.compile(r"[A-Za-z]+(?:'[A-Za-z]+)?")

errors = []


def err(eid, msg):
    errors.append(f"{eid}: {msg}")


def check(lesson):
    eid = lesson.get("id", "?")
    for k in ("id", "season", "episode", "title", "titleCn", "hook", "cover", "opener", "ending"):
        if not lesson.get(k):
            err(eid, f"缺字段 {k}")

    cells = lesson.get("cells") or []
    if len(cells) != 9:
        err(eid, f"格数 {len(cells)}，应为 9")
    for i, c in enumerate(cells, 1):
        if c.get("no") != i:
            err(eid, f"第 {i} 格 no={c.get('no')}")
        for k in ("time", "img", "t", "q", "a", "cn", "key"):
            if not c.get(k):
                err(eid, f"第 {i} 格缺 {k}")
        img = c.get("img") or ""
        p = ROOT / "public" / img.lstrip("/")
        if not p.exists():
            err(eid, f"第 {i} 格剧照不存在 {img}")
        elif p.stat().st_size < 4096:
            err(eid, f"第 {i} 格剧照过小 {img}")
        q = c.get("q") or ""
        if not q.endswith("?"):
            err(eid, f"第 {i} 格问句没问号：{q}")
        a = c.get("a") or ""
        if len(WORD.findall(a)) < 4:
            err(eid, f"第 {i} 格答句太短：{a}")
        if len(WORD.findall(a)) > 24:
            err(eid, f"第 {i} 格答句太长：{a}")
        if not CJK.search(c.get("cn") or ""):
            err(eid, f"第 {i} 格缺中文")
        keys = [x.strip().lower() for x in (c.get("key") or "").split("·") if x.strip()]
        if len(keys) < 2:
            err(eid, f"第 {i} 格 key 少于 2 个")
        # key 是"本格主题词"，可以出现在小标题 / 问句 / 答句任一处
        hay = f'{c.get("t", "")} {q} {a}'.lower()
        if keys and not any(k.split()[0] in hay for k in keys):
            err(eid, f"第 {i} 格 key 词在小标题/问答里都找不到：{c.get('key')}")

    words = lesson.get("words") or []
    if len(words) != 12:
        err(eid, f"词表 {len(words)} 个，应为 12")
    for w in words:
        if not (isinstance(w, list) and len(w) == 2 and w[0] and w[1]):
            err(eid, f"词表项格式不对：{w}")

    h = lesson.get("helper") or {}
    for k in ("order", "keywords", "actions"):
        if not h.get(k):
            err(eid, f"helper 缺 {k}")


def main():
    check_only = "--check" in sys.argv
    files = sorted(PARTS.glob("*.json"))
    if not files:
        sys.exit(f"没有分片：{PARTS}")

    lessons = {}
    for f in files:
        data = json.loads(f.read_text(encoding="utf-8"))
        if data.get("id") != f.stem:
            err(f.stem, f"文件名与 id 不一致（{data.get('id')}）")
        check(data)
        lessons[data["id"]] = data

    if errors:
        print(f"❌ {len(errors)} 处问题：")
        for e in errors[:40]:
            print("  ", e)
        if len(errors) > 40:
            print(f"   … 还有 {len(errors) - 40} 条")
        sys.exit(1)

    if check_only:
        print(f"✅ {len(lessons)} 集全部通过校验")
        return

    lessons = dict(sorted(lessons.items()))
    OUT.write_text(json.dumps(lessons, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"✅ 合并 {len(lessons)} 集 → {OUT}")


if __name__ == "__main__":
    main()
