import Link from "next/link";
import Explorer from "../../../components/Explorer";
import { dora } from "../../../lib/series";
import { allEpisodes } from "../../../lib/episodes";
import { readyList, seasonPdfs, seasonVocab } from "../../../lib/lessons";
import { IconGrid } from "../../../components/Icons";
import UserMenu from "../../../components/UserMenu";

export const metadata = {
  title: "朵拉爱冒险 · 全部剧集 · 九宫格复述",
  description:
    "Dora the Explorer 全 5 季 117 集清单，按季筛选、按剧名搜索，点亮即可进去复述。",
};

export default function DoraAllPage() {
  return (
    <>
      <header className="topbar">
        <div className="wrap topbar-in">
          <Link href="/dora/" className="brand">
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

      <div className="wrap">
        <div className="crumb">
          <Link href="/">首页</Link>
          <span>/</span>
          <Link href="/dora/">朵拉爱冒险</Link>
          <span>/</span>
          <span>全部 {dora.total} 集</span>
        </div>
      </div>

      <Explorer
        readyIds={readyList}
        seasonPdfs={seasonPdfs}
        seasonVocab={seasonVocab}
        episodes={allEpisodes}
        seasons={dora.seasons.map((x) => x.n)}
        basePath=""
      />
    </>
  );
}
