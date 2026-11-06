#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
统计小猪佩奇每集的「听力词汇量」指标，产出 lib/peppa/vocab.json。

口径（与朵拉的 vocab.json 对齐）：
  lemmas  本集用了多少个不同词元（lemmatize 后）
  running 一共说出口多少个词（token 总数）
  wpm     语速 = running / 时长(分钟)
  min     本集时长（分钟，含主题曲）
  covNk   假设孩子掌握最常用的 N 千词，本集能听懂的比例（%）
  curve   100、200 … 5000 词各档的覆盖率（50 档）
  need90/95  达到 90% / 95% 所需的词汇量（超过 5000 记 0）
  lines   字幕条数

覆盖率算法：把本集每个 token 归到词元，查通用词频表（google-10000-english，
按频率降序）里的排名 rank；rank <= N 视为孩子认识，覆盖率 = 认识 token / 全部 token。
只按"覆盖面"算，不做语法/句式难度加权 —— 与卡片上的文案一致。

用法：
  python scripts/peppa-vocab.py
"""

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = Path(
    "F:/002-学习资料/001-育儿教育/03英语/曼琳妈妈/3-小猪佩奇/小猪佩奇-中英双字幕版第1季52集"
)
OUT = ROOT / "lib" / "peppa" / "vocab.json"
ASR = ROOT / "tmp" / "peppa" / "asr"
FREQ = ROOT / "scripts" / "data" / "wordfreq-10k.txt"

# 字幕配对规则：片源目录里 52 个 srt，命名有两套（CE0NN Title / Peppa.Pig.S01EXX.Title），
# 两套的集号对不上（CE 那套是片源自己的顺序），所以一律按**剧名**配，不按编号。
# 实测 "CE003 Best Friend.srt" 里装的其实是 Polly Parrot 的台词，属于错位文件，直接丢弃。
DROP_SRT = {"CE003 Best Friend  .srt"}

# 剧名对不上（多了/少了 The 之外的差别）的个别文件，手工表态
TITLE_ALIAS = {
    "The Sleepy Princess": "Sleepy Princess",
    "School Play": "The School Play",
}

# 内容对得上的错名文件：这份 srt 名叫 Best Friend，装的其实是 Polly Parrot 的台词
SRT_BY_EP = {
    "P01E04": "CE003 Best Friend  .srt",
}

# 高频不规则词 → 原形；规则变化由 _lemma 处理
IRREGULAR = {
    "is": "be", "am": "be", "are": "be", "was": "be", "were": "be", "been": "be",
    "has": "have", "had": "have", "having": "have",
    "does": "do", "did": "do", "done": "do", "doing": "do",
    "went": "go", "gone": "go", "goes": "go",
    "said": "say", "says": "say",
    "got": "get", "gotten": "get",
    "made": "make", "came": "come", "saw": "see", "seen": "see",
    "took": "take", "taken": "take", "gave": "give", "given": "give",
    "found": "find", "thought": "think", "told": "tell",
    "children": "child", "feet": "foot", "mice": "mouse",
    "this": "this", "these": "this", "those": "that",
    "better": "good", "best": "good", "worse": "bad", "worst": "bad",
    "could": "can", "would": "will", "should": "shall", "must": "must",
    "everyone": "everyone", "goodbye": "goodbye",
}

TIME_RE = re.compile(r"(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[,.](\d{3})")
WORD_RE = re.compile(r"[a-z]+(?:'[a-z]+)?")
CJK_RE = re.compile(r"[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]")

# ASR（base.en）对佩奇专有名词的固定误识别，统计前统一归一
NORMALIZE = {
    "pepper": "peppa",
    "pappa": "peppa",
    "knepper": "peppa",
    "pummy": "mummy",
    "mobby": "mummy",
    "mummys": "mummy",
    "dady": "daddy",
    "suzie": "susie",
    "rebecker": "rebecca",
}

# 角色名 / 拟声词：孩子看两遍就认得，不该算作"听不懂的生词"。
# 词频表是按通用书面语排的，这些词要么不在表内、要么排得很后才被踩到。
NAMES = {
    "peppa", "george", "mummy", "daddy", "granny", "grandpa", "susie", "rebecca",
    "danny", "pedro", "zoe", "emily", "freddy", "candy", "richard", "chloe",
    "suzy", "gerald", "kylie", "molly", "abby", "edmond", "gazelle", "sigrid",
}

# 非台词：笑声、音乐、字幕标记
NOISE = {"laughter", "music", "applause", "sigh", "sighs", "gasps", "giggle",
         "giggles", "song", "singing", "theme", "applause"}


def load_freq():
    """词形 → 频率排名（1 起）；表外的词返回 None。"""
    rank = {}
    for i, w in enumerate(FREQ.read_text(encoding="utf-8").split(), 1):
        w = w.strip().lower()
        if w and w not in rank:
            rank[w] = i
    return rank


def secs(h, m, s, ms):
    return int(h) * 3600 + int(m) * 60 + int(s) + int(ms) / 1000


def parse_srt(path):
    """返回 (字幕条数, 时长秒, [英文文本行...])"""
    raw = path.read_text(encoding="utf-8", errors="ignore").replace("\r\n", "\n")
    blocks = re.split(r"\n\s*\n", raw)
    times, texts = [], []
    for b in blocks:
        lines = [x for x in b.split("\n") if x.strip()]
        if not lines:
            continue
        ti = next((i for i, x in enumerate(lines) if "-->" in x), None)
        if ti is None:
            continue
        m = TIME_RE.search(lines[ti])
        if not m:
            continue
        times.append((secs(*m.groups()[:4]), secs(*m.groups()[4:])))
        for line in lines[ti + 1:]:
            if CJK_RE.search(line):
                continue  # 中文轨丢掉
            if not re.search(r"[A-Za-z]", line):
                continue
            texts.append(line)
    if not times:
        return 0, 0.0, []
    return len(times), times[-1][1] - times[0][0], texts


def tokenize(lines):
    """分词 → 去非台词噪音 → 归一 ASR 误识别。"""
    toks = []
    for line in lines:
        s = line.replace("’", "'").replace("‘", "'").lower()
        for w in WORD_RE.findall(s):
            if w in NOISE:
                continue
            toks.append(NORMALIZE.get(w, w))
    return toks


def lemma(w):
    if w in IRREGULAR:
        return IRREGULAR[w]
    if "'" in w:  # don't / it's → 取主词
        w = w.split("'")[0]
    if len(w) <= 3:
        return w
    if w.endswith("ies") and len(w) > 4:
        return w[:-3] + "y"
    if w.endswith(("ses", "xes", "ches", "shes")):
        return w[:-2]
    if w.endswith("s") and not w.endswith(("ss", "us", "is")):
        return w[:-1]
    if w.endswith("ing") and len(w) > 5:
        base = w[:-3]
        if len(base) > 2 and base[-1] == base[-2]:  # running → run
            base = base[:-1]
        return base
    if w.endswith("ed") and len(w) > 4:
        base = w[:-2]
        if len(base) > 2 and base[-1] == base[-2]:
            base = base[:-1]
        return base
    return w


def load_lines(eid, srt_path):
    """字幕优先（人写的中英双轨，句子干净）；没有字幕就退回 ASR 转写。
    返回 (句子数, 时长秒, 文本行)。"""
    if srt_path and srt_path.exists():
        n, dur, lines = parse_srt(srt_path)
        if n:
            return n, dur, lines
    txt = ASR / f"{eid}.txt"
    meta = ASR / f"{eid}.json"
    if txt.exists() and txt.stat().st_size > 100:
        lines = [x for x in txt.read_text(encoding="utf-8").split("\n") if x.strip()]
        dur = 0.0
        if meta.exists():
            dur = float(json.loads(meta.read_text(encoding="utf-8"))["duration"])
        return len(lines), dur, lines
    return 0, 0.0, []


def norm_title(s):
    """剧名归一：只留字母数字，去掉开头的 the，方便两套命名互相匹配。"""
    t = re.sub(r"[^a-z0-9]+", "", s.lower().replace("’", "").replace("'", ""))
    if t.startswith("the"):
        t = t[3:]
    return t


def build_srt_map():
    """剧集 id → srt 路径。按剧名配对（两套文件命名 + 集号错位，见文件头注释）。"""
    eps = json.loads((ROOT / "lib" / "peppa" / "episodes.json").read_text(encoding="utf-8"))
    files = [p for p in SRC.glob("*.srt") if p.name not in DROP_SRT]

    # 文件名 → 剧名部分：CE001 Muddy Puddles  /  Peppa.Pig.S01E05.Hide.and.Seek
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

    out, missing = {}, []
    for e in eps:
        special = SRT_BY_EP.get(e["id"])
        if special and (SRC / special).exists():
            out[e["id"]] = SRC / special
            continue
        want = TITLE_ALIAS.get(e["t"], e["t"])
        p = by_title.get(norm_title(want))
        if p:
            out[e["id"]] = p
        else:
            missing.append(f'{e["id"]} {e["t"]}')
    if missing:
        print("没有字幕（跳过）：", "、".join(missing))
    return out


def rank_of(w, rank):
    """词元 → 频率排名。角色名记 0（等于"孩子一定认识"），表外的记 1e9。"""
    l = lemma(w)
    if l in NAMES:
        return 0
    return rank.get(l, 10**9)


def stats_for(eid, path, rank):
    n_lines, dur, lines = load_lines(eid, path)
    toks = tokenize(lines)
    if not toks:
        return None
    lemmas = {lemma(t) for t in toks}
    lemmas_in = sum(1 for x in lemmas if rank_of(x, rank) <= 5000)
    minutes = dur / 60 if dur else 0
    # 每个 token 的频率排名（表外记 inf）
    ranks = [rank_of(t, rank) for t in toks]

    def cov(n):
        if not toks:
            return 0
        return round(100 * sum(1 for r in ranks if r <= n) / len(toks), 1)

    curve = [round(cov(n)) for n in range(100, 5001, 100)]  # 整数%，与朵拉一致
    need = lambda p: next((n for n in range(100, 5001, 100) if cov(n) >= p), 0)

    return {
        "lemmas": len(lemmas),
        "cwk": lemmas_in,
        "running": len(toks),
        "wpm": round(len(toks) / minutes, 1) if minutes else 0,
        "min": round(minutes, 1),
        "lines": n_lines,
        "kind": "standard",
        "cov1k": cov(1000),
        "cov2k": cov(2000),
        "cov3k": cov(3000),
        "cov5k": cov(5000),
        "curve": curve,
        "need90": need(90),
        "need95": need(95),
        "_ranks": ranks,
    }


def pooled_curve(rank_list):
    """把若干集的 token 排名池化后算 50 档覆盖率（整季/全剧口径）。"""
    allr = [r for rs in rank_list for r in rs]
    if not allr:
        return []
    return [
        round(100 * sum(1 for r in allr if r <= n) / len(allr))
        for n in range(100, 5001, 100)
    ]


def main():
    if not FREQ.exists():
        sys.exit(f"缺词频表：{FREQ}（google-10000-english 按频率降序，一行一词）")
    rank = load_freq()
    srt_map = build_srt_map()
    out = {}
    season_ranks = {}  # "P01" -> [每集的 ranks...]
    all_lemmas = set()

    for eid in sorted(srt_map):
        p = srt_map[eid]
        st = stats_for(eid, p, rank)
        if not st:
            print(f"{eid} 没取到台词（{p.name}），跳过")
            continue
        season_ranks.setdefault("P" + eid[1:3], []).append(st.pop("_ranks"))
        st["src"] = "srt" if p.exists() else "asr"
        out[eid] = st
        s = out[eid]
        print(
            f"{eid}  {s['min']} 分钟 · {s['lemmas']} 词元 · {s['running']} tokens · "
            f"{s['wpm']} wpm · 1000 词可懂 {s['cov1k']}% · 5000 词 {s['cov5k']}%"
        )
        all_lemmas |= {lemma(t) for t in tokenize(load_lines(eid, p)[2])}

    seasons = {}
    for sk, ranks_list in season_ranks.items():
        ids = [i for i in out if "P" + i[1:3] == sk]
        vals = [out[i]["lemmas"] for i in ids]
        vals.sort()
        seasons[sk] = {
            "n": len(ids),
            "min": round(sum(out[i]["min"] for i in ids), 1),
            "median": vals[len(vals) // 2],
            "p25": vals[0],
            "p75": vals[-1],
            "wpm": round(sum(out[i]["wpm"] for i in ids) / len(ids)),
            # 整季池化覆盖率：把这一季所有台词当成一次连续听力
            "curve": pooled_curve(ranks_list),
        }

    meta = {
        "series_cum_lemmas": len(all_lemmas),
        "levels": list(range(100, 5001, 100)),
        "seasons": seasons,
        # 全剧池化曲线（已统计的集），供首页大字/横幅使用
        "series": pooled_curve([r for rs in season_ranks.values() for r in rs]),
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    (ROOT / "lib" / "peppa" / "vocab-meta.json").write_text(
        json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8"
    )
    print(f"\n{len(out)} 集共 {len(all_lemmas)} 个不同词元 → {OUT}")


if __name__ == "__main__":
    main()
