// 小猪佩奇（Peppa Pig）第一季的剧集清单与已上线课程内容。
//
// 与朵拉共用同一套页面组件，只是换了一份数据 + basePath。
// 新增一集：在 lib/peppa/parts 里放分片、写进 lessons.json，再把剧照放到
// public/img/p01eNN/（9 张 f1..f9.jpg），页面无需改动。
import fs from "node:fs";
import path from "node:path";
import episodes from "./peppa/episodes.json";
import lessonsData from "./peppa/lessons.json";
import vocabData from "./peppa/vocab.json";
import metaData from "./peppa/vocab-meta.json";

const PDF_DIR = path.join(process.cwd(), "public", "pdf");

function hasPdf(id) {
  try {
    return fs.existsSync(path.join(PDF_DIR, id + ".pdf"));
  } catch {
    return false;
  }
}

// 剧集清单（S1 共 51 集，片源缺 CE037 The Tree House）
export const peppaEpisodes = episodes;
export const peppaSeasons = [1];
export const peppaBasePath = "/peppa";

export const peppaSeasonCount = peppaEpisodes.reduce((acc, e) => {
  acc[e.s] = (acc[e.s] || 0) + 1;
  return acc;
}, {});

// 已上线课程：public/pdf/P01E01.pdf 存在就自动挂上下载按钮
// 佩奇用「问答式」格子（q 问句 / a 答句），这里把 a 派生到 en，
// 让朗读、播放器、复述训练这些按 en 取句子的老逻辑不用改。
export const peppaLessons = Object.fromEntries(
  Object.entries(lessonsData).map(([id, l]) => {
    const cells = (l.cells || []).map((c) => ({ ...c, en: c.en || c.a || "" }));
    const out = { ...l, cells };
    // 每集听力词汇量（scripts/peppa-vocab.py 产出，整集音轨 ASR 统计）
    if (vocabData[id]) out.vocab = vocabData[id];
    if (hasPdf(id)) out.pdf = `/pdf/${id}.pdf`;
    return [id, out];
  })
);

// 佩奇的词汇量原始表 + 汇总，供列表页区间条与单集卡片使用
export const peppaVocab = vocabData;
export const peppaVocabMeta = metaData;

// "P01" → 1，与 Explorer / SeasonGrid 的季号（数字）对齐
export const peppaSeasonVocab = Object.fromEntries(
  Object.entries(metaData.seasons || {}).map(([s, v]) => [Number(s.slice(1)), v])
);

export const peppaReadyList = Object.keys(peppaLessons).sort((a, b) => {
  const na = Number(a.slice(1, 3)) * 1000 + Number(a.slice(4));
  const nb = Number(b.slice(1, 3)) * 1000 + Number(b.slice(4));
  return na - nb;
});

export function getPeppaLesson(id) {
  return peppaLessons[id] || null;
}

export function getPeppaEpisode(id) {
  return peppaEpisodes.find((e) => e.id === id) || null;
}
