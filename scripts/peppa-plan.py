#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
给佩奇每一集挑 9 个「剧情点」，产出选点候选表，供后续抽帧 + 写九宫格。

思路：字幕（srt）自带精确时间轴和英文台词，不必做 OCR。
  1. 丢掉片头固定台词（I'm Peppa Pig / This is my little brother...）和标题卡
  2. 剩下的台词按条数均分 9 段（对话密度不均，按条数分配比按时间靠谱）
  3. 每段挑一条「信息量高」的：词数 5–14、以句号问号结尾、不是纯感叹/拟声
  4. 后处理：相邻两格时间至少隔 12 秒，太近就顺延到下一条候选

产物：
  tmp/peppa/plan/<集号>.json    每格 {t, end, text, alt:[备选台词]}
  tmp/peppa/plan.md             全季总表（我用来逐集过一遍）

用法：
  python scripts/peppa-plan.py            # 全季
  python scripts/peppa-plan.py P01E09     # 单集
"""

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = Path(
    "F:/002-学习资料/001-育儿教育/03英语/曼琳妈妈/3-小猪佩奇/小猪佩奇-中英双字幕版第1季52集"
)
OUT = ROOT / "tmp" / "peppa" / "plan"

# 与 peppa-vocab.py 保持同一套字幕配对规则（按剧名，不按集号）
DROP_SRT = {"CE003 Best Friend  .srt"}
TITLE_ALIAS = {
    "The Sleepy Princess": "Sleepy Princess",
    "School Play": "The School Play",
}
SRT_BY_EP = {"P01E04": "CE003 Best Friend  .srt"}

# 片头固定台词（每集都一样，不能当剧情点）
INTRO_PAT = re.compile(
    r"^(i'?m peppa pig|this is my little brother,? george|this is mummy pig|"
    r"and this is daddy pig|peppa pig\.?)$",
    re.I,
)
CJK_RE = re.compile(r"[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]")
TIME_RE = re.compile(
    r"(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[,.](\d{3})"
)
WORD_RE = re.compile(r"[A-Za-z]+(?:'[A-Za-z]+)?")


def secs(h, m, s, ms):
    return int(h) * 3600 + int(m) * 60 + int(s) + int(ms) / 1000


def norm_title(s):
    t = re.sub(r"[^a-z0-9]+", "", s.lower().replace("’", "").replace("'", ""))
    return t[3:] if t.startswith("the") else t


def build_srt_map():
    eps = json.loads((ROOT / "lib" / "peppa" / "episodes.json").read_text(encoding="utf-8"))
    files = [p for p in SRC.glob("*.srt") if p.name not in DROP_SRT]
    by_title = {}
    for p in files:
        stem = p.stem
        m = re.match(r"^CE\d{3}\s+(.*)$", stem)
        if m:
            title = m.group(1)
        else:
            m = re.match(r"^Peppa\.Pig\.S\d+E\d+\.(.*)$", stem)
            title = m.group(1).replace(".", " ") if m else stem
        by_title.setdefault(norm_title(title), p)
    out = {}
    for e in eps:
        sp = SRT_BY_EP.get(e["id"])
        if sp and (SRC / sp).exists():
            out[e["id"]] = (e, SRC / sp)
            continue
        p = by_title.get(norm_title(TITLE_ALIAS.get(e["t"], e["t"])))
        if p:
            out[e["id"]] = (e, p)
    return out


def parse_srt(path):
    """返回 [{start, end, text}]，多行合并成一句。

    ★ 还要合并「被拆成两条 cue 的长句」：srt 里常见
        "Peppa and her family" / "are visiting Granny Pig and Grandpa Pig."
      后一条以小写字母开头，单看是残句，必须并回前一条。
    """
    raw = path.read_text(encoding="utf-8", errors="ignore").replace("\r\n", "\n")
    cues = []
    for block in re.split(r"\n\s*\n", raw):
        lines = [x.strip() for x in block.split("\n") if x.strip()]
        ti = next((i for i, x in enumerate(lines) if "-->" in x), None)
        if ti is None:
            continue
        m = TIME_RE.search(lines[ti])
        if not m:
            continue
        start = secs(*m.groups()[:4])
        end = secs(*m.groups()[4:])
        parts = [x for x in lines[ti + 1:] if not CJK_RE.search(x)]
        text = " ".join(parts).strip()
        if not text or not re.search(r"[A-Za-z]", text):
            continue
        cues.append({"start": start, "end": end, "text": text})

    merged = []
    for c in cues:
        prev = merged[-1] if merged else None
        if (
            prev
            and c["start"] - prev["end"] < 3.0
            and re.match(r"^[a-z]", c["text"])          # 首字母小写 → 上一句的续句
        ):
            prev["text"] += " " + c["text"]
            prev["end"] = c["end"]
            continue
        merged.append(c)
    return merged


def nwords(s):
    return len(WORD_RE.findall(s))


def score(c):
    """信息量打分：偏好 5–14 词、完整句。"""
    n = nwords(c["text"])
    s = 0
    if 5 <= n <= 14:
        s += 4
    elif 3 <= n <= 18:
        s += 2
    if c["text"].rstrip().endswith((".", "?", "!")):
        s += 2
    if c["text"][:1].isupper():
        s += 1
    if re.search(r"\b(is|are|was|can|has|have|like|love|want|go|do)\b", c["text"], re.I):
        s += 1
    if n < 3:
        s -= 3
    if re.fullmatch(r"[A-Za-z ]+!", c["text"]) and n <= 2:  # 单字喊叫
        s -= 2
    return s


def plan_episode(eid, path, n_cells=9):
    cues = [c for c in parse_srt(path) if c["start"] > 15]
    # 去掉片头/片尾的固定自我介绍（片尾会再念一遍，且常被合并成多句一行）
    clean = []
    for c in cues:
        t = re.sub(r"[^A-Za-z' ]", "", c["text"]).strip()
        if INTRO_PAT.match(t):
            continue
        if re.search(r"(i'?m peppa pig|this is my little brother|this is mummy pig|"
                     r"and this is daddy pig)", c["text"], re.I):
            continue
        clean.append(c)
    if len(clean) < n_cells * 2:
        return None

    # 丢掉最早 30 秒内单独出现的标题卡（"Gardening!" 这种一两个词）
    if clean and nwords(clean[0]["text"]) <= 2 and clean[0]["start"] < 30:
        clean = clean[1:]

    n = len(clean)
    cells = []
    for i in range(n_cells):
        lo = round(i * n / n_cells)
        hi = round((i + 1) * n / n_cells)
        seg = clean[lo:hi] or clean[lo:lo + 1]
        ranked = sorted(seg, key=score, reverse=True)
        pick = ranked[0]
        # 相邻格太近就换同段次优（或往后顺延）
        if cells and pick["start"] - cells[-1]["t"] < 12:
            for cand in ranked[1:]:
                if cand["start"] - cells[-1]["t"] >= 12:
                    pick = cand
                    break
            else:
                later = [c for c in clean if c["start"] - cells[-1]["t"] >= 12]
                if later:
                    pick = later[0]
        alts = [c["text"] for c in ranked[:3] if c is not pick]
        cells.append(
            {
                "no": i + 1,
                "t": pick["start"],
                "end": pick["end"],
                "text": pick["text"],
                "alt": alts,
            }
        )
    return {
        "id": eid,
        "title": None,
        "srt": path.name,
        "cells": cells,
    }


def hhmmss(t):
    return f"{int(t // 60):02d}:{int(t % 60):02d}"


def main():
    want = [x.upper() for x in sys.argv[1:]]
    srt_map = build_srt_map()
    OUT.mkdir(parents=True, exist_ok=True)
    lines = []
    for eid in sorted(srt_map):
        if want and eid not in want:
            continue
        ep, path = srt_map[eid]
        plan = plan_episode(eid, path)
        if not plan:
            print(f"{eid} 台词太少，跳过")
            continue
        plan["title"] = ep["t"]
        (OUT / f"{eid}.json").write_text(
            json.dumps(plan, ensure_ascii=False, indent=1), encoding="utf-8"
        )
        lines.append(f"\n## {eid} {ep['t']}")
        for c in plan["cells"]:
            lines.append(f"{c['no']}. [{hhmmss(c['t'])}] {c['text']}")
    (ROOT / "tmp" / "peppa" / "plan.md").write_text("\n".join(lines), encoding="utf-8")
    done = sum(1 for l in lines if l.lstrip().startswith("## "))
    print(f"完成 {done} 集 → {OUT}")
    print("总表： tmp/peppa/plan.md")


if __name__ == "__main__":
    main()
