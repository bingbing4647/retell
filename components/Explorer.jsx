"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import doraEpisodes from "../lib/episodes.json";
import doraVocab from "../lib/vocab.json";
import peppaVocab from "../lib/peppa/vocab.json";
import { IconSearch, IconCheck, IconGrid, IconDownload } from "./Icons";
import { seasonPdfName } from "../lib/filename";
import { useRetell } from "../lib/progress";
import { EVENT, track } from "../lib/track";

const SEASONS = [1, 2, 3, 4, 5];

function pad(n) {
  return String(n).padStart(2, "0");
}

function fmtSize(bytes) {
  if (!bytes) return "";
  if (bytes < 1048576) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

export default function Explorer({
  readyIds,
  seasonPdfs = {},
  seasonVocab = {},
  // 多剧集支持：不传就是原来那套朵拉数据，行为完全不变
  episodes = doraEpisodes,
  seasons = SEASONS,
  basePath = "",
  // 季列表页（/dora/s1/）：锁死这一季，不显示季切换 tab（季切换由页面上的链接负责）
  fixedSeason = 0,
  // 佩奇还没有整季 PDF 时曾用它隐藏占位；现在两剧都有了，保留参数兼容旧调用
  showPdfHint = true,
  // 下载文件名前缀：Dora / Peppa（lib/filename.js seasonPdfName）
  seriesLabel = "Dora",
}) {
  // 词汇量表按剧集切换：朵拉 / 佩奇各一份，key 都是集号（S02E14 / P01E01）
  const vocab = basePath.startsWith("/peppa") ? peppaVocab : doraVocab;
  const ready = useMemo(() => new Set(readyIds), [readyIds]);
  const [season, setSeason] = useState(fixedSeason || 0); // 0 = 全部
  const [q, setQ] = useState("");
  const [onlyReady, setOnlyReady] = useState(false);
  const [toast, setToast] = useState("");
  const timer = useRef(null);
  // 与单集页共用同一个「孩子的听力词汇总量」（存在进度库 settings.level）
  const [store] = useRetell();
  const myLevel =
    Number(store.settings.level) >= 200 ? Number(store.settings.level) : 800;
  // 曲线档位 100..5000，每 100 一档
  const hitOf = (id) => {
    const c = vocab[id] && vocab[id].curve;
    if (!c) return null;
    return c[Math.max(0, Math.min(c.length - 1, Math.round(myLevel / 100) - 1))];
  };
  const hitCls = (h) => (h >= 88 ? "ok" : h >= 82 ? "mid" : h >= 75 ? "warn" : "bad");

  const showToast = (msg) => {
    setToast(msg);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(""), 2600);
  };

  const counts = useMemo(() => {
    const m = {};
    episodes.forEach((e) => {
      m[e.s] = (m[e.s] || 0) + 1;
    });
    return m;
  }, [episodes]);

  const list = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return episodes.filter((e) => {
      if (season && e.s !== season) return false;
      if (onlyReady && !ready.has(e.id)) return false;
      if (kw) {
        const hay = `${e.id} ${e.t} ${pad(e.s)} ${pad(e.e)}`.toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      return true;
    });
  }, [season, q, onlyReady, ready, episodes]);

  // 已上线的排前面（同季内），方便老板快速点到
  const sorted = useMemo(() => {
    return [...list].sort((a, b) => {
      const ra = ready.has(a.id) ? 0 : 1;
      const rb = ready.has(b.id) ? 0 : 1;
      if (ra !== rb && !season) return ra - rb;
      return a.s - b.s || a.e - b.e;
    });
  }, [list, ready, season]);

  /* 搜索埋点：停手 700ms 才记一笔，避免逐字上报 */
  useEffect(() => {
    const kw = q.trim();
    if (kw.length < 2) return undefined;
    const t = setTimeout(() => {
      track(EVENT.SEARCH, { q: kw, results: sorted.length });
    }, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const pickSeason = (s) => {
    setSeason(s);
    track(EVENT.FILTER_SEASON, { season: s });
  };

  return (
    <>
      <div className="toolbar">
        <div className="wrap toolbar-in">
          {/* 季列表页的季切换由页面上的链接负责，这里不再重复一行 tab */}
          {!fixedSeason && (
            <div className="tabs">
              <button
                className={`tab ${season === 0 ? "on" : ""}`}
                onClick={() => pickSeason(0)}
              >
                全部 <i>{episodes.length}</i>
              </button>
              {seasons.map((s) => (
                <button
                  key={s}
                  className={`tab ${season === s ? "on" : ""}`}
                  onClick={() => pickSeason(s)}
                >
                  S{s} <i>{counts[s]}</i>
                </button>
              ))}
            </div>
          )}

          <span className="toolbar-now">
            {fixedSeason ? `第 ${fixedSeason} 季` : ""}
          </span>

          <div className="toolbar-sp" />

          <button
            className={`only-ready ${onlyReady ? "on" : ""}`}
            onClick={() => setOnlyReady((v) => !v)}
            aria-pressed={onlyReady}
          >
            <span className="dot">{onlyReady && <IconCheck />}</span>
            只看已上线
          </button>

          <label className="search">
            <IconSearch />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="搜剧名 / 编号"
              aria-label="搜索剧集"
            />
          </label>
        </div>
      </div>

      <div className="grid-area">
        <div className="wrap">
          {season !== 0 && (
            <div className="season-bar">
              <div className="sb-txt">
                <b>S{season}</b>
                <span>
                  共 {counts[season] || 0} 集 · 已上线{" "}
                  {episodes.filter((e) => e.s === season && ready.has(e.id)).length} 集
                  {seasonVocab[season] && (
                    <>
                      {" "}
                      · 词元 {seasonVocab[season].p25}–{seasonVocab[season].p75}
                      （中位 {seasonVocab[season].median}）· 语速{" "}
                      {seasonVocab[season].wpm} wpm
                      {seasonVocab[season].n &&
                      seasonVocab[season].n < (counts[season] || 0)
                        ? `（按已上线 ${seasonVocab[season].n} 集实测）`
                        : ""}
                      {(() => {
                        const c = seasonVocab[season].curve;
                        if (!c) return null;
                        const h = c[Math.max(0, Math.min(c.length - 1, Math.round(myLevel / 100) - 1))];
                        return (
                          <>
                            {" "}
                            · <b className="sb-hit">{myLevel} 词可懂 {h}%</b>
                          </>
                        );
                      })()}
                    </>
                  )}
                </span>
              </div>
              <div className="sb-sp" />
              {seasonPdfs[String(season)] ? (
                <a
                  className="btn primary"
                  href={seasonPdfs[String(season)].url}
                  download={seasonPdfName(
                    season,
                    seasonPdfs[String(season)].episodes,
                    seriesLabel
                  )}
                  onClick={() =>
                    track(EVENT.DOWNLOAD_PDF, {
                      kind: "season",
                      season,
                      from: "explorer",
                    })
                  }
                  title="把这一季所有已上线的集合并成一个 PDF 下载"
                >
                  <IconDownload />
                  整季 PDF · {seasonPdfs[String(season)].pages} 页
                  {seasonPdfs[String(season)].bytes
                    ? ` · ${fmtSize(seasonPdfs[String(season)].bytes)}`
                    : ""}
                </a>
              ) : showPdfHint ? (
                <span className="sb-hint">整季 PDF 正在生成中</span>
              ) : null}
            </div>
          )}

          <div className="section-note">
            <IconGrid width={14} height={14} />
            {sorted.length} 集 · 点亮的可以进去做复述，其余正在陆续上线
          </div>

          {sorted.length === 0 ? (
            <div className="empty">
              <b>没有匹配的剧集</b>
              换个关键词，或点「全部」看看
            </div>
          ) : (
            <div className="cards">
              {sorted.map((e) => {
                const isReady = ready.has(e.id);
                const code = `${pad(e.s)}${pad(e.e)}`;
                if (isReady) {
                  return (
                    <Link
                      key={e.id}
                      href={`${basePath}/lesson/${e.id}/`}
                      className="card ready"
                    >
                      <div className="card-thumb">
                        <span className="tag-ready">
                          <IconCheck /> 可复述
                        </span>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`/img/${e.id.toLowerCase()}/f1.jpg`}
                          alt={e.t}
                          loading="lazy"
                        />
                      </div>
                      <div className="card-body">
                        <div className="card-ep">{e.id}</div>
                        <div className="card-title">{e.t}</div>
                        {vocab[e.id] && (
                          <div className="card-vocab">
                            <b>{vocab[e.id].lemmas}</b> 词
                            <i>·</i>
                            {Math.round(vocab[e.id].wpm)} wpm
                            {hitOf(e.id) != null && (
                              <span className={`card-hit ${hitCls(hitOf(e.id))}`}>
                                懂 {hitOf(e.id)}%
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </Link>
                  );
                }
                return (
                  <div
                    key={e.id}
                    className="card todo"
                    role="button"
                    tabIndex={0}
                    onClick={() =>
                      showToast(`${e.id} · ${e.t}　这集还在制作中`)
                    }
                    onKeyDown={(ev) => {
                      if (ev.key === "Enter" || ev.key === " ") {
                        ev.preventDefault();
                        showToast(`${e.id} · ${e.t}　这集还在制作中`);
                      }
                    }}
                  >
                    <div className="card-thumb">
                      <span className="todo-num">{code}</span>
                    </div>
                    <div className="card-body">
                      <div className="card-ep">{e.id}</div>
                      <div className="card-title">{e.t}</div>
                      {vocab[e.id] && (
                        <div className="card-vocab">
                          <b>{vocab[e.id].lemmas}</b> 词
                          <i>·</i>
                          {Math.round(vocab[e.id].wpm)} wpm
                          {hitOf(e.id) != null && (
                            <span className={`card-hit ${hitCls(hitOf(e.id))}`}>
                              懂 {hitOf(e.id)}%
                            </span>
                          )}
                        </div>
                      )}
                      <div className="todo-hint">待制作</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className={`toast ${toast ? "on" : ""}`} role="status">
        {toast}
      </div>
    </>
  );
}
