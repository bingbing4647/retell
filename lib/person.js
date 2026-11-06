"use client";

// 一个「人」= 一个 person_id，下面可以挂多个登录方式（微信 / WorkBuddy / 手机 / 邮箱）。
//
// 平台侧没有 provider bind/unbind 能力（SDK 文档明确说不提供），所以在应用层做：
//   app_members (owner_id → person_id)  一个登录方式一行
//   所有 RLS 策略都按「同一 person 的全部 owner_id」放开（见 DB 里的 app_person_uids）
//
// 于是绑定不需要搬数据：把第二行 person_id 指向第一个人就够，历史记录立刻互通。

import { getCloud, readError } from "./cloud";

const PERSON_KEY = "dora.person_id";
const BIND_KEY = "dora.bind_pending";
const BIND_TTL = 10 * 60 * 1000;

/* ---------- 本机缓存 ---------- */

export function cachedPerson() {
  try {
    return window.localStorage.getItem(PERSON_KEY) || null;
  } catch {
    return null;
  }
}

function cachePerson(id) {
  try {
    if (id) window.localStorage.setItem(PERSON_KEY, id);
    else window.localStorage.removeItem(PERSON_KEY);
  } catch {
    /* 隐私模式忽略 */
  }
}

/** 记下「刚刚发起了绑定」，等新登录落地后自动兑换。 */
export function stashBind(code) {
  try {
    window.localStorage.setItem(BIND_KEY, JSON.stringify({ code, at: Date.now() }));
  } catch {
    /* 忽略 */
  }
}

function takeBind() {
  try {
    const raw = window.localStorage.getItem(BIND_KEY);
    if (!raw) return null;
    window.localStorage.removeItem(BIND_KEY);
    const v = JSON.parse(raw);
    if (!v || !v.code) return null;
    if (Date.now() - Number(v.at || 0) > BIND_TTL) return null;
    return String(v.code);
  } catch {
    return null;
  }
}

export function clearBind() {
  try {
    window.localStorage.removeItem(BIND_KEY);
  } catch {
    /* 忽略 */
  }
}

/* ---------- 读取成员关系 ---------- */

/**
 * 读「我这个 person」下挂的所有登录方式。
 * RLS 的 app_members_read_person 只放行同一 person 的行，这里不用再手工过滤。
 */
export async function loadMembers() {
  const cloud = getCloud();
  if (!cloud) return { ok: false, error: "云服务未初始化", members: [], personId: null };
  try {
    const { data, error } = await cloud.database
      .from("app_members")
      .select("owner_id, person_id, method, identifier_hint, is_primary, created_at")
      .order("created_at", { ascending: true });
    if (error) return { ok: false, error: readError(error), members: [], personId: null };
    const members = Array.isArray(data) ? data : [];
    const primary = members.find((m) => m.is_primary) || members[0] || null;
    return { ok: true, members, personId: primary ? primary.person_id : null };
  } catch (err) {
    return { ok: false, error: readError(err), members: [], personId: null };
  }
}

/**
 * 确保当前登录身份在 app_members 里有一行，返回 person_id。
 *
 * 没有行时自己开一个新 person（person_id = 自己的 uid）。
 * 已有行时以库里为准 —— 不要用本机缓存覆盖，否则换设备会串号。
 */
