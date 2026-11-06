import Link from "next/link";
import { notFound } from "next/navigation";
import Explorer from "../../../../components/Explorer";
import { peppa } from "../../../../lib/series";
import { peppaEpisodes, peppaReadyList, peppaSeasonVocab } from "../../../../lib/peppa";
import { IconGrid } from "../../../../components/Icons";
import UserMenu from "../../../../components/UserMenu";

export function generateStaticParams() {
  return peppa.seasons.map((s) => ({ season: String(s.n) }));
}

export async function generateMetadata({ params }) {
  const { season } = await params;
  const s = peppa.seasons.find((x) => String(x.n) === String(season));
  if (!s) return { title: "未找到这一季" };
  return {
    title: `小猪佩奇 第 ${s.n} 季 · 九宫格复述`,
    description: `Peppa Pig 第 ${s.n} 季共 ${s.total} 集，已上线 ${s.done} 集，看图说英文。`,
  };
}

export default async function PeppaSeasonPage({ params }) {
  const { season } = await params;
  const s = peppa.seasons.find((x) => String(x.n) === String(season));
  if (!s) notFound();

  return (
    <>
      <header className="topbar">
        <div className="wrap topbar-in">
          <Link href="/peppa/" className="brand">
            <span className="brand-mark">
              <IconGrid width={17} height={17} />
            </span>
            <span>
              小猪佩奇 · 第 {s.n} 季
              <small>PEPPA PIG · SEASON {s.n}</small>
            </span>
          </Link>
          <div className="topbar-sp" />
          <Link href="/dora/" className="btn-all">
            朵拉爱冒险
          </Link>
          <UserMenu />
        </div>
      </header>

      <div className="wrap">
        <div className="crumb">
          <Link href="/">首页</Link>
          <span>/</span>
          <Link href="/peppa/">小猪佩奇</Link>
          <span>/</span>
          <span>第 {s.n} 季</span>
        </div>
        <div className="season-switch">
          {peppa.seasons.map((x) => (
            <Link
              key={x.n}
              href={`/peppa/s/${x.n}/`}
              className={`ss ${x.n === s.n ? "on" : ""}`}
            >
              S{x.n} <i>{x.total}</i>
            </Link>
          ))}
        </div>
      </div>

      <Explorer
        readyIds={peppaReadyList}
        episodes={peppaEpisodes}
        seasons={peppa.seasons.map((x) => x.n)}
        seasonVocab={peppaSeasonVocab}
        basePath="/peppa"
        fixedSeason={s.n}
        showPdfHint={false}
      />
    </>
  );
}
