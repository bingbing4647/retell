import Link from "next/link";

// 选季网格：首页（选剧集）→「本组件」→ 某季剧集列表
// 传入 lib/series.js 里的 dora / peppa 对象即可，两剧共用一套版式。
export default function SeasonGrid({ item }) {
  return (
    <div className="season-grid">
      {item.seasons.map((s) => {
        const pct = s.total ? Math.round((s.done / s.total) * 100) : 0;
        return (
          <Link key={s.n} href={`${item.href}s/${s.n}/`} className="season-card">
            <div className="season-pic">
              {s.cover && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={s.cover} alt={`${item.name} 第 ${s.n} 季`} loading="lazy" />
              )}
              <span className="season-tag">S{s.n}</span>
              {s.done > 0 && <span className="season-ready">{s.done} 集可复述</span>}
            </div>
            <div className="season-body">
              <div className="season-head">
                <b>第 {s.n} 季</b>
                <span>
                  {s.done}/{s.total} 集
                </span>
              </div>
              <div className="progress sm" title={`已上线 ${s.done}/${s.total}`}>
                <i style={{ width: `${Math.max(pct, 2)}%` }} />
              </div>
              <div className="season-foot">
                {s.vocab ? (
                  <>
                    词元 {s.vocab.p25}–{s.vocab.p75}（中位 {s.vocab.median}）·{" "}
                    {s.vocab.wpm} wpm
                    {/* 统计只覆盖已上线的集时，别让它看起来像整季的数 */}
                    {s.vocab.n && s.vocab.n < s.total ? ` · 已上线 ${s.vocab.n} 集实测` : ""}
                  </>
                ) : (
                  <>
                    {s.total - s.done > 0
                      ? `${s.total - s.done} 集待上线`
                      : "本季已全部上线"}
                  </>
                )}
              </div>
            </div>
          </Link>
        );
      })}

      {/* 只有一季的剧，右边留着一大片空白，用一张说明卡补位 */}
      {item.seasons.length === 1 && (
        <div className="season-tip">
          <b>目前只有 1 季</b>
          <p>
            {item.total} 集片源已就位，已上线 {item.done} 集，其余正在陆续制作，
            补一集上线一集。
          </p>
        </div>
      )}
    </div>
  );
}
