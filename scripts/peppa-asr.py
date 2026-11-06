#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
用 faster-whisper 把佩奇每集的音轨转成纯文本，给词汇量统计用。

为什么要 ASR 而不是直接读 srt：
  片源自带的 srt 有漏句（实测 CE001 只有 54 条、CE002 有 90 条，同为 5 分钟的集
  台词量差一倍），直接拿它统计语速和词汇量会偏。整条音轨识别与朵拉的口径一致
  （卡片上写的就是"整集音轨识别 · 含主题曲与对白"）。

★ 本机必守：先用 ffmpeg 抽 16k 单声道 wav，再喂 numpy 数组。
  直接把 mp4 路径交给 model.transcribe 会走 PyAV 解码，本机的
  faster-whisper 1.2.1 + av 19.0.2 组合会报
  TypeError: open() got an unexpected keyword argument 'metadata_errors'。
  喂 float32 数组就绕开了 PyAV，实测正常。

★ 提示词很关键：base.en 不加 initial_prompt 会把 Peppa 全拼成 "Pepper"，
  Peppa Pig 里高频人名（George / Mummy Pig / Daddy Pig）也会漂。
  加了台词里常见的人名句式后，整段可读性明显好转。

产物：tmp/peppa/asr/<集号>.txt   一行一句；同名 .json 存时长、句数
      tmp/peppa/wav/<集号>.wav   中间产物（可删）

用法：
  PYTHONPATH= .tts-venv/Scripts/python.exe scripts/peppa-asr.py            # 三集
  PYTHONPATH= .tts-venv/Scripts/python.exe scripts/peppa-asr.py P01E01      # 只做一集
"""

import json
import subprocess
import sys
import wave
from pathlib import Path

import numpy as np
from faster_whisper import WhisperModel

ROOT = Path(__file__).resolve().parent.parent
SRC = Path(
    "F:/002-学习资料/001-育儿教育/03英语/曼琳妈妈/3-小猪佩奇/小猪佩奇-中英双字幕版第1季52集"
)
OUT = ROOT / "tmp" / "peppa" / "asr"
WAV = ROOT / "tmp" / "peppa" / "wav"

VIDEO = {
    "P01E01": "CE001 Muddy Puddles  .mp4",
    "P01E02": "CE002 Mr Dinosaur Is Lost  .mp4",
    "P01E03": "CE003 Best Friend  .mp4",
}

# 台词里反复出现的人名/固定句式，用来压住 base.en 的拼写漂移
PROMPT = (
    "Peppa Pig, George, Mummy Pig, Daddy Pig. "
    "Peppa loves jumping up and down in muddy puddles. "
    "This is my little brother George. I am Peppa Pig."
)


def to_wav(src: Path, dst: Path):
    """抽整条音轨 → 16kHz 单声道 16bit wav。"""
    if dst.exists() and dst.stat().st_size > 1024:
        return
    dst.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [
            "ffmpeg", "-v", "error", "-i", str(src),
            "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le",
            "-y", str(dst),
        ],
        check=True,
    )


def read_wav(path: Path) -> np.ndarray:
    with wave.open(str(path), "rb") as w:
        assert w.getframerate() == 16000, f"采样率不对：{w.getframerate()}"
        raw = w.readframes(w.getnframes())
    return np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0


def main():
    want = [x.upper() for x in sys.argv[1:]] or list(VIDEO)
    OUT.mkdir(parents=True, exist_ok=True)

    # base.en：英文专用小模型，本地已有缓存（~/.cache/huggingface）
    # 必须 local_files_only：本机代理会让 huggingface 的联网检查报 502
    model = WhisperModel("base.en", device="cpu", compute_type="int8", local_files_only=True)

    for eid in want:
        name = VIDEO.get(eid)
        if not name:
            print("跳过未知集号", eid)
            continue
        src = SRC / name
        if not src.exists():
            print("找不到片源", src)
            continue
        txt = OUT / f"{eid}.txt"
        if txt.exists() and txt.stat().st_size > 200:
            print(f"{eid} 已有转写，跳过")
            continue

        wav = WAV / f"{eid}.wav"
        print(f"{eid} 抽音轨…", flush=True)
        to_wav(src, wav)
        audio = read_wav(wav)
        print(f"  {len(audio)/16000/60:.2f} 分钟，开始转写…", flush=True)

        segs, info = model.transcribe(
            audio,
            language="en",
            beam_size=5,              # 比 1 准不少，5 分钟一集也就慢十几秒
            # ★ 不能开 vad_filter：实测 CE001 开了只出 277 词，关掉是 327 词，
            #   VAD 会把主题曲和抢话的对白整段吃掉
            vad_filter=False,
            condition_on_previous_text=False,
            initial_prompt=PROMPT,
        )
        lines = [(s.text or "").strip() for s in segs]
        lines = [t for t in lines if t]
        txt.write_text("\n".join(lines), encoding="utf-8")
        (OUT / f"{eid}.json").write_text(
            json.dumps(
                {"duration": round(info.duration, 2), "segments": len(lines)},
                ensure_ascii=False,
            ),
            encoding="utf-8",
        )
        print(f"  {eid}: {len(lines)} 句 / {info.duration/60:.2f} 分钟", flush=True)

    print("完成 →", OUT)


if __name__ == "__main__":
    main()
