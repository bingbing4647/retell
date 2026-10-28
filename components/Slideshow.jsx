"use client";

// 全屏「一页一页」播放器：封面 → 9 张单页 → 收尾页。
// 手机竖屏走「上图下文」，横屏（含桌面）自动切成「左图右文」。
// 翻页：左右边缘居中的大按钮 / 键盘 ←→ 空格 / 手机左右滑动 / 底部进度点。
// 朗读一律手动点「朗读这句」，进页不自动出声。
// 「我先说」= 延迟复述：先遮住句子，自己说完再看答案，然后自评星。

import { useCallback, useEffect, useRef, useState } from "react";
import {
  IconArrowL,
  IconArrowR,
  IconClose,
  IconExpand,
  IconEye,
  IconEyeOff,
  IconPlay,
  IconSpeak,
  IconCheck,
  IconStar,
} from "./Icons";
import { BLIND_WAIT, SPEEDS, useRetell } from "../lib/progress";

const SWIPE_MIN = 44;
const RATE_LABEL = { 0.75: "慢速跟读", 1: "原速", 1.25: "快听" };
const STAR_LABEL = { 1: "说了一句", 2: "说了三四句", 3: "整段讲下来" };

export default function Slideshow({ lesson, start = 0, onClose, blind = false, onBlind }) {
  const cells = lesson.cells;
  const total = cells.length + 2; // 封面 + 9 页 + 收尾
  const [i, setI] = useState(Math.min(Math.max(start, 0), total - 1));
  const [dir, setDir] = useState(1);
  const [canSpeak, setCanSpeak] = useState(false);
  const [talking, setTalking] = useState(false);
  const [isFs, setIsFs] = useState(false);
  const [fsOk, setFsOk] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [remain, setRemain] = useState(BLIND_WAIT);

  const [store, api] = useRetell();
  const rate = store.settings.rate || 1;
  const stars = store.stars[lesson.id] || {};
  const five = store.five[lesson.id] || {};

  const rootRef = useRef(null);
  const touchRef = useRef(null);
  const voiceRef = useRef(null);
  const skipClickRef = useRef(false);

  /* ---------- 语音 ---------- */
  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    setCanSpeak(true);
    const pick = () => {
      const vs = window.speechSynthesis.getVoices() || [];
      voiceRef.current =
        vs.find(
          (v) =>
            /en[-_]US/i.test(v.lang) &&
            /female|samantha|zira|aria|google us english/i.test(v.name)
        ) ||
        vs.find((v) => /en[-_]US/i.test(v.lang)) ||
        vs.find((v) => /^en/i.test(v.lang)) ||
        null;
    };
    pick();
    window.speechSynthesis.onvoiceschanged = pick;
    return () => {
      window.speechSynthesis.onvoiceschanged = null;
      window.speechSynthesis.cancel();
    };
  }, []);

  const say = useCallback(
    (text, speed = rate) => {
      if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
      const synth = window.speechSynthesis;
      synth.cancel();
      if (!text) {
        setTalking(false);
        return;
      }
      const u = new SpeechSynthesisUtterance(text);
      if (voiceRef.current) u.voice = voiceRef.current;
      u.lang = "en-US";
      u.rate = speed;
      u.pitch = 1;
      u.onstart = () => setTalking(true);
      u.onend = () => setTalking(false);
      u.onerror = () => setTalking(false);
      // cancel 之后立刻 speak 在部分浏览器会静默失败，让出一帧
      window.setTimeout(() => synth.speak(u), 60);
    },
    [rate]
  );

  /* ---------- 翻页 ---------- */
  const step = useCallback(
    (d) => {
      setDir(d);
      setI((prev) => Math.min(total - 1, Math.max(0, prev + d)));
    },
    [total]
  );

  const goto = useCallback(
    (n) => {
      setDir(1);
      setI(Math.min(total - 1, Math.max(0, n)));
    },
    [total]
  );

  /* 手动朗读（进页不自动读） */
  const speakCell = useCallback(
    (cell) => {
      if (!cell || !canSpeak) return;
      say(cell.en);
    },
    [canSpeak, say]
  );

  /* 翻到别的页时，把没读完的语音停掉，并重置「我先说」 */
  useEffect(() => {
    setTalking(false);
    return () => {
      window.speechSynthesis?.cancel();
    };
  }, [i]);

  /* 「我先说」：每页从 10 秒开始倒数，到点自动放答案 */
  useEffect(() => {
    setRevealed(false);
    if (!blind) return;
    setRemain(BLIND_WAIT);
    const t = setInterval(() => setRemain((v) => Math.max(0, v - 1)), 1000);
    return () => clearInterval(t);
  }, [i, blind]);

  useEffect(() => {
    if (blind && remain === 0) setRevealed(true);
  }, [blind, remain]);

  /* ---------- 锁滚动 ---------- */
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  /* ---------- 键盘 ---------- */
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "ArrowRight" || e.key === "PageDown" || e.key === " ") {
        e.preventDefault();
        step(1);
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        step(-1);
      } else if (e.key === "Enter") {
        e.preventDefault();
        step(1);
      } else if (e.key === "Escape") {
        if (document.fullscreenElement) return; // 先退全屏，再按一次退出
        e.preventDefault();
        onClose();
      } else if (e.key === "Home") {
        goto(0);
      } else if (e.key === "End") {
        goto(total - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, goto, onClose, total]);

  /* ---------- 全屏 ---------- */
  useEffect(() => {
    if (!document.fullscreenEnabled) return;
    setFsOk(true);
    const h = () => setIsFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", h);
    return () => document.removeEventListener("fullscreenchange", h);
  }, []);

  const toggleFs = () => {
    if (!document.fullscreenEnabled) return;
    if (document.fullscreenElement) {
      document.exitFullscreen?.();
    } else {
      rootRef.current?.requestFullscreen?.().catch(() => {});
    }
  };

  /* ---------- 触摸 & 点击 ---------- */
  const onTouchStart = (e) => {
    const t = e.touches[0];
    touchRef.current = { x: t.clientX, y: t.clientY, at: Date.now() };
  };

  const onTouchEnd = (e) => {
    const s = touchRef.current;
    touchRef.current = null;
    if (!s) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;
    if (Date.now() - s.at > 900) return;
    if (Math.abs(dx) < SWIPE_MIN || Math.abs(dx) < Math.abs(dy) * 1.3) return;
    skipClickRef.current = true; // 滑动后不要再触发点击翻页
    step(dx < 0 ? 1 : -1);
  };

  const onStageClick = (e) => {
    if (skipClickRef.current) {
      skipClickRef.current = false;
      return;
    }
    if (e.target.closest("button,a,input")) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - r.left;
    if (x < r.width * 0.3) step(-1);
    else step(1);
  };

  const cell = i >= 1 && i <= cells.length ? cells[i - 1] : null;
  const slideCls = `slide ${dir < 0 ? "back" : ""}`;
  const cellStar = cell ? stars[cell.no] || 0 : 0;
  const gate = !!cell && blind && !revealed;
  const fivePairs = [
    ["who", "Who"],
    ["what", "What"],
    ["where", "Where"],
    ["when", "When"],
    ["how", "How"],
  ].filter(([k]) => (five[k] || "").trim());

  return (
    <div
      className="deck"
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label={`${lesson.id} ${lesson.title} 播放模式`}
    >
      {/* 顶栏 */}
      <div className="deck-top">
        <button type="button" className="dk-btn" onClick={onClose} aria-label="退出播放">
          <IconClose />
        </button>
        <div className="deck-meta">
          <b>{lesson.id}</b>
          <span>{lesson.title}</span>
        </div>
        <div className="deck-tools">
          {/* 变速复述：偏快先慢速跟读，偏慢用快听磨耳朵 */}
          <div className="dk-rate" role="group" aria-label="朗读速度">
            {SPEEDS.map((r) => (
              <button
                type="button"
                key={r}
                className={rate === r ? "on" : ""}
                onClick={() => api.setSetting("rate", r)}
                title={RATE_LABEL[r]}
              >
                {r === 1 ? "1×" : `${r}×`}
              </button>
            ))}
          </div>
          <button
            type="button"
            className={`dk-pill ${blind ? "on" : ""}`}
            onClick={() => onBlind?.(!blind)}
            aria-pressed={blind}
            title={
              blind
                ? `我先说已开：每页先遮住 ${BLIND_WAIT} 秒，自己说完再看答案`
                : "我先说：先遮住英文，自己说完再看答案"
            }
          >
            {blind ? <IconEyeOff width={15} height={15} /> : <IconEye width={15} height={15} />}
            <span>我先说</span>
          </button>
          {fsOk && (
            <button
              type="button"
              className={`dk-btn ${isFs ? "on" : ""}`}
              onClick={toggleFs}
              aria-label="全屏"
              title="全屏"
            >
              <IconExpand />
            </button>
          )}
        </div>
      </div>

      {/* 舞台 */}
      <div
        className="deck-stage"
        onClick={onStageClick}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {/* 左右边缘居中的翻页按钮（最主要的上手入口） */}
        <button
          type="button"
          className="deck-edge prev"
          onClick={(e) => {
            e.stopPropagation();
            step(-1);
          }}
          disabled={i === 0}
          aria-label="上一页"
        >
          <IconArrowL width={26} height={26} />
        </button>
        <button
          type="button"
          className="deck-edge next"
          onClick={(e) => {
            e.stopPropagation();
            step(1);
          }}
          disabled={i === total - 1}
          aria-label="下一页"
        >
          <IconArrowR width={26} height={26} />
        </button>

        {/* 封面 */}
        {i === 0 && (
          <div className={`${slideCls} sl-cover`}>
            <div className="sl-kicker">
              {lesson.id} · 九宫格复述 · {cells.length} 句
            </div>
            <h2 className="sl-title">{lesson.title}</h2>
            <p className="sl-title-cn">{lesson.titleCn}</p>
            {lesson.hook && <p className="sl-hook">{lesson.hook}</p>}
            <div className="sl-thumbs">
              {cells.map((c) => (
                <button
                  type="button"
                  key={c.no}
                  className="sl-thumb"
                  onClick={() => goto(c.no)}
                  aria-label={`跳到第 ${c.no} 页`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={c.img} alt="" loading="lazy" />
                  <span>{c.no}</span>
                  {stars[c.no] ? <i className="sl-thumb-st" /> : null}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="sl-start"
              onClick={() => goto(1)}
            >
              <IconPlay width={17} height={17} /> 开始播放
            </button>
            <p className="sl-tip">点左右圆形按钮翻页 · 也可左右滑动 / 键盘 ← → · Esc 退出</p>
          </div>
        )}

        {/* 单页 */}
        {cell && (
          <div className={`${slideCls} sl-cell`} key={cell.no}>
            <div className="sl-pic">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={cell.img} alt={cell.t} />
              <span className="sl-no">{cell.no}</span>
              <span className="sl-time">{cell.time}</span>
            </div>
            <div className="sl-txt">
              <div className="sl-step">
                STEP {cell.no} <span>/ {cells.length}</span>
                {blind && <em className="sl-blind-tag">我先说</em>}
              </div>
              <h3 className="sl-t">{cell.t}</h3>

              {gate ? (
                <div className="sl-gate">
                  <p className="sg-tip">看着剧照，自己把这一格说一遍</p>
                  <div className="sg-ring" style={{ "--p": remain / BLIND_WAIT }}>
                    <b>{remain}</b>
                    <i>秒</i>
                  </div>
                  <button
                    type="button"
                    className="sg-btn"
                    onClick={() => setRevealed(true)}
                  >
                    我说完了 · 看句子
                  </button>
                  <p className="sg-hint">
                    {remain > 0 ? `${remain} 秒后自动给答案` : "时间到，答案放出来了"}
                  </p>
                </div>
              ) : (
                <>
                  <p className="sl-en">{cell.en}</p>
                  <p className="sl-cn">{cell.cn}</p>
                </>
              )}

              <div className="sl-foot-row">
                {cell.key && <span className="sl-key">{cell.key}</span>}
                {canSpeak && (
                  <button
                    type="button"
                    className={`sl-again ${talking ? "on" : ""}`}
                    onClick={() => speakCell(cell)}
                    title="点这里才朗读，翻页不会自动出声"
                  >
                    <IconSpeak width={15} height={15} /> 朗读这句
                  </button>
                )}
              </div>

              {blind && revealed && (
                <div className="sl-rate">
                  <span className="sr-q">刚才说得怎么样？</span>
                  <div className="sr-btns">
                    {[1, 2, 3].map((n) => (
                      <button
                        type="button"
                        key={n}
                        className={`sr-b ${cellStar >= n ? "on" : ""}`}
                        onClick={() => api.setStar(lesson.id, cell.no, cellStar === n ? 0 : n)}
                        title={STAR_LABEL[n]}
                        aria-label={STAR_LABEL[n]}
                      >
                        <IconStar />
                      </button>
                    ))}
                  </div>
                  <span className="sr-l">{STAR_LABEL[cellStar] || "点星星记一下"}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 收尾 */}
        {i === total - 1 && (
          <div className={`${slideCls} sl-outro`}>
            <div className="sl-kicker">全部讲完啦 · Let&apos;s say it again</div>
            <h2 className="sl-title sm">用九句话说完整个故事</h2>

            {fivePairs.length > 0 && (
              <div className="sl-five">
                {fivePairs.map(([k, en]) => (
                  <span key={k}>
                    <b>{en}</b>
                    {five[k]}
                  </span>
                ))}
              </div>
            )}

            <div className="sl-words">
              {lesson.words.map(([w, cn]) => (
                <div className="sl-w" key={w}>
                  <b>{w}</b>
                  <span>{cn}</span>
                </div>
              ))}
            </div>

            <div className="sl-frame">
              <p className="sl-chain">First → Then → Next → After that → Finally</p>
              <p>
                <span className="lbl">开头：</span>
                {lesson.opener}
              </p>
              <p>
                <span className="lbl">结尾：</span>
                {lesson.ending}
              </p>
            </div>

            {/* 三阶复述：往上再走两级 */}
            <div className="sl-up">
              <div>
                <b>② 概要</b>
                <p>This episode is about ______ .</p>
              </div>
              <div>
                <b>③ 观点</b>
                <p>I think ______ because ______ .</p>
              </div>
            </div>

            <div className="sl-final">
              <button type="button" className="sl-start" onClick={() => goto(0)}>
                <IconCheck width={16} height={16} /> 重看一遍
              </button>
              <button type="button" className="sl-start ghost" onClick={onClose}>
                回到九宫格
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 底栏：进度点 + 页码（翻页交给左右大按钮） */}
      <div className="deck-bot">
        <div className="deck-dots">
          {Array.from({ length: total }).map((_, n) => (
            <button
              type="button"
              key={n}
              className={`deck-dot ${n === i ? "on" : ""} ${n < i ? "done" : ""}`}
              onClick={() => goto(n)}
              aria-label={`第 ${n + 1} 页`}
            />
          ))}
        </div>
        <span className="deck-count">
          {i + 1} / {total}
        </span>
      </div>
    </div>
  );
}
