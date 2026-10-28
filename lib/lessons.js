// 已制作完成的「九宫格复述」课程内容，数据在 lessons.json。
// 新增一集：往 lessons.json 里加一条（id 与 episodes.json 一致），页面无需改动。
//
// PDF 规则：public/pdf/<ID>.pdf 存在 → 详情页出现「下载 PDF」；
//           public/pdf/season-XX.pdf 存在 → 首页对应季出现「整季 PDF」。
//           manifest.json 由 scripts/merge-pdf.py 生成，缺失时退回按文件存在性判断。
import fs from "node:fs";
import path from "node:path";
import lessonsData from "./lessons.json";

const PDF_DIR = path.join(process.cwd(), "public", "pdf");

function readManifest() {
  try {
    return JSON.parse(fs.readFileSync(path.join(PDF_DIR, "manifest.json"), "utf8"));
  } catch {
    return null;
  }
}

function hasPdf(id) {
  try {
    return fs.existsSync(path.join(PDF_DIR, id + ".pdf"));
  } catch {
    return false;
  }
}

const manifest = readManifest();

export const lessons = Object.fromEntries(
  Object.entries(lessonsData).map(([id, l]) => {
    if (l.pdf) return [id, l];
    if (manifest?.episodes?.[id] || hasPdf(id)) return [id, { ...l, pdf: `/pdf/${id}.pdf` }];
    return [id, l];
  })
);

// { "2": {url, episodes, pages, bytes}, "3": {...} }
export const seasonPdfs = manifest?.seasons || {};

export const readyIds = Object.keys(lessons);

export function getLesson(id) {
  return lessons[id] || null;
}

// 按季/集顺序排列的「已上线」列表，供详情页上下集切换
export const readyList = readyIds.sort((a, b) => {
  const na = Number(a.slice(1, 3)) * 1000 + Number(a.slice(4));
  const nb = Number(b.slice(1, 3)) * 1000 + Number(b.slice(4));
  return na - nb;
});
