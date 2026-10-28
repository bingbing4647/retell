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
  IconPlay,
  IconStar,
  IconEye,
  IconEyeOff,
} from "./Icons";
import Slideshow from "./Slideshow";
import RetellLab from "./RetellLab";
import { episodePdfName, seasonPdfName } from "../lib/filename";
import { useRetell } from "../lib/progress";
import { speakLine, stopSpeak as stopTts, warmAudio } from "../lib/tts";

const A4W = 793.7; // 210mm @96dpi
const A4H = 1122.5; // 297mm @96dpi

export default function NineGrid({ lesson, prev, next, seasonPdf }) {
  const stageRef = useRef(null);
  const paperRef = useRef(null);
  const cancelRef = useRef(false);
  const [speaking, setSpeaking] = useState(0);
  const [speakingWord, setSpeakingWord] = useState(-1);
  const [busy, setBusy] = useState(false);
  const [canSpeak, setCanSpeak] = useState(false);
  const [deckAt, setDeckAt] = useState(-1); // -1 = 未打开；数字 = 从第几页开始
  const [store, api] = useRetell();
  const blind = !!store.settings.blind;
  const rate = store.settings.rate || 1;
  const stars = store.stars[lesson.id] || {};

  /* ---------- 打开播放器（顺带支持 ?play=1 直接播） ---------- */
  const openDeck = useCallback(
    (at = 0) => {
      if (busy) {
        cancelRef.current = true;
        stopTts();
        setSpeaking(0);
        setBusy(false);
      }
      setDeckAt(at);
    },
    [busy]
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const q = new URLSearchParams(window.location.search);
    if (q.get("play") === "1") setDeckAt(0);
  }, []);

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

  /* ---------- 语音可用性：预生成音频不依赖系统音色，一律可用 ---------- */
  useEffect(() => {
    if (typeof window === "undefined") return;
    warmAudio();
    setCanSpeak(true);
    return () => stopTts();
  }, []);

  const speakOne = useCallback(
    (text, no) => {
      if (!canSpeak) return;
      cancelRef.current = true; // 打断连读
      setSpeaking(typeof no === "number" ? no : 0);
      speakLine({
        lessonId: lesson.id,
        key: typeof no === "number" ? `c${no}` : no,
        text,
        rate,
        onEnd: () => {
          setSpeaking(0);
          setSpeakingWord(-1);
        },
      });
    },
    [canSpeak, lesson.id, rate]
  );

  const speakAll = useCallback(async () => {
    if (!canSpeak || busy) return;
    cancelRef.current = false;
    setBusy(true);

    for (let i = 0; i < lesson.cells.length; i++) {
      if (cancelRef.current) break;
      const c = lesson.cells[i];
      setSpeaking(c.no);
      await speakLine({ lessonId: lesson.id, key: `c${c.no}`, text: c.en, rate });
      // 句间留一点呼吸
      if (cancelRef.current) break;
      await new Promise((r) => setTimeout(r, 260));
    }
    setSpeaking(0);
    setBusy(false);
  }, [canSpeak, busy, lesson.id, lesson.cells, rate]);

  const stopAll = () => {
    cancelRef.current = true;
    stopTts();
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
          <button
            type="button"
            className="btn primary"
            onClick={() => openDeck(0)}
            title="像放 PPT 一样一页一页看，手机横竖屏自适应"
          >
            <IconPlay /> 播放模式
          </button>
          <button
            type="button"
            className={`btn toggle ${blind ? "on" : ""}`}
            onClick={() => {
              api.setSetting("blind", !blind);
              if (!blind) openDeck(1);
            }}
            aria-pressed={blind}
            title="我先说：进播放模式后先遮住句子，自己说完再看答案"
          >
            {blind ? <IconEyeOff /> : <IconEye />} 我先说
          </button>
          <button type="button" className="btn" onClick={doPrint}>
            <IconPrint /> 打印这一页
          </button>
          {lesson.pdf && (
            <a
              className="btn"
              href={lesson.pdf}
              download={episodePdfName(lesson)}
              title={`下载后文件名：${episodePdfName(lesson)}`}
            >
              <IconDownload /> 下载本集 PDF
            </a>
          )}
          {seasonPdf && (
            <a
              className="btn ghost"
              href={seasonPdf.url}
              download={seasonPdfName(lesson.season, seasonPdf.episodes)}
              title={`把 Season ${lesson.season} 全部 ${seasonPdf.episodes} 集合成一个 PDF`}
            >
              <IconDownload /> 整季 PDF（{seasonPdf.episodes} 集）
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
                  <div
                    className="cell-pic"
                    onClick={(e) => {
                      if (e.target.closest("button")) return;
                      openDeck(c.no);
                    }}
                    title="放大播放这一页"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={c.img} alt={c.t} />
                    <span className="cell-no">{c.no}</span>
                    {stars[c.no] ? (
                      <span className="cell-st no-print" title="这格已经自测过">
                        <IconStar />
                        {stars[c.no]}
                      </span>
                    ) : null}
                    <span className="cell-play" aria-hidden="true">
                      <IconPlay width={15} height={15} />
                    </span>
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
                  {lesson.words.map(([w, cn], wi) => (
                    <div
                      className={`p-w ${speakingWord === wi ? "speaking" : ""}`}
                      key={w}
                      role="button"
                      tabIndex={0}
                      title="点一下听发音"
                      onClick={() => {
                        setSpeakingWord(wi);
                        speakOne(w, `w${wi + 1}`);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSpeakingWord(wi);
                          speakOne(w, `w${wi + 1}`);
                        }
                      }}
                    >
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

      <RetellLab
        lesson={lesson}
        onPlay={() => openDeck(1)}
        onPractice={() => {
          api.setSetting("blind", true);
          openDeck(1);
        }}
      />

      {deckAt >= 0 && (
        <Slideshow
          lesson={lesson}
          start={deckAt}
          onClose={() => setDeckAt(-1)}
          blind={blind}
          onBlind={(v) => api.setSetting("blind", v)}
        />
      )}
    </>
  );
}
