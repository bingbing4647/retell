import Link from "next/link";
import SeasonGrid from "../../components/SeasonGrid";
import { peppa } from "../../lib/series";
import { IconGrid } from "../../components/Icons";
import UserMenu from "../../components/UserMenu";

export const metadata = {
  title: "小猪佩奇 · 选季 · 英语九宫格复述",
  description:
    "Peppa Pig 九宫格复述：先选一季，再挑一集，九张剧照九句英文，看图把故事讲一遍。",
};

export default function PeppaHome() {
  const pct = Math.round((peppa.done / peppa.total) * 100);

  return (
    <>
      <header className="topbar">
        <div className="wrap topbar-in">
          <Link href="/" className="brand">
            <span className="brand-mark">
              <IconGrid width={17} height={17} />
            </span>
            <span>
              小猪佩奇 · 英语复述
              <small>PEPPA PIG · RETELL WITH 9 FRAMES</small>
            </span>
          </Link>
          <div className="topbar-sp" />
          <Link href="/dora/" className="btn-all">
            朵拉爱冒险
          </Link>
          <UserMenu />
        </div>
      </header>

      <section className="hero">
        <div className="wrap">
          <div className="crumb">
            <Link href="/">← 首页</Link>
            <span>/</span>
            <span>小猪佩奇</span>
          </div>
          <h1>
            想复述哪一季？<em>先选季，再挑集</em>
          </h1>
          <p>{peppa.blurb}</p>

          <div className="hero-stats">
            <div className="stat">
              <b>{peppa.seasons.length}</b>
              <span>季</span>
            </div>
            <div className="stat">
              <b>{peppa.done}</b>
              <span>集已上线</span>
            </div>
            <div className="stat">
              <b>{peppa.total - peppa.done}</b>
              <span>集待覆盖</span>
            </div>
            <div className="progress" title={`已上线 ${peppa.done}/${peppa.total}（${pct}%）`}>
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
            <Link href="/peppa/all/" className="btn-all">
              浏览全部 {peppa.total} 集
            </Link>
          </div>
          <SeasonGrid item={peppa} />
        </div>
      </section>
    </>
  );
}
