"use client";

// 复述训练场：把「英语复述法」落成可点的交互
// ① 五指 5W：点手指 → 挑关键词 → 串成五句
// ② 三阶复述：细节 → 概要 → 观点，走完打勾
// ③ 我先说：延迟复述（看图先自己说 10 秒，再看答案）

import { useMemo, useState } from "react";
import { IconCheck, IconEye, IconPlay, IconSpeak, IconStar } from "./Icons";
import { BLIND_WAIT, speak, tally, useRetell } from "../lib/progress";

const FINGERS = [
  { k: "who", en: "Who", cn: "人物", q: "故事里有谁？", demo: "Dora and Boots" },
  { k: "what", en: "What", cn: "事件", q: "他们去做什么？", demo: "find the fire truck" },
  { k: "where", en: "Where", cn: "地点", q: "在哪里发生？", demo: "on Snowy Mountain" },
  { k: "when", en: "When", cn: "顺序", q: "先…再…最后…", demo: "first the hill, then the slide" },
  { k: "how", en: "How", cn: "感受", q: "你觉得怎么样？", demo: "exciting" },
];

const LADDER = [
  {
    k: "detail",
    no: "①",
    name: "细节复述",
    sub: "九句全说完，顺序不乱",
    frame: "First → Then → Next → After that → Finally",
    cta: "从第 1 格开始练",
  },
  {
    k: "summary",
    no: "②",
    name: "概要复述",
    sub: "一句话说明这集讲了什么",
    frame: "This episode is about ______ .",
    cta: null,
  },
  {
    k: "opinion",
    no: "③",
    name: "观点复述",
    sub: "加上你自己的评价",
    frame: "I think ______ because ______ . My favorite part is ______ .",
    cta: null,
  },
];

