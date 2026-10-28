"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import episodes from "../lib/episodes.json";
import { IconSearch, IconCheck, IconGrid } from "./Icons";

const SEASONS = [1, 2, 3, 4, 5];

function pad(n) {
  return String(n).padStart(2, "0");
}

export default function Explorer({ readyIds }) {
  const ready = useMemo(() => new Set(readyIds), [readyIds]);
  const [season, setSeason] = useState(0); // 0 = 全部
  const [q, setQ] = useState("");
  const [onlyReady, setOnlyReady] = useState(false);
  const [toast, setToast] = useState("");
  const timer = useRef(null);

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
  }, []);

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
  }, [season, q, onlyReady, ready]);

  // 已上线的排前面（同季内），方便老板快速点到
  const sorted = useMemo(() => {
    return [...list].sort((a, b) => {
      const ra = ready.has(a.id) ? 0 : 1;
      const rb = ready.has(b.id) ? 0 : 1;
      if (ra !== rb && !season) return ra - rb;
      return a.s - b.s || a.e - b.e;
    });
  }, [list, ready, season]);

  return (
    <>
      <div className="toolbar">
        <div className="wrap toolbar-in">
          <div className="tabs">
            <button
              className={`tab ${season === 0 ? "on" : ""}`}
              onClick={() => setSeason(0)}
            >
              全部 <i>{episodes.length}</i>
            </button>
            {SEASONS.map((s) => (
              <button
                key={s}
                className={`tab ${season === s ? "on" : ""}`}
                onClick={() => setSeason(s)}
              >
                S{s} <i>{counts[s]}</i>
              </button>
            ))}
          </div>

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
              placeholder="搜剧名 / S02E25"
              aria-label="搜索剧集"
            />
          </label>
        </div>
      </div>

      <div className="grid-area">
        <div className="wrap">
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
                      href={`/lesson/${e.id}/`}
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
