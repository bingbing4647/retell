"use client";

// 复述练习进度（纯前端，浏览器 localStorage）
// 结构：
// {
//   stars:  { S02E14: { 1: 3, 2: 2 } },      每格自评星（1–3）
//   five:   { S02E14: { who: "Boots", ... } }, 五指 5W 关键词
//   steps:  { S02E14: { detail: true } },      三阶复述走过哪几阶
//   settings: { blind: false, rate: 1 }        我先说模式 / 朗读速度
// }

import { useCallback, useEffect, useState } from "react";

const KEY = "dora.retell.v1";
export const SPEEDS = [0.75, 1, 1.25];
export const BLIND_WAIT = 10; // 延迟复述：先自己说 10 秒（大童 10–15 秒）

function blank() {
  return { stars: {}, five: {}, steps: {}, settings: { blind: false, rate: 1 } };
}

let cache = null;
const listeners = new Set();

function normalize(raw) {
  const base = blank();
  if (!raw || typeof raw !== "object") return base;
  return {
    stars: raw.stars && typeof raw.stars === "object" ? raw.stars : base.stars,
    five: raw.five && typeof raw.five === "object" ? raw.five : base.five,
    steps: raw.steps && typeof raw.steps === "object" ? raw.steps : base.steps,
    settings: { ...base.settings, ...(raw.settings || {}) },
  };
}

export function readStore() {
  if (typeof window === "undefined") return blank();
  if (cache) return cache;
  try {
    cache = normalize(JSON.parse(window.localStorage.getItem(KEY) || "null"));
  } catch {
    cache = blank();
  }
  return cache;
}

function writeStore(next) {
  cache = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* 隐私模式 / 空间满：只保留内存态，不打断练习 */
  }
  listeners.forEach((fn) => fn(next));
}

function mutate(fn) {
  const next = JSON.parse(JSON.stringify(readStore()));
  fn(next);
  writeStore(next);
}

export function useRetell() {
  const [store, setStore] = useState(blank);

  useEffect(() => {
    setStore(readStore());
    const fn = (s) => setStore(s);
    listeners.add(fn);
    return () => listeners.delete(fn);
  }, []);

  const setStar = useCallback((lessonId, no, n) => {
    mutate((s) => {
      s.stars[lessonId] = s.stars[lessonId] || {};
      if (!n) delete s.stars[lessonId][no];
      else s.stars[lessonId][no] = n;
    });
  }, []);

  const setFive = useCallback((lessonId, finger, value) => {
    mutate((s) => {
      s.five[lessonId] = s.five[lessonId] || {};
      if (!value) delete s.five[lessonId][finger];
      else s.five[lessonId][finger] = value;
    });
  }, []);

  const setStep = useCallback((lessonId, step, on) => {
    mutate((s) => {
      s.steps[lessonId] = s.steps[lessonId] || {};
      if (on) s.steps[lessonId][step] = true;
      else delete s.steps[lessonId][step];
    });
  }, []);

  const setSetting = useCallback((k, v) => {
    mutate((s) => {
      s.settings[k] = v;
    });
  }, []);

  const resetLesson = useCallback((lessonId) => {
    mutate((s) => {
      delete s.stars[lessonId];
      delete s.five[lessonId];
      delete s.steps[lessonId];
    });
  }, []);

  return [store, { setStar, setFive, setStep, setSetting, resetLesson }];
}

// 便携朗读：全站统一用设置里的速度
export function speak(text, rate = 1) {
  if (typeof window === "undefined" || !("speechSynthesis" in window) || !text) return;
  const synth = window.speechSynthesis;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const vs = synth.getVoices() || [];
  const v =
    vs.find((x) => /en[-_]US/i.test(x.lang) && /female|samantha|zira|aria/i.test(x.name)) ||
    vs.find((x) => /en[-_]US/i.test(x.lang)) ||
    vs.find((x) => /^en/i.test(x.lang));
  if (v) u.voice = v;
  u.lang = "en-US";
  u.rate = rate;
  u.pitch = 1;
  window.setTimeout(() => synth.speak(u), 40);
}

export function stopSpeak() {
  if (typeof window === "undefined") return;
  window.speechSynthesis?.cancel();
}

// 本集自测统计：{ done, stars }
export function tally(stars = {}) {
  const vals = Object.values(stars);
  return { done: vals.length, stars: vals.reduce((a, b) => a + b, 0) };
}
