import Link from "next/link";
import SeasonGrid from "../../components/SeasonGrid";
import { dora } from "../../lib/series";
import { IconGrid } from "../../components/Icons";
import UserMenu from "../../components/UserMenu";

export const metadata = {
  title: "朵拉爱冒险 · 选季 · 英语九宫格复述",
  description:
    "Dora the Explorer 九宫格复述：先选一季，再挑一集，用九张剧照九句英文把故事讲一遍。",
};

export default function DoraHome() {
  const pct = Math.round((dora.done / dora.total) * 100);

  return (
    <>
      <header className="topbar">
        <div className="wrap topbar-in">
          <Link href="/" className="brand">
            <span className="brand-mark">
              <IconGrid width={17} height={17} />
            </span>
            <span>
              朵拉爱冒险 · 英语复述
              <small>DORA THE EXPLORER · RETELL WITH 9 FRAMES</small>
            </span>
          </Link>
          <div className="topbar-sp" />
          <Link href="/peppa/" className="btn-all">
            小猪佩奇
          </Link>
          <UserMenu />
        </div>
      </header>

      <section className="hero">
        <div className="wrap">
          <div className="crumb">
            <Link href="/">← 首页</Link>
            <span>/</span>
            <span>朵拉爱冒险</span>
          </div>
          <h1>
            想复述哪一季？<em>先选季，再挑集</em>
          </h1>
          <p>{dora.blurb}</p>

          <div className="hero-stats">
            <div className="stat">
              <b>{dora.seasons.length}</b>
              <span>季</span>
            </div>
            <div className="stat">
              <b>{dora.done}</b>
              <span>集已上线</span>
            </div>
            <div className="stat">
              <b>{dora.total - dora.done}</b>
              <span>集待覆盖</span>
            </div>
            <div className="progress" title={`已上线 ${dora.done}/${dora.total}（${pct}%）`}>
              <i style={{ width: `${Math.max(pct, 2)}%` }} />
            </div>
          </div>
        </div>
      </section>

      <section className="series-area">
        <div className="wrap">
          <div className="pick-head">
            <b>选择一季</b>
            <span>每季点进去是这个季的全部剧集，可以搜剧名、只看已上线</span>
            <div className="pick-sp" />
            <Link href="/dora/all/" className="btn-all">
              浏览全部 {dora.total} 集
            </Link>
          </div>
          <SeasonGrid item={dora} />
        </div>
      </section>
    </>
  );
}