export async function resolvePerson(session, opts = {}) {
  const cloud = getCloud();
  if (!cloud || !session || !session.user) {
    return { ok: false, error: "no-session", personId: null };
  }
  const db = cloud.database;
  const uid = session.user.id;
  const patch = {
    owner_id: uid,
    person_id: uid,
    method: opts.method || "unknown",
    identifier_hint: opts.hint || null,
    is_primary: true,
  };

  try {
    const found = await db
      .from("app_members")
      .select("owner_id, person_id, method, identifier_hint, is_primary")
      .eq("owner_id", uid)
      .maybeSingle();

    if (found.error && found.error.code !== "PGRST116") {
      return { ok: false, error: readError(found.error), personId: null };
    }

    if (found.data) {
      // 已经是成员了：只在 method 还是 unknown 时补一次标签。
      // 客户端没有 app_members 的写权限（否则能改 person_id 越权），
      // 补标签走受限的 RPC，它只碰 method / identifier_hint。
      if (opts.method && (!found.data.method || found.data.method === "unknown")) {
        await db.rpc("app_label_member", { p_method: opts.method, p_hint: opts.hint || null });
      }
      cachePerson(found.data.person_id);
      return { ok: true, personId: found.data.person_id, member: found.data, created: false };
    }

    const ins = await db.from("app_members").insert(patch);
    if (ins.error) {
      // 23505 = 并发下已经被别的请求插进去了，重读一次即可
      if (ins.error.code === "23505") {
        const again = await db.from("app_members").select("person_id").eq("owner_id", uid).maybeSingle();
        const pid = again.data ? again.data.person_id : null;
        if (pid) cachePerson(pid);
        return { ok: !!pid, personId: pid, created: false };
      }
      return { ok: false, error: readError(ins.error), personId: null };
    }
    cachePerson(uid);
    return { ok: true, personId: uid, member: patch, created: true };
  } catch (err) {
    return { ok: false, error: readError(err), personId: null };
  }
}

/* ---------- 绑定 / 合并 / 解绑 ---------- */

const REASONS = {
  not_found: "绑定码不存在，请核对后重试",
  used: "这个绑定码已经被用过了",
  expired: "绑定码已过期，请重新生成",
  already_bound: "当前登录方式已经绑定了账号，不能再合并到别处",
  login_required: "请先登录",
  forbidden: "无权操作这条绑定记录",
  primary: "主登录方式不能解绑，请先解绑其他方式",
  only_one: "至少要保留一种登录方式",
};

export function reasonText(code) {
  return REASONS[code] || "操作失败，请稍后重试";
}

/** 生成一个一次性绑定码（8 位，10 分钟有效）。 */
export async function createLinkCode() {
  const cloud = getCloud();
  if (!cloud) return { ok: false, error: "云服务未初始化" };
  try {
    const { data, error } = await cloud.database.rpc("app_create_link_code");
    if (error) return { ok: false, error: readError(error, "生成绑定码失败") };
    const code = typeof data === "string" ? data : data && data.app_create_link_code;
    if (!code) return { ok: false, error: "生成绑定码失败" };
    return { ok: true, code: String(code) };
  } catch (err) {
    return { ok: false, error: readError(err) };
  }
}

/** 兑换绑定码：把当前登录的这个身份挂到 code 指向的账号上。 */
export async function redeemLinkCode(code) {
  const cloud = getCloud();
  if (!cloud) return { ok: false, error: "云服务未初始化" };
  const clean = String(code || "").replace(/[^0-9a-zA-Z]/g, "").toUpperCase();
  if (clean.length !== 8) return { ok: false, error: "绑定码是 8 位字母数字，请检查" };
  try {
    const { data, error } = await cloud.database.rpc("app_redeem_link_code", { p_code: clean });
    if (error) return { ok: false, error: readError(error, "合并失败") };
    const out = typeof data === "string" ? JSON.parse(data) : data;
    if (!out || !out.ok) {
      return { ok: false, error: reasonText(out && out.reason), reason: out && out.reason };
    }
    if (out.person_id) cachePerson(out.person_id);
    return { ok: true, personId: out.person_id, same: out.reason === "same" };
  } catch (err) {
    return { ok: false, error: readError(err) };
  }
}

export async function unbindLogin(ownerId) {
  const cloud = getCloud();
  if (!cloud) return { ok: false, error: "云服务未初始化" };
  try {
    const { data, error } = await cloud.database.rpc("app_unbind_login", { p_owner_id: ownerId });
    if (error) return { ok: false, error: readError(error, "解绑失败") };
    const out = typeof data === "string" ? JSON.parse(data) : data;
    if (!out || !out.ok) return { ok: false, error: reasonText(out && out.reason) };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: readError(err) };
  }
}

/* ---------- 登录后自动兑换 ---------- */

/**
 * 如果本机存着「刚发起过绑定」的绑定码，就在新登录落地后兑换掉。
 * 这样同一个浏览器里换一种方式登录，会自动并回原账号，不需要用户再输码。
 */
export async function autoRedeem() {
  const code = takeBind();
  if (!code) return { done: false };
  const r = await redeemLinkCode(code);
  return { done: true, ...r, code };
}
