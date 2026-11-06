// 统一朗读入口：优先播预生成的神经网络语音（public/audio），
// 没有对应音频时才退回浏览器自带的 speechSynthesis。
//
// 预生成音频的好处：音质是微软 Azure Neural 同一套模型（Aria/Ana 等），
// 断句和语调接近真人；浏览器本地音色则明显机械，孩子容易跟着学错腔调。

const MANIFEST_URL = "/audio/manifest.json";

let manifestPromise = null;
const hasCache = new Map(); // lessonId(lower) -> Set(keys)

function loadManifest() {
  if (manifestPromise) return manifestPromise;
  if (typeof window === "undefined") return Promise.resolve(new Map());
  manifestPromise = fetch(MANIFEST_URL, { cache: "force-cache" })
    .then((r) => (r.ok ? r.json() : {}))
    .then((raw) => {
      const map = new Map();
      Object.keys(raw || {}).forEach((k) => {
        if (k.startsWith("_")) return; // _meta
        if (Array.isArray(raw[k])) map.set(k.toLowerCase(), new Set(raw[k]));
      });
      return map;
    })
    .catch(() => new Map());
  return manifestPromise;
}

// 有音频 → 返回 URL；没有 → null。manifest 未加载时先等它（约 50ms）。
export async function audioUrl(lessonId, key) {
  if (!lessonId || !key) return null;
  const id = String(lessonId).toLowerCase();
  let set = hasCache.get(id);
  if (!set) {
    const map = await loadManifest();
    set = map.get(id) || new Set();
    hasCache.set(id, set);
  }
  return set.has(key) ? `/audio/${id}/${key}.mp3` : null;
}

// 这一集有哪些音频键（c1..c9 / o1..o9 原声 / w1..w12 / op / ed）
export async function keysOf(lessonId) {
  if (!lessonId) return new Set();
  const id = String(lessonId).toLowerCase();
  let set = hasCache.get(id);
  if (!set) {
    const map = await loadManifest();
    set = map.get(id) || new Set();
    hasCache.set(id, set);
  }
  return set;
}

/* ---------------- 播放器（全站共用一个 audio 元素） ---------------- */

let audioEl = null;
let seq = 0;
let activeResolve = null;

function ensureAudio() {
  if (typeof window === "undefined") return null;
  if (!audioEl) {
    audioEl = new Audio();
    audioEl.preload = "auto";
    audioEl.setAttribute("playsinline", "");
  }
  return audioEl;
}

function pickVoice() {
  const synth = window.speechSynthesis;
  const vs = synth.getVoices() || [];
  return (
    vs.find((v) => /en[-_]US/i.test(v.lang) && /female|samantha|zira|aria|google us english/i.test(v.name)) ||
    vs.find((v) => /en[-_]US/i.test(v.lang)) ||
    vs.find((v) => /^en/i.test(v.lang)) ||
    null
  );
}

function finish(resolve) {
  if (activeResolve === resolve) activeResolve = null;
  resolve?.();
}

/** 停掉当前朗读（切换句子、翻页、退出播放器时都要调） */
export function stopSpeak() {
  seq += 1;
  if (audioEl) {
    try {
      audioEl.pause();
      audioEl.currentTime = 0;
    } catch {
      /* 忽略：元素还没 src 时的报错 */
    }
  }
  if (typeof window !== "undefined") window.speechSynthesis?.cancel();
  if (activeResolve) finish(activeResolve);
}

/**
 * 朗读一句。有预生成音频走音频，否则回退系统语音。
 * @returns {Promise<void>} 读完 / 被打断 / 出错都会 resolve，方便连读串联。
 */
export async function speakLine({ lessonId, key, text, rate = 1, onStart, onEnd } = {}) {
  if (typeof window === "undefined" || !text) return;
  stopSpeak();
  const my = ++seq;

  const src = await audioUrl(lessonId, key);
  if (my !== seq) return; // 等待 manifest 期间已被打断

  if (src) {
    return playSrc({
      src,
      rate,
      onStart,
      onEnd,
      // 音频 404 / 解码失败 → 当场退回系统语音，别让孩子干等
      onFail: () => fallback({ text, rate, onStart, onEnd }),
    });
  }

  return fallback({ text, rate, onStart, onEnd });
}

/**
 * 播放原片原声片段（key 形如 o1..o9）。没有该片段就返回 false，由调用方隐藏按钮。
 * 与 speakLine 共用同一个 audio 元素，互相打断。
 */
export async function playClip({ lessonId, key, rate = 1, onStart, onEnd } = {}) {
  if (typeof window === "undefined") return false;
  stopSpeak();
  const my = ++seq;

  const src = await audioUrl(lessonId, key);
  if (my !== seq || !src) return false;

  await playSrc({ src, rate, onStart, onEnd });
  return true;
}

function playSrc({ src, rate = 1, onStart, onEnd, onFail }) {
  const my = seq;
  const el = ensureAudio();
  return new Promise((resolve) => {
    activeResolve = resolve;
    let done = false;
    const cleanup = () => {
      el.onended = null;
      el.onerror = null;
    };
    const end = () => {
      if (done) return;
      done = true;
      cleanup();
      if (my === seq) onEnd?.();
      finish(resolve);
    };
    const fail = () => {
      if (done) return;
      done = true;
      cleanup();
      const r = onFail?.();
      if (r && typeof r.then === "function") r.then(() => finish(resolve));
      else {
        if (!onFail && my === seq) onEnd?.();
        finish(resolve);
      }
    };
    el.onended = end;
    el.onerror = fail;
    el.src = src;
    // 变速不变调：Audio 元素默认 preservesPitch，0.75× 只是放慢，不会变声
    el.playbackRate = rate;
    const p = el.play();
    if (p && typeof p.then === "function") {
      p.then(() => {
        if (my === seq) onStart?.();
      }).catch(fail);
    }
  });
}

function fallback({ text, rate, onStart, onEnd }) {
  if (!("speechSynthesis" in window)) {
    onEnd?.();
    return Promise.resolve();
  }
  const synth = window.speechSynthesis;
  const my = seq;
  return new Promise((resolve) => {
    activeResolve = resolve;
    const u = new SpeechSynthesisUtterance(text);
    const v = pickVoice();
    if (v) u.voice = v;
    u.lang = "en-US";
    u.rate = rate;
    u.pitch = 1;
    u.onstart = () => onStart?.();
    u.onend = () => {
      onEnd?.();
      finish(resolve);
    };
    u.onerror = () => {
      onEnd?.();
      finish(resolve);
    };
    // cancel 后立刻 speak 在部分浏览器会静默失败，让出一帧
    window.setTimeout(() => {
      if (my === seq) synth.speak(u);
      else finish(resolve);
    }, 40);
  });
}

/** 预热：进了单集页就先把 manifest 拉下来，点朗读时不用等 */
export function warmAudio() {
  if (typeof window === "undefined") return;
  loadManifest();
  ensureAudio();
}
