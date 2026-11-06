import Link from "next/link";
import SeriesList from "../components/SeriesList";
import { series } from "../lib/series";
import { IconGrid } from "../components/Icons";
import UserMenu from "../components/UserMenu";

export const metadata = {
  title: "英语九宫格复述 · 朵拉爱冒险 / 小猪佩奇",
  description:
    "每集九张剧照、九句英文，看图把故事讲一遍。先挑一部剧，再挑一季，最后挑一集。",
};

export default function Home() {
  const totalEp = series.reduce((a, s) => a + s.total, 0);
  const totalDone = series.reduce((a, s) => a + s.done, 0);
  const totalSeason = series.reduce((a, s) => a + s.seasons.length, 0);

  return (
    <>
      <header className="topbar">
        <div className="wrap topbar-in">
          <Link href="/" className="brand">
            <span className="brand-mark">
              <IconGrid width={17} height={17} />
            </span>
            <span>
              英语九宫格复述
              <small>RETELL WITH 9 FRAMES · DORA &amp; PEPPA</small>
            </span>
          </Link>
          <div className="topbar-sp" />
          <UserMenu />
        </div>
      </header>

      <section className="hero">
        <div className="wrap">
          <h1>
            先挑一部剧，再看图<em>把故事讲一遍</em>
          </h1>
          <p>
            每集一页九宫格：九张剧照、九句英文。跟着格子说短句，再用
            First → Then → Finally 连成一段完整复述。可在线读、可打印带走。
          </p>

          <div className="hero-stats">
            <div className="stat">
              <b>{series.length}</b>
              <span>部剧</span>
            </div>
            <div className="stat">
              <b>{totalSeason}</b>
              <span>季</span>
            </div>
            <div className="stat">
              <b>{totalDone}</b>
              <span>集已上线 / 共 {totalEp} 集</span>
            </div>
          </div>
        </div>
      </section>

      <section className="series-area">
        <div className="wrap">
          <SeriesList items={series} />
        </div>
      </section>
    </>
  );
}
