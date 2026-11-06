"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

// 首页剧集列表：一页 9 个（3×3），多了自动出分页。
// 以后再加小猪佩奇以外的剧（Bluey、Cocomelon…），只要往 lib/series.js 里加数据即可。
const PER_PAGE = 9;

export default function SeriesList({ items }) {
  const pages = Math.max(1, Math.ceil(items.length / PER_PAGE));
  const [page, setPage] = useState(1);
  const cur = Math.min(page, pages);

  const slice = useMemo(
    () => items.slice((cur - 1) * PER_PAGE, cur * PER_PAGE),
    [items, cur]
  );

  return (
    <>
      <div className="series-grid">
        {slice.map((s) => {
          const pct = s.total ? Math.round((s.done / s.total) * 100) : 0;
          return (
            <Link key={s.key} href={s.href} className={`series-card ${s.tint}`}>
              <div className="series-pic">
                {s.hero && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={s.hero} alt={s.name} loading="lazy" />
                )}
                <span className="series-badge">
                  {s.seasons.length} 季 · {s.total} 集
                </span>
              </div>
              <div className="series-body">
                <div className="series-en">{s.en}</div>
                <h2>{s.name}</h2>
                <p>{s.tagline}</p>
                <div className="series-foot">
                  <span className="series-done">
                    已上线 <b>{s.done}</b> 集
                  </span>
                  <span className="series-go">选季进入 →</span>
                </div>
                <div className="progress" title={`已上线 ${s.done}/${s.total}`}>
                  <i style={{ width: `${Math.max(pct, 2)}%` }} />
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      {pages > 1 && (
        <div className="pager">
          <button
            type="button"
            onClick={() => setPage(cur - 1)}
            disabled={cur === 1}
            aria-label="上一页"
          >
            ‹
          </button>
          {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              className={n === cur ? "on" : ""}
              onClick={() => setPage(n)}
              aria-current={n === cur ? "page" : undefined}
            >
              {n}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setPage(cur + 1)}
            disabled={cur === pages}
            aria-label="下一页"
          >
            ›
          </button>
          <span className="pg-info">
            共 {items.length} 部 · 每页 {PER_PAGE} 部
          </span>
        </div>
      )}
    </>
  );
}
