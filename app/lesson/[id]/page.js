import { notFound } from "next/navigation";
import Link from "next/link";
import NineGrid from "../../../components/NineGrid";
import { getLesson, readyList, seasonPdfs } from "../../../lib/lessons";
import { IconGrid } from "../../../components/Icons";

export function generateStaticParams() {
  return readyList.map((id) => ({ id }));
}

export async function generateMetadata({ params }) {
  const { id } = await params;
  const lesson = getLesson(id);
  if (!lesson) return { title: "未找到这一集" };
  return {
    title: `${lesson.id} ${lesson.title} · 九宫格复述`,
    description: `${lesson.titleCn}——九张剧照、九句英文，三年级英语复述练习。`,
  };
}

export default async function LessonPage({ params }) {
  const { id } = await params;
  const lesson = getLesson(id);
  if (!lesson) notFound();

  const idx = readyList.indexOf(id);
  const prevId = idx > 0 ? readyList[idx - 1] : null;
  const nextId = idx < readyList.length - 1 ? readyList[idx + 1] : null;
  const prev = prevId ? getLesson(prevId) : null;
  const next = nextId ? getLesson(nextId) : null;

  return (
    <>
      <header className="topbar no-print">
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
          <Link href="/" className="btn-all">
            全部剧集
          </Link>
        </div>
      </header>

      <NineGrid
        lesson={lesson}
        prev={prev}
        next={next}
        seasonPdf={seasonPdfs[String(lesson.season)] || null}
      />
    </>
  );
}