export default function RetellLab({ lesson, onPlay, onPractice }) {
  const [store, api] = useRetell();
  const five = store.five[lesson.id] || {};
  const steps = store.steps[lesson.id] || {};
  const rate = store.settings.rate || 1;
  const stat = tally(store.stars[lesson.id] || {});
  const [open, setOpen] = useState(null);
  const [draft, setDraft] = useState("");

  const cellsChips = useMemo(() => {
    const seen = new Set();
    const out = [];
    lesson.cells.forEach((c) => {
      String(c.key || "")
        .split("·")
        .forEach((raw) => {
          const w = raw.trim();
          const k = w.toLowerCase();
          if (!w || w.length > 26 || seen.has(k)) return;
          seen.add(k);
          out.push({ w, from: `${c.no}` });
        });
    });
    return out;
  }, [lesson]);

  const bankChips = useMemo(
    () =>
      lesson.words
        .map(([w, cn]) => ({ w, cn }))
        .filter((x, i, arr) => arr.findIndex((y) => y.w === x.w) === i),
    [lesson]
  );

  const picked = FINGERS.map((f) => ({ ...f, v: (five[f.k] || "").trim() }));
  const filled = picked.filter((f) => f.v);
  const stepDone = LADDER.filter((l) => steps[l.k]).length;
  const cur = open ? FINGERS.find((f) => f.k === open) : null;

  const commit = (k, v) => {
    api.setFive(lesson.id, k, v);
    setDraft("");
    setOpen(null);
  };

  const readFive = () => {
    if (!filled.length) return;
    speak(filled.map((f) => f.v).join(", "), rate);
  };

  return (
    <section className="lab no-print">
      <div className="wrap">
        <div className="lab-h">
          <div className="lab-ht">
            <div className="lab-k">RETELL LAB · 复述训练场</div>
            <h2>三种练法，从「说出来」到「说出自己的想法」</h2>
            <p>
              先看一遍动画，再来这里练。三种方法挑一种就够，孩子接得住哪种就用哪种。
            </p>
          </div>
          <div className="lab-score">
            <div className="ls-item">
              <b>
                {stepDone}
                <i>/3</i>
              </b>
              <span>三阶过关</span>
            </div>
            <div className="ls-item">
              <b>
                {stat.done}
                <i>/9</i>
              </b>
              <span>自测格数</span>
            </div>
            <div className="ls-item">
              <b>
                {stat.stars}
                <IconStar />
              </b>
              <span>累计星星</span>
            </div>
          </div>
        </div>

        {/* ---------- ① 五指 5W ---------- */}
        <div className="lab-card">
          <div className="lc-h">
            <span className="lc-no">1</span>
            <div className="lc-ht">
              <b>五指 5W 法</b>
              <i>右手五根手指 = 五条线索，先抓关键词，再串成句子</i>
            </div>
            <span className={`lc-flag ${filled.length === 5 ? "ok" : ""}`}>
              {filled.length === 5 ? <IconCheck /> : null}
              已填 {filled.length}/5
            </span>
          </div>

          <div className="fr5">
            {picked.map((f, idx) => (
              <button
                type="button"
                key={f.k}
                className={`fr5-slot ${f.v ? "has" : ""} ${open === f.k ? "on" : ""}`}
                onClick={() => {
                  setOpen(open === f.k ? null : f.k);
                  setDraft("");
                }}
              >
                <span className="fs-n">{idx + 1}</span>
                <span className="fs-en">{f.en}</span>
                <span className="fs-cn">{f.cn}</span>
                <span className="fs-v">{f.v || "点一下选关键词"}</span>
              </button>
            ))}
          </div>

          {cur && (
            <div className="fr5-pk">
              <div className="pk-h">
                <b>
                  {cur.en} · {cur.cn}
                </b>
                <span>
                  {cur.q}　例：{cur.demo}
                </span>
                <div className="pk-sp" />
                {five[cur.k] && (
                  <button
                    type="button"
                    className="pk-clear"
                    onClick={() => commit(cur.k, "")}
                  >
                    清空
                  </button>
                )}
                <button type="button" className="pk-x" onClick={() => setOpen(null)}>
                  收起
                </button>
              </div>

              <div className="pk-row">
                <i>剧照关键词</i>
                <div className="pk-chips">
                  {cellsChips.map((c) => (
                    <button
                      type="button"
                      key={c.w}
                      className="chip"
                      onClick={() => commit(cur.k, c.w)}
                    >
                      {c.w}
                      <em>{c.from}</em>
                    </button>
                  ))}
                </div>
              </div>

              <div className="pk-row">
                <i>Word Bank</i>
                <div className="pk-chips">
                  {bankChips.map((c) => (
                    <button
                      type="button"
                      key={c.w}
                      className="chip bank"
                      onClick={() => commit(cur.k, c.w)}
                    >
                      {c.w}
                      <em>{c.cn}</em>
                    </button>
                  ))}
                </div>
              </div>

              <form
                className="pk-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  const v = draft.trim();
                  if (v) commit(cur.k, v);
                }}
              >
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={`也可以自己写一句 / 一个词，例：${cur.demo}`}
                  aria-label={`给 ${cur.en} 自己写一个关键词`}
                />
                <button type="submit" className="btn primary" disabled={!draft.trim()}>
                  填入
                </button>
              </form>
            </div>
          )}

          <div className={`fr5-out ${filled.length ? "on" : ""}`}>
            {filled.length ? (
              <>
                <ul>
                  {picked.map((f, idx) =>
                    f.v ? (
                      <li key={f.k}>
                        <span className="fo-n">{idx + 1}</span>
                        <span className="fo-k">{f.en}</span>
                        <span className="fo-v">{f.v}</span>
                      </li>
                    ) : null
                  )}
                </ul>
                <div className="fo-act">
                  <button type="button" className="btn" onClick={readFive}>
                    <IconSpeak width={14} height={14} /> 读一遍提示词
                  </button>
                  <span>然后合上屏幕，用这五条把故事讲一遍——自己讲，不要照着念。</span>
                </div>
              </>
            ) : (
              <p className="fo-tip">
                点上面任意一根手指，从剧照里挑一个关键词填进去。五格填满，故事骨架就有了。
              </p>
            )}
          </div>
        </div>

        {/* ---------- ② 三阶复述 ---------- */}
        <div className="lab-card">
          <div className="lc-h">
            <span className="lc-no">2</span>
            <div className="lc-ht">
              <b>三阶复述法</b>
              <i>能把九句说顺了再往上走：细节 → 概要 → 观点</i>
            </div>
            <span className={`lc-flag ${stepDone === 3 ? "ok" : ""}`}>
              {stepDone === 3 ? <IconCheck /> : null}
              走过 {stepDone}/3 阶
            </span>
          </div>

          <div className="ladder">
            {LADDER.map((l) => (
              <div key={l.k} className={`rung ${steps[l.k] ? "done" : ""}`}>
                <div className="rung-h">
                  <span className="rung-no">{l.no}</span>
                  <b>{l.name}</b>
                  <i>{l.sub}</i>
                  <div className="rung-sp" />
                  {l.cta && onPlay && (
                    <button type="button" className="btn sm" onClick={onPlay}>
                      <IconPlay width={13} height={13} /> {l.cta}
                    </button>
                  )}
                  <button
                    type="button"
                    className={`rung-ck ${steps[l.k] ? "on" : ""}`}
                    onClick={() => api.setStep(lesson.id, l.k, !steps[l.k])}
                    aria-pressed={!!steps[l.k]}
                  >
                    <IconCheck /> {steps[l.k] ? "今天说过了" : "说完了，打勾"}
                  </button>
                </div>
                <p className="rung-f">{l.frame}</p>
                {l.k === "summary" && (five.who || five.what) && (
                  <p className="rung-hint">
                    用你填的线索：{five.who ? `「${five.who}」` : ""}
                    {five.what ? ` + 「${five.what}」` : ""}
                  </p>
                )}
                {l.k === "opinion" && (
                  <p className="rung-hint">
                    不知道说什么就讲感受：funny / exciting / a little scary，再补一个 because。
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* ---------- ③ 我先说 ---------- */}
        <div className="lab-card">
          <div className="lc-h">
            <span className="lc-no">3</span>
            <div className="lc-ht">
              <b>我先说 · 延迟复述</b>
              <i>看图先自己讲，{BLIND_WAIT} 秒后才给答案——比照着念记得牢</i>
            </div>
          </div>
          <div className="blind-row">
            <div className="blind-txt">
              <p>
                进播放模式后打开「我先说」，每页英文和中文会先遮住，只留图和一个小标题。先自己说，说完点「我说完了」对句子，再给自己点星星。
              </p>
              <p className="muted">
                小童可以关掉它、听完立刻复述；大童和自己练的时候，遮住答案更有效。
              </p>
            </div>
            <div className="blind-act">
              <button
                type="button"
                className="btn primary lg"
                onClick={() => {
                  api.setSetting("blind", true);
                  onPractice?.();
                }}
              >
                <IconEye width={15} height={15} /> 用「我先说」模式练
              </button>
              <span>
                本集已自测 {stat.done}/9 格 · 得 {stat.stars} 星
              </span>
            </div>
          </div>
        </div>

        <p className="lab-note">
          练的时候别急着纠错：先让孩子把话说完，明显说错的地方记下来，回看那一格视频时再一起改。愿意开口，比说得准更重要。
        </p>
      </div>
    </section>
  );
}
