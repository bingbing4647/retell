import Link from "next/link";
import { notFound } from "next/navigation";
import Explorer from "../../../../components/Explorer";
import { dora } from "../../../../lib/series";
import { readyList, seasonPdfs, seasonVocab } from "../../../../lib/lessons";
import { allEpisodes } from "../../../../lib/episodes";
import { IconGrid } from "../../../../components/Icons";
import UserMenu from "../../../../components/UserMenu";

export function generateStaticParams() {
  return dora.seasons.map((s) => ({ season: String(s.n) }));
}

export async function generateMetadata({ params }) {
  const { season } = await params;
  const s = dora.seasons.find((x) => String(x.n) === String(season));
  if (!s) return { title: "未找到这一季" };
  return {
    title: `朵拉爱冒险 第 ${s.n} 季 · 九宫格复述`,
    description: `Dora 第 ${s.n} 季共 ${s.total} 集，已上线 ${s.done} 集，看图说英文。`,
  };
}

export default async function DoraSeasonPage({ params }) {
  const { season } = await params;
  const s = dora.seasons.find((x) => String(x.n) === String(season));
  if (!s) notFound();

  return (
    <>
      <header className="topbar">
        <div className="wrap topbar-in">
          <Link href="/dora/" className="brand">
            <span className="brand-mark">
              <IconGrid width={17} height={17} />
            </span>
            <span>
              朵拉爱冒险 · 第 {s.n} 季
              <small>DORA THE EXPLORER · SEASON {s.n}</small>
            </span>
          </Link>
          <div className="topbar-sp" />
          <Link href="/peppa/" className="btn-all">
            小猪佩奇
          </Link>
          <UserMenu />
        </div>
      </header>

      <div className="wrap">
        <div className="crumb">
          <Link href="/">首页</Link>
          <span>/</span>
          <Link href="/dora/">朵拉爱冒险</Link>
          <span>/</span>
          <span>第 {s.n} 季</span>
        </div>
        <div className="season-switch">
          {dora.seasons.map((x) => (
            <Link
              key={x.n}
              href={`/dora/s/${x.n}/`}
              className={`ss ${x.n === s.n ? "on" : ""}`}
            >
              S{x.n} <i>{x.total}</i>
            </Link>
          ))}
        </div>
      </div>

      <Explorer
        readyIds={readyList}
        seasonPdfs={seasonPdfs}
        seasonVocab={seasonVocab}
        episodes={allEpisodes}
        seasons={dora.seasons.map((x) => x.n)}
        basePath=""
        fixedSeason={s.n}
      />
    </>
  );
}
