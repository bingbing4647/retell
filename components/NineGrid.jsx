"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  IconBack,
  IconPrint,
  IconDownload,
  IconSpeak,
  IconStop,
  IconArrowL,
  IconArrowR,
  IconClock,
} from "./Icons";

const A4W = 793.7; // 210mm @96dpi
const A4H = 1122.5; // 297mm @96dpi

export default function NineGrid({ lesson, prev, next }) {
  const stageRef = useRef(null);
  const paperRef = useRef(null);
  const cancelRef = useRef(false);
  const [speaking, setSpeaking] = useState(0);
  const [busy, setBusy] = useState(false);
  const [canSpeak, setCanSpeak] = useState(false);

  /* ---------- 纸张自适应缩放 ---------- */
  useEffect(() => {
    const stage = stageRef.current;
    const paper = paperRef.current;
    if (!stage || !paper) return;

    const fit = () => {
      // 窄屏走卡片流布局，不做 A4 缩放
      if (window.innerWidth <= 760) {
        paper.style.transform = "none";
        stage.style.height = "auto";
        return;
      }
      const s = Math.min(1, (stage.clientWidth - 2) / A4W);
      paper.style.transform = `scale(${s})`;
      stage.style.height = `${A4H * s}px`;
    };
    fit();

    const ro = new ResizeObserver(fit);
    ro.observe(stage);
    window.addEventListener("resize", fit);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", fit);
    };
  }, []);

  /* ---------- 语音合成可用性 ---------- */
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("speechSynthesis" in window)) return;
    setCanSpeak(true);
    // 预热 voice 列表（部分浏览器首次为空）
    const warm = () => window.speechSynthesis.getVoices();
    warm();
    window.speechSynthesis.onvoiceschanged = warm;
  }, []);

  const pickVoice = () => {
    const vs = window.speechSynthesis.getVoices() || [];
    return (
      vs.find((v) => /en[-_]US/i.test(v.lang) && /female|samantha|zira|aria/i.test(v.name)) ||
      vs.find((v) => /en[-_]US/i.test(v.lang)) ||
      vs.find((v) => /^en/i.test(v.lang)) ||
      null
    );
  };

  const speakOne = useCallback(
    (text, no) => {
      if (!canSpeak) return;
      const synth = window.speechSynthesis;
      synth.cancel();
      cancelRef.current = true; // 打断连读
      const u = new SpeechSynthesisUtterance(text);
      const v = pickVoice();
      if (v) u.voice = v;
      u.lang = "en-US";
      u.rate = 0.82;
      u.pitch = 1;
      u.onstart = () => setSpeaking(no);
      u.onend = () => setSpeaking(0);
      u.onerror = () => setSpeaking(0);
      synth.speak(u);
    },
    [canSpeak]
  );

  const speakAll = useCallback(async () => {
    if (!canSpeak || busy) return;
    const synth = window.speechSynthesis;
    synth.cancel();
    cancelRef.current = false;
    setBusy(true);
    const voice = pickVoice();

    for (let i = 0; i < lesson.cells.length; i++) {
      if (cancelRef.current) break;
      const c = lesson.cells[i];
      setSpeaking(c.no);
      await new Promise((resolve) => {
        const u = new SpeechSynthesisUtterance(c.en);
        if (voice) u.voice = voice;
        u.lang = "en-US";
        u.rate = 0.82;
        u.onend = resolve;
        u.onerror = resolve;
        synth.speak(u);
        // 兜底：极端情况下 onend 不触发
        setTimeout(resolve, 9000);
      });
      // 句间留一点呼吸
      await new Promise((r) => setTimeout(r, 260));
    }
    setSpeaking(0);
    setBusy(false);
  }, [canSpeak, busy, lesson.cells]);

  const stopAll = () => {
    cancelRef.current = true;
    window.speechSynthesis?.cancel();
    setSpeaking(0);
    setBusy(false);
  };

  /* ---------- 打印 ---------- */
  const doPrint = () => {
    if (busy) stopAll();
    window.print();
  };

  return (
    <>
      <div className="wrap">
        <div className="crumb no-print">
          <Link href="/">
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <IconBack /> 全部剧集
            </span>
          </Link>
          <span>/</span>
          <span>{lesson.id}</span>
        </div>

        <div className="lesson-head">
          <div className="lesson-title-row">
            <div className="lesson-title">
              <div className="k">{lesson.id} · 九宫格复述</div>
              <h1>{lesson.title}</h1>
              <div className="cn">{lesson.titleCn}</div>
              {lesson.hook && <div className="hook">{lesson.hook}</div>}
            </div>
          </div>
        </div>

        <div className="actbar no-print">
          <button type="button" className="btn primary" onClick={doPrint}>
            <IconPrint /> 打印这一页
          </button>
          {lesson.pdf && (
            <a className="btn" href={lesson.pdf} download>
              <IconDownload /> 下载 PDF
            </a>
          )}
          {canSpeak && (
            <button
              className="btn ghost"
              onClick={busy ? stopAll : speakAll}
              title="按顺序朗读九句英文"
            >
              {busy ? <IconStop /> : <IconSpeak />}
              {busy ? "停止朗读" : "全文朗读"}
            </button>
          )}

          <div className="pager">
            {prev ? (
              <Link href={`/lesson/${prev.id}/`}>
                <IconArrowL /> 上一集
              </Link>
            ) : (
              <span />
            )}
            {next && (
              <Link href={`/lesson/${next.id}/`}>
                下一集 <IconArrowR />
              </Link>
            )}
          </div>
        </div>
      </div>

      <div className="wrap stage">
        <div className="stage-inner" ref={stageRef}>
          <div className="paper" ref={paperRef}>
            <div className="p-head">
              <div className="p-head-l">
                <div className="p-badge">3x3</div>
                <div>
                  <div className="p-t1">
                    Dora the Explorer · <em>“{lesson.title}”</em>
                  </div>
                  <div className="p-t2">
                    Season {lesson.season} · Episode {lesson.episode} &nbsp;|&nbsp;
                    看动画 · 说英语 · 九步复述
                  </div>
                </div>
              </div>
              <div className="p-head-r">
                <div className="k">姓名 Name</div>
                <div className="v">____________</div>
              </div>
            </div>

            <div className="p-grid">
              {lesson.cells.map((c) => (
                <div
                  key={c.no}
                  className={`cell ${speaking === c.no ? "reading" : ""}`}
                >
                  <div className="cell-pic">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={c.img} alt={c.t} />
                    <span className="cell-no">{c.no}</span>
                    <div className="cell-tools">
                      <span className="tool-chip">
                        <IconClock /> {c.time}
                      </span>
                      {canSpeak && (
                        <button
                          className={`tool-chip ${speaking === c.no ? "speaking" : ""}`}
                          onClick={() => speakOne(c.en, c.no)}
                          title="朗读这句"
                        >
                          <IconSpeak width={11} height={11} /> 读
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="cell-body">
                    <div className="cell-en-t">{c.t}</div>
                    <div className="cell-en-s">{c.en}</div>
                    <div className="cell-cn-s">{c.cn}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="p-foot">
              <div className="p-box">
                <h3>
                  WORD BANK <span>看图说句子，用上这些词</span>
                </h3>
                <div className="p-words">
                  {lesson.words.map(([w, cn]) => (
                    <div className="p-w" key={w}>
                      <b>{w}</b>
                      <span>{cn}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="p-box p-frame">
                <h3>
                  SAY IT IN ORDER <span>按顺序连起来说</span>
                </h3>
                <p className="chain">First → Then → Next → After that → Finally</p>
                <p>
                  <span className="lbl">开头：</span>
                  {lesson.opener}
                </p>
                <p>
                  <span className="lbl">结尾：</span>
                  {lesson.ending}
                </p>
                <div className="p-stars">
                  <span>
                    自评 <span className="s">☆☆☆</span> 我能说 3 / 6 / 9 句
                  </span>
                  <span className="p-sign">
                    家长签字 <u></u>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
