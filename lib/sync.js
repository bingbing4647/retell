"use client";

// 登录后的练习进度云同步。
// 本地 localStorage 永远是主副本（没登录、断网都能练），云端是跨设备的那一份。
//
// 冲突策略见 lib/progress.js 的 mergeCloudLessons：
// 星级逐格取大、五指本地优先、三阶取并集 —— 都是"只增不减"的方向，
// 两个设备轮流练不会把对方的记录抹掉。

import { getCloud } from "./cloud";
import { lessonSnapshot, mergeCloudLessons, onProgressCommit } from "./progress";
import { EVENT, track } from "./track";

const PUSH_DELAY = 1500;
const PULL_LIMIT = 2000;

let signedIn = false;
let timer = null;
let bound = false;
let pushing = false;
const dirty = new Set();

export function setSyncUser(uid) {
  signedIn = !!uid;
  if (!signedIn) {
    dirty.clear();
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  }
}

/** 拉云端进度并合并进本地，返回 { rows, dirty }。 */
export async function pullProgress() {
  const cloud = getCloud();
  if (!cloud || !signedIn) return { rows: 0, dirty: [] };
  try {
    const { data, error } = await cloud.database
      .from("app_learning")
      .select("lesson_id, stars, five, steps")
      .limit(PULL_LIMIT);
    if (error || !data) return { rows: 0, dirty: [] };
    const dirtyIds = mergeCloudLessons(data);
    // 本地有、云端没有的，说明上一次推送没落地，这里补推
    if (dirtyIds.length) {
      dirtyIds.forEach((id) => dirty.add(id));
      schedule();
    }
    return { rows: data.length, dirty: dirtyIds };
  } catch {
    return { rows: 0, dirty: [] };
  }
}

/** 推一集。先 update（RLS 自动限制在本人行），没命中再 insert。 */
export async function pushLesson(lessonId) {
  const cloud = getCloud();
  if (!cloud || !signedIn || !lessonId) return false;
  const db = cloud.database;
  const snap = lessonSnapshot(lessonId);
  const patch = {
    stars: snap.stars,
    five: snap.five,
    steps: snap.steps,
    updated_at: new Date().toISOString(),
  };

  try {
    const upd = await db
      .from("app_learning")
      .update(patch)
      .eq("lesson_id", lessonId)
      .select("id");
    if (upd.error) return false;
    if (Array.isArray(upd.data) && upd.data.length > 0) {
      track(EVENT.SYNC_PUSH, { lesson_id: lessonId, op: "update" });
      return true;
    }
    const ins = await db.from("app_learning").insert({ lesson_id: lessonId, ...patch });
    if (ins.error) return false;
    track(EVENT.SYNC_PUSH, { lesson_id: lessonId, op: "insert" });
    return true;
  } catch {
    return false;
  }
}

async function flushDirty() {
  if (pushing || dirty.size === 0) return;
  pushing = true;
  const ids = Array.from(dirty);
  dirty.clear();
  try {
    for (const id of ids) {
      // 串行推，避免并发写同一张表触发 PostgREST 的连接抖动
      // eslint-disable-next-line no-await-in-loop
      await pushLesson(id);
    }
  } finally {
    pushing = false;
  }
}

function schedule() {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    flushDirty();
  }, PUSH_DELAY);
}

/** 挂上"本地一改就排队推送"的钩子 + 关页面前尽量推完。只绑一次。 */
export function bindAutoPush() {
  if (bound || typeof window === "undefined") return () => {};
  bound = true;
  const off = onProgressCommit((lessonId) => {
    if (!signedIn || !lessonId) return;
    dirty.add(lessonId);
    schedule();
  });
  const bye = () => flushDirty();
  window.addEventListener("pagehide", bye);
  return () => {
    off();
    window.removeEventListener("pagehide", bye);
    bound = false;
  };
}

export function flushPendingPush() {
  return flushDirty();
}
