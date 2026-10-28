import Link from "next/link";
import Explorer from "../components/Explorer";
import { allEpisodes } from "../lib/episodes";
import { readyList, seasonPdfs } from "../lib/lessons";
import { IconGrid } from "../components/Icons";

export default function Home() {
  const total = allEpisodes.length;
  const done = readyList.length;
  const pct = Math.round((done / total) * 100);

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
        </div>
      </header>

      <section className="hero">
        <div className="wrap">
          <h1>
            看完一集，用九张图<em>把故事讲一遍</em>
          </h1>
          <p>
            每集一页九宫格：九张剧照、九句英文。先跟着格子说短句，再用
            First → Then → Finally 连成一段完整复述。可在线读、可打印带走。
          </p>

          <div className="hero-stats">
            <div className="stat">
              <b>{done}</b>
              <span>集已上线</span>
            </div>
            <div className="stat">
              <b>{total - done}</b>
              <span>集待覆盖</span>
            </div>
            <div className="progress" title={`已上线 ${done}/${total}（${pct}%）`}>
              <i style={{ width: `${Math.max(pct, 2)}%` }} />
            </div>
          </div>
        </div>
      </section>

      <Explorer readyIds={readyList} seasonPdfs={seasonPdfs} />
    </>
  );
}
