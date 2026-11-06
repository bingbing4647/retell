import { notFound } from "next/navigation";
import Link from "next/link";
import NineGrid from "../../../../components/NineGrid";
import { getPeppaLesson, peppaReadyList, peppaVocabMeta } from "../../../../lib/peppa";
import { IconGrid } from "../../../../components/Icons";
import UserMenu from "../../../../components/UserMenu";

// 累积词量统计覆盖全季（51 集字幕全有），不是只算已上线的那几集
const cumEpisodes = Object.values(peppaVocabMeta.seasons || {}).reduce(
  (n, s) => n + (s.n || 0),
  0
);

export function generateStaticParams() {
  return peppaReadyList.map((id) => ({ id }));
}

export async function generateMetadata({ params }) {
  const { id } = await params;
  const lesson = getPeppaLesson(id);
  if (!lesson) return { title: "未找到这一集" };
  return {
    title: `${lesson.id} ${lesson.title} · 小猪佩奇九宫格复述`,
    description: `${lesson.titleCn}——九张剧照、九句英文，看图复述小猪佩奇。`,
  };
}

export default async function PeppaLessonPage({ params }) {
  const { id } = await params;
  const lesson = getPeppaLesson(id);
  if (!lesson) notFound();

  const idx = peppaReadyList.indexOf(id);
  const prevId = idx > 0 ? peppaReadyList[idx - 1] : null;
  const nextId = idx < peppaReadyList.length - 1 ? peppaReadyList[idx + 1] : null;
  const prev = prevId ? getPeppaLesson(prevId) : null;
  const next = nextId ? getPeppaLesson(nextId) : null;

  return (
    <>
      <header className="topbar no-print">
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
          <UserMenu />
          <Link href="/peppa/" className="btn-all">
            小猪佩奇
          </Link>
        </div>
      </header>

      <NineGrid
        lesson={lesson}
        prev={prev}
        next={next}
        seasonPdf={null}
        seriesName="Peppa Pig"
        basePath="/peppa"
        homeHref="/peppa/"
        homeLabel="小猪佩奇"
        seriesVocabMeta={peppaVocabMeta}
        seriesVocabLabel={`全季 ${cumEpisodes} 集累计`}
      />
    </>
  );
}
