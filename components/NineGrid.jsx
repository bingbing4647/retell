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
  IconFilm,
  IconStar,
  IconEye,
  IconEyeOff,
} from "./Icons";
import Slideshow from "./Slideshow";
import RetellLab from "./RetellLab";
import { episodePdfName, seasonPdfName } from "../lib/filename";
import vocabMetaData from "../lib/vocab-meta.json";
import { useRetell } from "../lib/progress";
import { EVENT, track } from "../lib/track";
import { keysOf, playClip, speakLine, stopSpeak as stopTts, warmAudio } from "../lib/tts";

// 默认用朵拉的汇总表；佩奇单集会传自己的
const doraVocabMeta = vocabMetaData;

const A4W = 793.7; // 210mm @96dpi
const A4H = 1122.5; // 297mm @96dpi

export default function NineGrid({
  lesson,
  prev,
  next,
  seasonPdf,
  // 多剧集：佩奇页传 seriesName="Peppa Pig" / basePath="/peppa"
  seriesName = "Dora the Explorer",
  basePath = "",
  // 面包屑返回哪一页：站点层级是 首页(选剧集)→剧集页(选季)→季列表→单集，
  // 所以朵拉单集的「返回」指向 /dora/ 而不是根路径。
  homeHref = "",
  homeLabel = "全部剧集",
  // 词汇量汇总表：朵拉 / 佩奇各一份，卡片里「全剧累计词量」要用对应剧集的数
  seriesVocabMeta = doraVocabMeta,
  seriesVocabLabel = "全剧累计词量",
}) {
  const stageRef = useRef(null);
  const paperRef = useRef(null);
  const cancelRef = useRef(false);
  const [speaking, setSpeaking] = useState(0);
  const [speakingWord, setSpeakingWord] = useState(-1);
  const [busy, setBusy] = useState(false);
  const [canSpeak, setCanSpeak] = useState(false);
  const [clipKeys, setClipKeys] = useState(null); // 本集可用的原声片段 o1..o9
  const [deckAt, setDeckAt] = useState(-1); // -1 = 未打开；数字 = 从第几页开始
  const [store, api] = useRetell();
  const blind = !!store.settings.blind;
  const rate = store.settings.rate || 1;
  const stars = store.stars[lesson.id] || {};
  // 问答式九宫格（小猪佩奇）：每格「问句 + 答句」，底部是复述小帮手
  const qa = !!lesson.qa;
  const helper = lesson.helper || null;

  /* ---------- 听力词汇总量 → 本集能听懂多少 ---------- */
  // 孩子在设置里填一个「已掌握听力词汇总量」，全站所有剧集都按这个数换算。
  const MY_DEFAULT = 800;
  const myLevel =
    Number(store.settings.level) >= 200 ? Number(store.settings.level) : MY_DEFAULT;
  // 曲线数组按 100,200,...,5000 排；取最接近的一档
  const covAt = (arr, n) =>
    arr ? arr[Math.max(0, Math.min(arr.length - 1, Math.round(n / 100) - 1))] : null;
  const voc = lesson.vocab;
  const myHit = voc ? covAt(voc.curve, myLevel) ?? Math.round(voc.cov1k) : 0;
  const maxHit = voc
    ? voc.curve
      ? voc.curve[voc.curve.length - 1]
      : Math.round(voc.cov5k)
    : 0;
  const hitTip =
    myHit >= 86
      ? "画面加上反复出现的固定句式，基本能自己看懂。"
      : myHit >= 80
        ? "能懂大半，偶尔停下来猜一下，家长在旁边点一句画面就行。"
        : myHit >= 72
          ? "跟着画面能抓住主线，家长先陪看一遍、讲 3–5 个关键词就够。"
          : "台词会明显听不懂，建议先看画面版，或家长逐句讲。"

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
      track(EVENT.DECK_OPEN, { lesson_id: lesson.id, start: at });
    },
    [busy, lesson.id]
  );

  /* ---------- 进集即记一笔（含来源） ---------- */
  useEffect(() => {
    track(EVENT.LESSON_OPEN, { lesson_id: lesson.id, season: lesson.season });
  }, [lesson.id, lesson.season]);

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
    let alive = true;
    keysOf(lesson.id).then((s) => {
      if (alive) setClipKeys(s);
    });
    return () => {
      alive = false;
      stopTts();
    };
  }, [lesson.id]);

  const speakOne = useCallback(
    (text, no) => {
      if (!canSpeak) return;
      cancelRef.current = true; // 打断连读
      setSpeaking(typeof no === "number" ? no : 0);
      track(EVENT.TTS_LINE, { lesson_id: lesson.id, cell: typeof no === "number" ? no : undefined });
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

  /* 听原声：播这一格在原片里的那一小段 */
  const playOrig = useCallback(
    (no) => {
      cancelRef.current = true;
      setSpeakingWord(-1);
      setSpeaking(no);
      track(EVENT.CLIP_PLAY, { lesson_id: lesson.id, cell: no });
      playClip({
        lessonId: lesson.id,
        key: `o${no}`,
        rate,
        onEnd: () => setSpeaking(0),
      }).then((ok) => {
        if (!ok) setSpeaking(0);
      });
    },
    [lesson.id, rate]
  );

  const speakAll = useCallback(async () => {
    if (!canSpeak || busy) return;
    cancelRef.current = false;
    setBusy(true);
    track(EVENT.TTS_ALL, { lesson_id: lesson.id });

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
    track(EVENT.PRINT, { lesson_id: lesson.id });
    window.print();
  };

  return (
    <>
      <div className="wrap">
        <div className="crumb no-print">
          <Link href={homeHref || basePath || "/dora/"}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <IconBack /> {homeLabel}
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
              onClick={() => track(EVENT.DOWNLOAD_PDF, { lesson_id: lesson.id, kind: "episode" })}
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
              onClick={() =>
                track(EVENT.DOWNLOAD_PDF, {
                  lesson_id: lesson.id,
                  kind: "season",
                  season: lesson.season,
                })
              }
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
              <Link href={`${basePath}/lesson/${prev.id}/`}>
                <IconArrowL /> 上一集
              </Link>
            ) : (
              <span />
            )}
            {next && (
              <Link href={`${basePath}/lesson/${next.id}/`}>
                下一集 <IconArrowR />
              </Link>
            )}
          </div>
        </div>

        {voc && (
          <div className="vc-card no-print">
            <div className="vc-top">
              <b>本集听力词汇量</b>
              <span>
                {Math.round(voc.min)} 分钟 · 整集对白统计 · 含主题曲
              </span>
            </div>

            <div className="vc-nums">
              <div className="vc-n">
                <b>{voc.lemmas}</b>
                <span>本集用了多少个词</span>
              </div>
              <div className="vc-n">
                <b>{voc.running.toLocaleString("en-US")}</b>
                <span>一共说出口的词</span>
              </div>
              <div className="vc-n">
                <b>{Math.round(voc.wpm)}</b>
                <span>语速（词/分钟）</span>
              </div>
              <div className="vc-n">
                <b>{seriesVocabMeta.series_cum_lemmas.toLocaleString("en-US")}</b>
                <span>{seriesVocabLabel}</span>
              </div>
            </div>

            <div className="vc-ask">
              <div className="vc-ask-top">
                <span>你孩子的听力词汇总量</span>
                <b>
                  {myLevel} <i>词</i>
                </b>
              </div>
              <input
                type="range"
                min="200"
                max="5000"
                step="100"
                value={myLevel}
                onChange={(e) => api.setSetting("level", Number(e.target.value))}
                style={{ "--p": `${((myLevel - 200) / 4800) * 100}%` }}
                aria-label="孩子的听力词汇总量"
              />
              <div className="vc-scale">
                <span>200</span>
                <span>1500</span>
                <span>3000</span>
                <span>5000</span>
              </div>
              <p className="vc-hint">
                不知道该填多少？零基础约 300，能听懂日常指令约 800，能看简单动画约
                2000（经验值，供参考）
              </p>
            </div>

            <div className="vc-res">
              <div className="vc-res-n">
                <b>{myHit}%</b>
                <span>这一集能听懂</span>
              </div>
              <div className="vc-res-t">
                {hitTip}
                <em>
                  词量再往上加收益很小——即使 5000 词也只有 {maxHit}%，
                  剩下那部分靠画面和情境补。
                </em>
                {voc.need90 > 0 && voc.need90 <= 5000 && (
                  <em>词汇量到 {voc.need90} 词时，这一集能懂 90%。</em>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="wrap stage">
        <div className="stage-inner" ref={stageRef}>
          <div className={`paper ${lesson.wide ? "wide" : ""} ${qa ? "qa" : ""}`} ref={paperRef}>
            {qa ? (
              <div className="qa-head">
                <div className="qa-brand">{seriesName}</div>
                <div className="qa-ep">
                  Episode {lesson.episode}: {lesson.title}
                </div>
                <div className="qa-banner">九宫格故事复述</div>
                <div className="qa-head-r">
                  <span className="qa-season">Season {lesson.season}</span>
                  <span className="qa-name">
                    姓名 Name <u>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</u>
                  </span>
                </div>
              </div>
            ) : (
              <div className="p-head">
                <div className="p-head-l">
                  <div className="p-badge">3x3</div>
                  <div>
                    <div className="p-t1">
                      {seriesName} · <em>“{lesson.title}”</em>
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
            )}

            {qa ? (
              <div className="qa-grid">
                {lesson.cells.map((c) => (
                  <div
                    key={c.no}
                    className={`qa-cell c${c.no} ${speaking === c.no ? "reading" : ""}`}
                  >
                    <div className="qa-t">
                      <b>{c.no}</b>
                      <span>{c.t}</span>
                    </div>
                    <div
                      className="qa-pic"
                      onClick={(e) => {
                        if (e.target.closest("button")) return;
                        openDeck(c.no);
                      }}
                      title="放大播放这一页"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={c.img} alt={c.t} />
                      {stars[c.no] ? (
                        <span className="cell-st no-print" title="这格已经自测过">
                          <IconStar />
                          {stars[c.no]}
                        </span>
                      ) : null}
                      <span className="cell-play" aria-hidden="true">
                        <IconPlay width={13} height={13} />
                      </span>
                      <div className="cell-tools">
                        <span className="tool-chip">
                          <IconClock /> {c.time}
                        </span>
                        {canSpeak && (
                          <button
                            className={`tool-chip ${speaking === c.no ? "speaking" : ""}`}
                            onClick={() => speakOne(c.a, c.no)}
                            title="朗读答句"
                          >
                            <IconSpeak width={11} height={11} /> 读
                          </button>
                        )}
                        {canSpeak && (
                          <button
                            className={`tool-chip ${speaking === c.no ? "speaking" : ""}`}
                            onClick={() => speakOne(c.q, `q${c.no}`)}
                            title="朗读问句"
                          >
                            <IconSpeak width={11} height={11} /> 问
                          </button>
                        )}
                        {clipKeys?.has(`o${c.no}`) && (
                          <button
                            className={`tool-chip ${speaking === c.no ? "speaking" : ""}`}
                            onClick={() => playOrig(c.no)}
                            title="听这一句在动画片里的原声"
                          >
                            <IconFilm width={11} height={11} /> 原声
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="qa-body">
                      <p className="qa-q">
                        <span className="qa-tag">问</span>
                        {c.q}
                      </p>
                      <p className="qa-a">
                        <span className="qa-tag">说</span>
                        {c.a}
                      </p>
                      {c.cn && <p className="qa-cn">{c.cn}</p>}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
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
                      {clipKeys?.has(`o${c.no}`) && (
                        <button
                          className={`tool-chip ${speaking === c.no ? "speaking" : ""}`}
                          onClick={() => playOrig(c.no)}
                          title="听这一句在动画片里的原声"
                        >
                          <IconFilm width={11} height={11} /> 原声
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
            )}

            {qa ? (
              <div className="qa-foot">
                <div className="qa-help">
                  <div className="qa-h h1">
                    <b>顺序词</b>
                    <p>{helper?.order || "First / Next / Then / After that / Finally"}</p>
                  </div>
                  <div className="qa-h h2">
                    <b>关键词</b>
                    <p>{helper?.keywords || ""}</p>
                  </div>
                  <div className="qa-h h3">
                    <b>动作词</b>
                    <p>{helper?.actions || ""}</p>
                  </div>
                </div>
                <div className="qa-self">
                  <span>
                    自评：我能说 <span className="qa-stars">☆☆☆</span> 3 / 6 / 9 句
                  </span>
                  <span className="qa-sign">
                    家长签字 <u>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</u>
                  </span>
                </div>
              </div>
            ) : (
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
            )}
          </div>
        </div>
      </div>

      <RetellLab
        lesson={lesson}
        who={seriesName === "Peppa Pig" ? "Peppa and George" : "Dora and Boots"}
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
