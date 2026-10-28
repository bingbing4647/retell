import episodes from "./episodes.json";

// 全量剧集清单（116 集，S01–S05），来自本地片源文件名自动解析。
// 新增一集复述：在 lessons.js 里加一条同 id 的记录，首页会自动亮起。
export const allEpisodes = episodes;

export const seasons = [1, 2, 3, 4, 5];

export const seasonCount = seasons.reduce((acc, s) => {
  acc[s] = episodes.filter((e) => e.s === s).length;
  return acc;
}, {});

export function getEpisode(id) {
  return episodes.find((e) => e.id === id) || null;
}

export function epLabel(ep) {
  return `S${String(ep.s).padStart(2, "0")}E${String(ep.e).padStart(2, "0")}`;
}
