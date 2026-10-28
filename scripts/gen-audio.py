#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
批量生成朗读音频（微软 Edge 神经网络语音，免费、无需 API Key）。

为什么预生成而不是浏览器实时合成：
  - 浏览器 speechSynthesis 只能用系统本地音色（Windows 版 Zira/David 等），
    机械感强、断句硬，孩子跟读时不自觉模仿那种腔调。
  - Edge 的 Read Aloud 接口背后是 Azure Neural TTS 同一套模型（Aria/Ana 等），
    自然度接近真人，且完全免费，只要联网生成一次，之后站点纯静态播放。

产物：
  public/audio/<小写集号>/<key>.mp3   key = c1..c9(九宫格句) / w1..w12(Word Bank)
                                            / op(开头) / ed(结尾)
  public/audio/manifest.json          { "s02e14": ["c1", ...], ... }

用法：
  .tts-venv/Scripts/python.exe scripts/gen-audio.py                 # 全量，已存在跳过
  .tts-venv/Scripts/python.exe scripts/gen-audio.py --only S02E14   # 只做一集
  .tts-venv/Scripts/python.exe scripts/gen-audio.py --voice en-US-AnaNeural --force
"""

import argparse
import asyncio
import json
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import edge_tts

ROOT = Path(__file__).resolve().parent.parent
OUT_ROOT = ROOT / "public" / "audio"
TMP_DIR = ROOT / "tmp" / "tts"
LESSONS = ROOT / "lib" / "lessons.json"

DEFAULT_VOICE = "en-US-AriaNeural"     # 成年女声，清晰、有表现力，教材示范音首选
ES_VOICE = "es-MX-DaliaNeural"         # 西语词（¡Para! / ¡Rápido! / amigos）用它读才准
DEFAULT_RATE = "-8%"                   # 比默认稍慢，留出跟读余量
BITRATE = "32k"                        # 24kHz 单声道 32kbps，语音足够清晰，体积减 1/3

SPANISH_HINT = "西语"
SAMPLE_RATE = 24000


def clean(text: str) -> str:
    """让 TTS 读得顺：填空统一念 blank，去掉多余符号。"""
    t = text.replace("______", " blank ").replace("____", " blank ")
    t = t.replace("“", " ").replace("”", " ").replace("\u3000", " ")
    t = re.sub(r"\s+", " ", t).strip()
    return t


def items_of(lesson):
    """(key, text, is_spanish) 列表——前端按键名取音频，顺序恒定。"""
    out = []
    for c in lesson.get("cells", []):
        out.append((f"c{c['no']}", clean(c.get("en", "")), False))
    for i, w in enumerate(lesson.get("words", []), 1):
        word, cn = w[0], (w[1] if len(w) > 1 else "")
        out.append((f"w{i}", clean(word), SPANISH_HINT in cn))
    if lesson.get("opener"):
        out.append(("op", clean(lesson["opener"]), False))
    if lesson.get("ending"):
        out.append(("ed", clean(lesson["ending"]), False))
    return [(k, t, es) for k, t, es in out if t]


def transcode(src: Path, dst: Path):
    """48kbps → 32kbps 单声道，体积再降 1/3，教学短句听感无差。"""
    cmd = [
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
        "-i", str(src),
        "-ac", "1", "-ar", str(SAMPLE_RATE),
        "-codec:a", "libmp3lame", "-b:a", BITRATE,
        str(dst),
    ]
    r = subprocess.run(cmd, capture_output=True)
    if r.returncode != 0:
        raise RuntimeError(r.stderr.decode("utf-8", "ignore")[:400])


async def synth(text: str, voice: str, rate: str, dst: Path):
    tmp = Path(tempfile.mkstemp(suffix=".mp3", dir=TMP_DIR)[1])
    comm = edge_tts.Communicate(text, voice, rate=rate)
    await comm.save(str(tmp))
    if tmp.stat().st_size < 1000:
        raise RuntimeError("空音频")
    transcode(tmp, dst)
    # Windows 上 subprocess 刚结束时句柄可能还被 Defender 占着，
    # 删不掉不算失败（临时目录最后统一清），否则会误判成合成错误。
    try:
        tmp.unlink(missing_ok=True)
    except OSError:
        pass


async def run(args):
    lessons = json.loads(LESSONS.read_text(encoding="utf-8"))
    if args.only:
        keep = {x.upper() for x in args.only.split(",")}
        lessons = {k: v for k, v in lessons.items() if k.upper() in keep}
        if not lessons:
            sys.exit(f"没找到指定集号：{args.only}")

    OUT_ROOT.mkdir(parents=True, exist_ok=True)
    TMP_DIR.mkdir(parents=True, exist_ok=True)
    sem = asyncio.Semaphore(args.jobs)
    lock = asyncio.Lock()
    stat = {"ok": 0, "skip": 0, "fail": 0}
    fails = []

    async def one(lesson_id, key, text, es):
        d = OUT_ROOT / lesson_id.lower()
        dst = d / f"{key}.mp3"
        if dst.exists() and dst.stat().st_size > 800 and not args.force:
            async with lock:
                stat["skip"] += 1
            return
        d.mkdir(parents=True, exist_ok=True)
        voice = ES_VOICE if es else args.voice
        async with sem:
            for attempt in range(3):
                try:
                    await synth(text, voice, args.rate, dst)
                    async with lock:
                        stat["ok"] += 1
                        n = stat["ok"] + stat["skip"]
                    if n % 20 == 0:
                        print(f"  … 已完成 {n} 条", flush=True)
                    return
                except Exception as e:  # noqa: BLE001
                    if attempt == 2:
                        async with lock:
                            stat["fail"] += 1
                            fails.append(f"{lesson_id}/{key}: {e}")
                    else:
                        await asyncio.sleep(1.2 * (attempt + 1))

    tasks = [
        one(lid, k, t, es)
        for lid, lesson in lessons.items()
        for (k, t, es) in items_of(lesson)
    ]
    print(f"共 {len(tasks)} 条待合成（{len(lessons)} 集）…", flush=True)
    await asyncio.gather(*tasks)

    # manifest：前端据此判断哪一集有音频，其余自动回退系统语音
    manifest = {}
    for lid in lessons:
        d = OUT_ROOT / lid.lower()
        if d.is_dir():
            keys = sorted(
                (p.stem for p in d.glob("*.mp3") if p.stat().st_size > 800),
                key=lambda s: (s[0], int("".join(ch for ch in s[1:] if ch.isdigit()) or 0)),
            )
            if keys:
                manifest[lid.lower()] = keys
    mf = OUT_ROOT / "manifest.json"
    if args.only and mf.exists():  # 增量模式：合并旧清单
        old = json.loads(mf.read_text(encoding="utf-8"))
        old.update(manifest)
        manifest = old
        manifest.pop("_meta", None)
    manifest["_meta"] = {"voice": args.voice, "esVoice": ES_VOICE, "rate": args.rate}
    mf.write_text(json.dumps(manifest, ensure_ascii=False, indent=0), encoding="utf-8")

    total_bytes = sum(p.stat().st_size for p in OUT_ROOT.rglob("*.mp3"))
    try:  # 临时目录清不掉无所谓，别因此让整轮跑挂
        shutil.rmtree(TMP_DIR, ignore_errors=True)
    except Exception:  # noqa: BLE001
        pass
    print(f"\n完成：新增 {stat['ok']} / 跳过 {stat['skip']} / 失败 {stat['fail']}")
    print(f"音频总量 {total_bytes/1024/1024:.1f} MB，清单 {len(manifest)-1} 集")
    if fails:
        print("失败明细：")
        for f in fails[:20]:
            print("  ", f)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", help="只处理指定集号，逗号分隔，如 S02E14,S02E15")
    ap.add_argument("--voice", default=DEFAULT_VOICE)
    ap.add_argument("--rate", default=DEFAULT_RATE)
    ap.add_argument("--jobs", type=int, default=4)
    ap.add_argument("--force", action="store_true", help="覆盖已存在的音频")
    args = ap.parse_args()
    asyncio.run(run(args))


if __name__ == "__main__":
    main()
