"use client";

// 行为埋点：批量写入 app_events。
//
// 设计要点：
// 1. **不阻塞交互** —— 事件先进内存队列，每 6 秒或攒够 24 条才发一次；
// 页面切到后台 / 关闭时立刻 flush。
// 2. **游客也记** —— 未登录时 owner_id 由库里的 DEFAULT auth.uid() 落成 NULL，
//    靠 anon_id（本机生成的设备号）归因；登录后同一条 anon_id 的行为自动挂到人身上。
// 3. **绝不手工拼接 /.cloud/** URL** —— 一律走 SDK，鉴权由共享请求层注入。
// 4. 写失败不重试到天荒地老：权限被拒直接丢弃，网络问题回填一次队列上限。

import { getCloud } from "./cloud";

const ANON_KEY = "dora.anon_id";
const SESS_KEY = "dora.sess_id";
const QUEUE_MAX = 24;
const QUEUE_HARD_CAP = 120;
const FLUSH_MS = 6000;
const MAX_KEYS = 12;
const MAX_STR = 120;

let queue = [];
let timer = null;
let flushing = false;
let uid = null;
let bound = false;

function randomId(prefix) {
  try {
    const buf = new Uint8Array(9);
    crypto.getRandomValues(buf);
    let s = "";
    for (const b of buf) s += b.toString(36).padStart(2, "0");
    return prefix + s.slice(0, 16);
  } catch {
    return prefix + Math.random().toString(36).slice(2, 14);
  }
}

/** 本机匿名设备号。清缓存会变，用来区分"同一个人换了设备"。 */
export function anonId() {
  try {
    let v = window.localStorage.getItem(ANON_KEY);
    if (!v) {
      v = randomId("a_");
      window.localStorage.setItem(ANON_KEY, v);
    }
    return v;
  } catch {
    return "a_nostore";
  }
}

/** 一次标签页会话号，用来算"一次访问看了几集"。 */
function sessionId() {
  try {
    let v = window.sessionStorage.getItem(SESS_KEY);
    if (!v) {
      v = randomId("s_");
      window.sessionStorage.setItem(SESS_KEY, v);
    }
    return v;
  } catch {
    return "s_nostore";
  }
}

function cleanProps(props) {
  if (!props || typeof props !== "object") return null;
  const out = {};
  let n = 0;
  for (const [k, v] of Object.entries(props)) {
    if (n >= MAX_KEYS) break;
    if (v === undefined || v === null || v === "") continue;
    if (typeof v === "number" || typeof v === "boolean") {
      out[k] = v;
    } else if (typeof v === "string") {
      out[k] = v.slice(0, MAX_STR);
    }
    n += 1;
  }
  return Object.keys(out).length ? out : null;
}

function rowOf(e) {
  return {
    anon_id: anonId(),
    session_id: sessionId(),
    name: e.name,
    lesson_id: (e.props && e.props.lesson_id) || null,
    props: cleanProps(e.props),
    path: e.path || null,
    referrer: e.referrer || null,
    ua: e.ua || null,
  };
}

/**
 * 记一条行为事件。
 * @param {string} name 事件名，见 EVENT 常量
 * @param {object} [props] 只放短字符串/数字/布尔，别塞 PII
 */
export function track(name, props) {
  if (typeof window === "undefined" || !name) return;
  queue.push({
    name,
    props: props || null,
    path: window.location.pathname,
    referrer: (document.referrer || "").slice(0, 240) || null,
    ua: (navigator.userAgent || "").slice(0, 240) || null,
    at: Date.now(),
  });
  if (queue.length >= QUEUE_MAX) {
    flush();
  } else if (!timer) {
    timer = setTimeout(() => {
      timer = null;
      flush();
    }, FLUSH_MS);
  }
}

/** 把队列推上去。并发调用会合并成一次。 */
export async function flush() {
  if (flushing || queue.length === 0) return;
  const cloud = getCloud();
  if (!cloud) return;

  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  flushing = true;
  const batch = queue;
  queue = [];

  try {
    const { error } = await cloud.database.from("app_events").insert(batch.map(rowOf));
    if (error) {
      // RLS 拒绝 / 参数错误：留着也不会成功，丢掉并留一条本地记录
      if (error.kind === "permission-denied" || error.kind === "invalid-request") {
        console.warn("[track] 事件被拒绝，已丢弃", error.kind, error.message);
      } else if (queue.length < QUEUE_HARD_CAP) {
        queue = batch.concat(queue).slice(-QUEUE_HARD_CAP);
      }
    }
  } catch (err) {
    if (queue.length < QUEUE_HARD_CAP) {
      queue = batch.concat(queue).slice(-QUEUE_HARD_CAP);
    }
  } finally {
    flushing = false;
  }

  if (queue.length && !timer) {
    timer = setTimeout(() => {
      timer = null;
      flush();
    }, FLUSH_MS * 2);
  }
}

/** 登录 / 登出时同步身份，只影响后续事件；历史事件靠 anon_id 关联。 */
export function setTrackUser(nextUid) {
  uid = nextUid || null;
}

export function currentTrackUser() {
  return uid;
}

/** 页面生命周期挂钩：切后台、关页面时尽力把队列送出去。只绑一次。 */
export function bindTrackLifecycle() {
  if (bound || typeof window === "undefined") return;
  bound = true;

  const kick = () => {
    if (document.visibilityState === "hidden") flush();
  };
  document.addEventListener("visibilitychange", kick);
  window.addEventListener("pagehide", () => flush());
}

/** 事件名清单（改名字记得同步看板里的口径）。 */
export const EVENT = {
  PAGE_VIEW: "page_view",
  LOGIN_OPEN: "login_open",
  LOGIN_SUCCESS: "login_success",
  LOGIN_FAIL: "login_fail",
  LOGOUT: "logout",
  SEARCH: "search",
  FILTER_SEASON: "filter_season",
  LESSON_OPEN: "lesson_open",
  DECK_OPEN: "deck_open",
  DECK_CLOSE: "deck_close",
  DECK_PAGE: "deck_page",
  TTS_LINE: "tts_line",
  TTS_ALL: "tts_all",
  TTS_WORD: "tts_word",
  CLIP_PLAY: "clip_play",
  RATE_STAR: "rate_star",
  RETELL_FIVE: "retell_five",
  RETELL_STEP: "retell_step",
  PRINT: "print",
  DOWNLOAD_PDF: "download_pdf",
  SYNC_PUSH: "sync_push",
  ADMIN_VIEW: "admin_view",
};
