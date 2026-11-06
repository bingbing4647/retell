import Link from "next/link";
import Explorer from "../../../components/Explorer";
import { peppa } from "../../../lib/series";
import { peppaEpisodes, peppaReadyList, peppaSeasonVocab } from "../../../lib/peppa";
import { IconGrid } from "../../../components/Icons";
import UserMenu from "../../../components/UserMenu";

export const metadata = {
  title: "小猪佩奇 · 全部剧集 · 九宫格复述",
  description: "Peppa Pig 全季剧集清单，点亮即可进去做九宫格复述。",
};

export default function PeppaAllPage() {
  return (
    <>
      <header className="topbar">
        <div className="wrap topbar-in">
          <Link href="/peppa/" className="brand">
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

      <div className="wrap">
        <div className="crumb">
          <Link href="/">首页</Link>
          <span>/</span>
          <Link href="/peppa/">小猪佩奇</Link>
          <span>/</span>
          <span>全部 {peppa.total} 集</span>
        </div>
      </div>

      <Explorer
        readyIds={peppaReadyList}
        episodes={peppaEpisodes}
        seasons={peppa.seasons.map((x) => x.n)}
        seasonVocab={peppaSeasonVocab}
        basePath="/peppa"
        showPdfHint={false}
      />
    </>
  );
}
