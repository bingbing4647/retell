"use client";

// 登录相关的纯逻辑（不依赖 React）。
// UI 与状态机在 components/AuthProvider.jsx。

import { getCloud, readError } from "./cloud";

export const LOGIN_METHODS = {
  workbuddy: "WorkBuddy 账号",
  wechat: "微信",
  phone: "手机验证码",
  email: "邮箱验证码",
};

/* ---------- 联系方式脱敏 ---------- */
// 库里只存脱敏后的指纹，够你在后台认出"是不是同一个家长"，
// 但泄露整张表也拿不到可直接联系人的号码。

export function maskPhone(phone) {
  const d = String(phone || "").replace(/\D/g, "");
  if (d.length < 7) return null;
  return `${d.slice(0, 3)}****${d.slice(-4)}`;
}

export function maskEmail(email) {
  const s = String(email || "").trim();
  const at = s.indexOf("@");
  if (at < 1) return null;
  const name = s.slice(0, at);
  const head = name.slice(0, Math.min(2, name.length));
  return `${head}***${s.slice(at)}`;
}

/** 脱敏后的联系方式指纹，只用来在后台认人，不存原始号码。 */
export function contactHint(user) {
  return maskPhone(user && user.phone) || maskEmail(user && user.email) || null;
}

/* ---------- 用户档案 ---------- */

/**
 * 登录成功后建档 / 更新档案。返回 { ok, error }。
 *
 * 档案主键是 **person_id**（一个「人」可以有多种登录方式，见 lib/person.js），
 * 不是 session.user.id —— 换种方式登录时同一个人的档案要是同一条。
 *
 * opts.count = false 表示这是「会话恢复」（刷新页面 / 新标签页，人本来就登录着），
 * 只刷新昵称头像和 last_seen_at，**不改 login_method、不加登录次数**。
 * 早先不分这两种情况，结果恢复会话也被算成一次登录，还把 login_method 冲成 unknown。
 */
export async function ensureProfile(session, opts = {}) {
  const cloud = getCloud();
  if (!cloud || !session || !session.user) return { ok: false, error: "no-session" };
  const db = cloud.database;
  const user = session.user;
  const personId = opts.personId || user.id;
  const count = opts.count !== false;

  const patch = {
    owner_name: user.name || null,
    avatar_url: user.avatarUrl || null,
    last_seen_at: new Date().toISOString(),
  };
  if (count) {
    patch.login_method = opts.method || user.provider || "unknown";
    patch.contact_hint = opts.hint || contactHint(user);
  }

  try {
    const found = await db
      .from("app_users")
      .select("owner_id, login_count")
      .eq("owner_id", personId)
      .maybeSingle();

    if (found.error && found.error.code !== "PGRST116") {
      return { ok: false, error: readError(found.error) };
    }

    if (!found.data) {
      const ins = await db
        .from("app_users")
        .insert({ ...patch, owner_id: personId, login_count: count ? 1 : 0 });
      if (ins.error) {
        // 23505 = 主键冲突：档案已经存在（并发下另一个标签页刚插过）。不是致命错误。
        if (ins.error.code === "23505") return { ok: true, created: false, existed: true };
        return { ok: false, error: readError(ins.error) };
      }
      return { ok: true, created: true };
    }

    const upd = { ...patch };
    if (count) upd.login_count = (Number(found.data.login_count) || 0) + 1;

    const res = await db
      .from("app_users")
      .update(upd)
      .eq("owner_id", personId)
      .select("owner_id");
    if (res.error) return { ok: false, error: readError(res.error) };
    if (!Array.isArray(res.data) || res.data.length === 0) {
      return { ok: false, error: "档案没有被更新（可能不是你的记录）" };
    }
    return { ok: true, created: false };
  } catch (err) {
    return { ok: false, error: readError(err) };
  }
}

/* ---------- OAuth 跳转 ---------- */

const CALLBACK_KEYS = ["code", "state", "provider"];

/**
 * 回调落地页必须是**站点根目录**：静态托管没有 history fallback，
 * /auth/callback 会 404，等不到 JS 跑起来，code 就丢了。
 * 原始页面路径用 back 参数带过去，回来后恢复现场。
 */
export function buildRedirectTo() {
  const here = new URL(window.location.href);
  const back = here.pathname + here.search + here.hash;
  const target = new URL("/", here.origin);
  // 保留应用自己的查询参数（如 sharecode），但绝不转发回调参数
  for (const [k, v] of here.searchParams) {
    if (CALLBACK_KEYS.includes(k) || k === "back") continue;
    target.searchParams.append(k, v);
  }
  target.searchParams.set("back", back);
  return target.toString();
}

