// 已制作完成的「九宫格复述」课程内容，数据在 lessons.json。
// 新增一集：往 lessons.json 里加一条（id 与 episodes.json 一致），页面无需改动。
import lessonsData from "./lessons.json";

export const lessons = lessonsData;

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
