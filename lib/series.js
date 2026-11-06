// 站点层级：首页（选剧集）→ 剧集页（选季）→ 某季剧集列表 → 单集九宫格。
//
// 这里把两套片源（朵拉 / 佩奇）汇总成同一份结构，供首页与选季页直接用。
// 新增一部剧：补一份 episodes/lessons 数据，再往 SERIES 里加一条即可。
import fs from "node:fs";
import path from "node:path";
import doraEpisodes from "./episodes.json";
import { lessons as doraLessons, seasonPdfs, seasonVocab } from "./lessons";
import { peppaEpisodes, peppaLessons, peppaSeasonVocab } from "./peppa";

const IMG_DIR = path.join(process.cwd(), "public", "img");

function hasShot(id, n = 1) {
  try {
    return fs.existsSync(path.join(IMG_DIR, id.toLowerCase(), `f${n}.jpg`));
  } catch {
    return false;
  }
}

const epNo = (id) => Number(id.slice(1, 3)) * 1000 + Number(id.slice(4));

// 一季的汇总：集数 / 已上线 / 封面 / 词元区间 / 整季 PDF
function buildSeason(n, episodes, lessons, vocabOf, pdfs) {
  const eps = episodes.filter((e) => e.s === n);
  const ready = eps.filter((e) => lessons[e.id]);
  const coverFrom = (ready[0] || eps[0] || {}).id;
  return {
    n,
    total: eps.length,
    done: ready.length,
    // 有已上线的集就用它的剧照做封面，否则退回该季第一集的剧照
    cover: coverFrom && hasShot(coverFrom) ? `/img/${coverFrom.toLowerCase()}/f1.jpg` : null,
    vocab: vocabOf?.[n] || null,
    pdf: pdfs?.[String(n)] || null,
  };
}

function buildSeries({ key, name, en, tagline, blurb, href, tint, episodes, lessons, vocabOf, pdfs }) {
  const seasonNums = [...new Set(episodes.map((e) => e.s))].sort((a, b) => a - b);
  const seasons = seasonNums.map((n) =>
    buildSeason(n, episodes, lessons, vocabOf, pdfs)
  );
  const hero =
    seasons.map((s) => s.cover).find(Boolean) || null;
  return {
    key,
    name,
    en,
    tagline,
    blurb,
    href,
    tint,
    hero,
    total: episodes.length,
    done: Object.keys(lessons).length,
    seasons,
  };
}

export const dora = buildSeries({
  key: "dora",
  name: "朵拉爱冒险",
  en: "DORA THE EXPLORER",
  tagline: "跟着朵拉去冒险，用英语把故事讲一遍",
  blurb:
    "每集九张剧照、九句英文，先跟着格子说短句，再用 First → Then → Finally 连成一段完整复述。",
  href: "/dora/",
  tint: "orange",
  episodes: doraEpisodes,
  lessons: doraLessons,
  vocabOf: seasonVocab,
  pdfs: seasonPdfs,
});

export const peppa = buildSeries({
  key: "peppa",
  name: "小猪佩奇",
  en: "PEPPA PIG",
  tagline: "Peppa 一家的日常，最好上手的入门英语",
  blurb:
    "句子短、语速慢、场景固定，适合刚起步就跟读的孩子。同样是九张图九个句子的复述练习。",
  href: "/peppa/",
  tint: "purple",
  episodes: peppaEpisodes,
  lessons: peppaLessons,
  vocabOf: peppaSeasonVocab,
  pdfs: null,
});

export const series = [dora, peppa];

export function getSeries(key) {
  return series.find((s) => s.key === key) || null;
}

// 某季在「已上线集」里的前后集，供单集页的上一集/下一集
export function seasonOf(seasons, n) {
  return seasons.find((s) => s.n === n) || null;
}

export { epNo };