/** 发起 OAuth 登录（workbuddy / wechat）。SDK 只返回 URL，跳转由调用方决定。 */
export async function startOAuth(provider) {
  const cloud = getCloud();
  if (!cloud) return { ok: false, error: "云服务未初始化" };
  try {
    const { data, error } = await cloud.auth.signInWithOAuth({
      provider,
      redirectTo: buildRedirectTo(),
    });
    if (error) return { ok: false, error: readError(error, "暂时无法发起授权登录") };
    return { ok: true, url: data.url };
  } catch (err) {
    return { ok: false, error: readError(err) };
  }
}

/**
 * 回调分发器。
 * handleWorkBuddyCallback 对其他 provider 返回空，但 handleWechatWebCallback
 * 会直接报 "wechat callback requires provider=wechat"，所以必须按 provider 二选一。
 */
export async function resolveOAuthCallback() {
  const cloud = getCloud();
  if (!cloud) return { handled: false, session: null, error: null };

  const url = new URL(window.location.href);
  const hasCode = url.searchParams.has("code");
  const hasError = url.searchParams.has("error");
  if (!hasCode && !hasError && !url.searchParams.has("provider")) {
    return { handled: false, session: null, error: null };
  }
  if (!hasCode && !hasError) {
    return { handled: false, session: null, error: null };
  }

  const provider = url.searchParams.get("provider");
  if (provider !== "workbuddy" && provider !== "wechat") {
    // 有 code 却没有可用 provider：别当成正常访问，清掉参数避免刷新时重放
    cleanCallbackParams();
    return { handled: true, session: null, error: "授权回调缺少有效的登录方式，请重新登录。" };
  }

  const fn =
    provider === "workbuddy"
      ? cloud.auth.handleWorkBuddyCallback
      : cloud.auth.handleWechatWebCallback;
  if (typeof fn !== "function") {
    return { handled: true, session: null, error: "当前 SDK 版本不支持这种登录方式。" };
  }

  try {
    const { data, error } = await fn.call(cloud.auth);
    if (error) {
      cleanCallbackParams();
      return { handled: true, session: null, error: readError(error, "授权失败，请重新登录") };
    }
    if (data) {
      cleanCallbackParams();
      return { handled: true, session: data, error: null, method: provider };
    }
    return { handled: true, session: null, error: null };
  } catch (err) {
    cleanCallbackParams();
    return { handled: true, session: null, error: readError(err, "授权失败，请重新登录") };
  }
}

/**
 * 只删 code/state/provider，其余参数（sharecode 等）原样保留。
 * state 一次性，留在地址栏会让下次刷新重放已消费的 code。
 */
export function cleanCallbackParams() {
  const url = new URL(window.location.href);
  let touched = false;
  for (const k of CALLBACK_KEYS) {
    if (url.searchParams.has(k)) {
      url.searchParams.delete(k);
      touched = true;
    }
  }
  if (touched) {
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }
}

/** 取登录前记下的现场路径，取完即删。 */
export function takeReturnTarget() {
  const url = new URL(window.location.href);
  const back = url.searchParams.get("back");
  if (!back) return null;
  url.searchParams.delete("back");
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  if (!back.startsWith("/")) return null;
  return back;
}

/* ---------- 验证码 ---------- */

export const PHONE_RE = /^1\d{10}$/;

export async function sendCode({ phone, email }) {
  const cloud = getCloud();
  if (!cloud) return { ok: false, error: "云服务未初始化" };
  try {
    const creds = phone ? { phone } : { email };
    const { data, error } = await cloud.auth.sendOtp(creds);
    if (error) return { ok: false, error: readError(error, "验证码发送失败") };
    return {
      ok: true,
      challenge: { phone, email, verificationId: data.verificationId, isExistingUser: data.isExistingUser },
    };
  } catch (err) {
    return { ok: false, error: readError(err) };
  }
}

export async function verifyCode(challenge, token) {
  const cloud = getCloud();
  if (!cloud) return { ok: false, error: "云服务未初始化" };
  if (!challenge) return { ok: false, error: "请先获取验证码" };
  try {
    const params = {
      verificationId: challenge.verificationId,
      isExistingUser: challenge.isExistingUser,
      token: String(token || "").trim(),
    };
    if (challenge.phone) params.phone = challenge.phone;
    else params.email = challenge.email;

    const { data, error } = await cloud.auth.verifyOtp(params);
    if (error) return { ok: false, error: readError(error, "验证码不正确或已失效") };
    return { ok: true, session: data, method: challenge.phone ? "phone" : "email" };
  } catch (err) {
    return { ok: false, error: readError(err) };
  }
}
