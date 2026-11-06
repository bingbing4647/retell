"use client";

// 管理员数据看板。
//
// 权限靠数据库：app_roles 里没有你的 owner_id 就一条数据也读不到（RLS 拦）。
// 这里只负责"是管理员就展示"，判断本身不构成安全边界。

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../../components/AuthProvider";
import { getCloud, readError } from "../../lib/cloud";
import { EVENT, track } from "../../lib/track";
import TITLES from "../../lib/lesson-titles.json";

const RANGES = [
  { d: 7, label: "近 7 天" },
  { d: 30, label: "近 30 天" },
  { d: 90, label: "近 90 天" },
];

const PAGE = 1000;
const EVENT_CAP = 15000;

/* ---------- 小工具 ---------- */
// 分桶一律按**本地日期**。直接用 toISOString() 会落到 UTC，东八区会整体错后 8 小时，
// 「今天」的柱子实际装的是昨天 8 点之后的数据。
function localDayStr(date) {
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return shifted.toISOString().slice(0, 10);
}
const dayOf = (iso) => (iso ? localDayStr(new Date(iso)) : "");
const todayStr = () => localDayStr(new Date());

// ⚠️ 未登录时数据库的 auth.uid() 返回的是字面量 "anon"，不是 NULL
// （2026-10-31 实测，表里 owner_id 全是 "anon"）。不排掉的话所有游客会被
// 算成同一个人，日活永远是 1。游客身份只能靠 anon_id。
const GUEST_UID = "anon";
const isGuest = (e) => !e.owner_id || e.owner_id === GUEST_UID;
// 同一个「人」可能绑了多种登录方式（app_members 里多行指向同一 person_id），
// 归集时要用 person_id，否则一个人被算成两个。
const identity = (e, pids) => {
  if (isGuest(e)) return "d:" + (e.anon_id || "?");
  const pid = (pids && pids[e.owner_id]) || e.owner_id;
  return "u:" + pid;
};

function sinceISO(days) {
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  t.setDate(t.getDate() - (days - 1));
  return t.toISOString();
}

function dayList(days) {
  const out = [];
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(t);
    d.setDate(d.getDate() - i);
    out.push(localDayStr(d));
  }
  return out;
}

function shiftDay(day, n) {
  const d = new Date(day + "T00:00:00");
  d.setDate(d.getDate() + n);
  return localDayStr(d);
}

const fmtDay = (d) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;

function pct(a, b) {
  if (!b) return 0;
  return Math.round((a / b) * 1000) / 10;
}

/* ---------- 数据抓取 ---------- */
async function fetchEvents(db, since) {
  const out = [];
  let from = 0;
  for (;;) {
    const { data, error } = await db
      .from("app_events")
      .select("name,lesson_id,owner_id,anon_id,created_at,props")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const r of data) out.push(r);
    if (data.length < PAGE || out.length >= EVENT_CAP) break;
    from += PAGE;
  }
  return out;
}

export default function AdminView() {
  const { ready, user, openLogin } = useAuth();
  const [phase, setPhase] = useState("checking");
  const [err, setErr] = useState("");
  const [days, setDays] = useState(30);
  const [users, setUsers] = useState([]);
  const [events, setEvents] = useState([]);
  const [learning, setLearning] = useState([]);
  const [truncated, setTruncated] = useState(false);
  const [pids, setPids] = useState({});

  const load = useCallback(
    async (rangeDays) => {
      const cloud = getCloud();
      if (!cloud) {
        setPhase("error");
        setErr("云服务未初始化，请刷新页面重试");
        return;
      }
      if (!user) {
        setPhase("need-login");
        return;
      }
      const db = cloud.database;
      setPhase("loading");
      setErr("");
      try {
        // 1. 管理员身份
        // 不按 user.id 精确查：一个「人」可能绑了多种登录方式，当前会话的 uid
        // 未必就是 app_roles 里存的那个。RLS 已按 person 放开读，取到即有权。
        const role = await db.from("app_roles").select("role").limit(1);
        if (role.error) throw role.error;
        if (!Array.isArray(role.data) || role.data.length === 0) {
          setPhase("denied");
          return;
        }

        // 2. 四张表
        const [u, e, l, mem] = await Promise.all([
          db
            .from("app_users")
            .select("owner_id, owner_name, login_method, contact_hint, login_count, first_seen_at, last_seen_at")
            .order("last_seen_at", { ascending: false })
            .limit(2000),
          fetchEvents(db, sinceISO(rangeDays)),
          db.from("app_learning").select("lesson_id, owner_id").limit(5000),
          db.from("app_members").select("owner_id, person_id, method").limit(5000),
        ]);
        if (u.error) throw u.error;
        if (l.error) throw l.error;

        // 一个「人」可能绑了多种登录方式：把 owner_id 归到 person_id，
        // 否则同一个人会被算成两个活跃用户。
        const map = {};
        if (Array.isArray(mem.data)) {
          for (const m of mem.data) map[m.owner_id] = m.person_id;
        }

        setPids(map);
        setUsers(u.data || []);
        setEvents(e);
        setTruncated(e.length >= EVENT_CAP);
        setLearning(l.data || []);
        setPhase("ready");
        track(EVENT.ADMIN_VIEW, { days: rangeDays });
      } catch (ex) {
        setPhase("error");
        setErr(readError(ex, "数据加载失败"));
      }
    },
    [user]
  );

  useEffect(() => {
    if (!ready) return;
    load(days);
  }, [ready, days, load]);

  /* ---------- 聚合 ---------- */
  const stat = useMemo(() => {
    const dl = dayList(days);
    const dau = new Map(dl.map((d) => [d, new Set()]));
    const dauLogin = new Map(dl.map((d) => [d, new Set()]));
    const dauGuest = new Map(dl.map((d) => [d, new Set()]));
    const heat = new Map();
    const steps = { open: new Set(), deck: new Set(), star: new Set(), retell: new Set() };
    const nameCount = new Map();
    const firstSeen = new Map();
    const active = new Map();

    for (const e of events) {
      const d = dayOf(e.created_at);
      const who = identity(e, pids);
      if (dau.has(d)) {
        dau.get(d).add(who);
        if (isGuest(e)) dauGuest.get(d).add(who);
        else dauLogin.get(d).add(who);
      }
      if (!firstSeen.has(who) || d < firstSeen.get(who)) firstSeen.set(who, d);
      if (!active.has(who)) active.set(who, new Set());
      active.get(who).add(d);

      nameCount.set(e.name, (nameCount.get(e.name) || 0) + 1);
      if (e.name === EVENT.LESSON_OPEN && e.lesson_id) {
        heat.set(e.lesson_id, (heat.get(e.lesson_id) || 0) + 1);
      }
      if (e.name === EVENT.LESSON_OPEN) steps.open.add(who);
      if (e.name === EVENT.DECK_OPEN) steps.deck.add(who);
      if (e.name === EVENT.RATE_STAR) steps.star.add(who);
      if (e.name === EVENT.RETELL_STEP) steps.retell.add(who);
    }

    const today = todayStr();
    let d1Hit = 0;
    let d1Base = 0;
    let d7Hit = 0;
    let d7Base = 0;
    for (const [who, cohort] of firstSeen) {
      const a = active.get(who);
      const d1 = shiftDay(cohort, 1);
      const d7 = shiftDay(cohort, 7);
      if (d1 <= today) {
        d1Base += 1;
        if (a.has(d1)) d1Hit += 1;
      }
      if (d7 <= today) {
        d7Base += 1;
        if (a.has(d7)) d7Hit += 1;
      }
    }

    // 覆盖情况：有练习记录的集数 / 打勾过的集数
    const practiced = new Set(learning.map((r) => r.lesson_id));
    const tops = Array.from(heat.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15);

    const activeAll = new Set();
    for (const s of dau.values()) for (const v of s) activeAll.add(v);

    return {
      dl,
      dauSeries: dl.map((d) => ({ d, n: dau.get(d).size })),
      loginSeries: dl.map((d) => ({ d, n: dauLogin.get(d).size })),
      guestTotal: new Set(dl.flatMap((d) => Array.from(dauGuest.get(d)))).size,
      activeAll: activeAll.size,
      maxDau: Math.max(1, ...dl.map((d) => dau.get(d).size)),
      heat: tops,
      funnel: [
        { k: "打开某一集", n: steps.open.size },
        { k: "进播放模式", n: steps.deck.size },
        { k: "自评星级", n: steps.star.size },
        { k: "三阶复述打勾", n: steps.retell.size },
      ],
      d1: { hit: d1Hit, base: d1Base },
      d7: { hit: d7Hit, base: d7Base },
      practiced: practiced.size,
      nameCount,
      totalEvents: events.length,
      heatMax: tops.length ? tops[0][1] : 1,
    };
  }, [events, learning, days, pids]);

  /* ---------- 渲染 ---------- */
  if (!ready || phase === "checking") {
    return <Shell><p className="ad-hint">正在检查登录状态…</p></Shell>;
  }

  if (phase === "need-login") {
    return (
      <Shell>
        <div className="ad-gate">
          <b>先登录再看数据</b>
          <p>这个页面只给管理员看。用你自己的账号登录后会自动判断权限。</p>
          <button type="button" className="btn primary" onClick={() => openLogin()}>
            去登录
          </button>
        </div>
      </Shell>
    );
  }

  if (phase === "denied") {
    return (
      <Shell>
        <div className="ad-gate">
          <b>这个账号还不是管理员</b>
          <p>
            已登录：{user?.name || user?.phone || user?.email || "当前账号"}
            <br />
            把它下面这串 ID 发给站长，加进白名单后刷新即可：
          </p>
          <code className="ad-uid">{user?.id}</code>
          <p className="ad-dim">安全提示：权限在数据库侧校验，改前端代码也读不到别人的数据。</p>
        </div>
      </Shell>
    );
  }

  if (phase === "error") {
    return (
      <Shell>
        <div className="ad-gate">
          <b>读取失败</b>
          <p>{err}</p>
          <button type="button" className="btn" onClick={() => load(days)}>
            重试
          </button>
        </div>
      </Shell>
    );
  }

  if (phase === "loading" && events.length === 0 && users.length === 0) {
    return (
      <Shell>
        <p className="ad-hint">正在读取数据…</p>
      </Shell>
    );
  }

  const newUsers = users.filter((u) => dayOf(u.first_seen_at) >= stat.dl[0]).length;

  return (
    <Shell>
      <div className="ad-toolbar">
        <div className="ad-ranges">
          {RANGES.map((r) => (
            <button
              key={r.d}
              type="button"
              className={`ad-range ${days === r.d ? "on" : ""}`}
              onClick={() => setDays(r.d)}
            >
              {r.label}
            </button>
          ))}
        </div>
        <button type="button" className="ad-refresh" onClick={() => load(days)} disabled={phase === "loading"}>
          {phase === "loading" ? "刷新中…" : "刷新"}
        </button>
      </div>

      <div className="ad-kpis">
        <Kpi label="注册用户" value={users.length} sub={`本期新增 ${newUsers}`} />
        <Kpi label="活跃设备" value={stat.activeAll} sub={`含未登录 ${stat.guestTotal}`} />
        <Kpi label="事件总量" value={stat.totalEvents} sub={truncated ? `已达上限 ${EVENT_CAP} 条` : "全量"} />
        <Kpi
          label="练习过的集数"
          value={stat.practiced}
          sub={`共 ${Object.keys(TITLES).length} 集可练`}
        />
      </div>

      <section className="ad-card">
        <div className="ad-card-h">
          <h3>每日活跃</h3>
          <div className="ad-legend">
            <i className="lg-login" /> 已登录
            <i className="lg-guest" /> 未登录
          </div>
        </div>
        <div className="ad-bars">
          {stat.dauSeries.map((p, idx) => {
            const lp = stat.loginSeries[idx];
            const h = Math.round((p.n / stat.maxDau) * 100);
            const lh = p.n ? Math.round((lp.n / p.n) * h) : 0;
            return (
              <div className="ad-bar-col" key={p.d} title={`${p.d} · 活跃 ${p.n}（登录 ${lp.n}）`}>
                <div className="ad-bar-track">
                  <i className="ad-bar-guest" style={{ height: `${Math.max(0, h - lh)}%` }} />
                  <i className="ad-bar-login" style={{ height: `${lh}%` }} />
                </div>
                {days <= 30 || idx % 3 === 0 ? <span>{fmtDay(p.d)}</span> : <span />}
              </div>
            );
          })}
        </div>
        <p className="ad-dim">
          最高单日 {stat.maxDau} 台设备。未登录的访客也计入活跃，用设备号归因；同一个设备号登录过就会挂到人身上。
        </p>
      </section>

      <div className="ad-two">
        <section className="ad-card">
          <div className="ad-card-h">
            <h3>练习漏斗</h3>
          </div>
          <div className="ad-funnel">
            {stat.funnel.map((f, i) => {
              const base = stat.funnel[0].n || 1;
              const w = Math.max(4, Math.round((f.n / base) * 100));
              return (
                <div className="ad-fn-row" key={f.k}>
                  <span className="ad-fn-l">{f.k}</span>
                  <div className="ad-fn-track">
                    <i style={{ width: `${w}%` }} />
                  </div>
                  <span className="ad-fn-n">
                    {f.n}
                    <small>{i === 0 ? "" : ` · ${pct(f.n, base)}%`}</small>
                  </span>
                </div>
              );
            })}
          </div>
          <div className="ad-mini">
            <div>
              <b>{pct(stat.d1.hit, stat.d1.base)}%</b>
              <span>次日留存（{stat.d1.base} 台）</span>
            </div>
            <div>
              <b>{pct(stat.d7.hit, stat.d7.base)}%</b>
              <span>7 日留存（{stat.d7.base} 台）</span>
            </div>
          </div>
        </section>

        <section className="ad-card">
          <div className="ad-card-h">
            <h3>最受欢迎的集</h3>
          </div>
          {stat.heat.length === 0 ? (
            <p className="ad-hint">这段时间还没有打开记录。</p>
          ) : (
            <div className="ad-heat">
              {stat.heat.map(([id, n]) => (
                <div className="ad-heat-row" key={id}>
                  <Link href={`/lesson/${id}/`} className="ad-heat-id">
                    {id}
                  </Link>
                  <div className="ad-heat-track">
                    <i style={{ width: `${Math.max(3, Math.round((n / stat.heatMax) * 100))}%` }} />
                  </div>
                  <span className="ad-heat-n">{n}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="ad-card">
        <div className="ad-card-h">
          <h3>用户</h3>
          <span className="ad-dim">按最近活跃排序，最多 2000 条</span>
        </div>
        {users.length === 0 ? (
          <p className="ad-hint">还没有人登录过。</p>
        ) : (
          <div className="ad-table-wrap">
            <table className="ad-table">
              <thead>
                <tr>
                  <th>用户</th>
                  <th>登录方式</th>
                  <th>联系方式</th>
                  <th>登录次数</th>
                  <th>首次</th>
                  <th>最近活跃</th>
                </tr>
              </thead>
              <tbody>
                {users.slice(0, 200).map((u) => (
                  <tr key={u.owner_id}>
                    <td>{u.owner_name || <span className="ad-dim">未命名</span>}</td>
                    <td>{METHOD[u.login_method] || u.login_method || "—"}</td>
                    <td className="ad-mono">{u.contact_hint || "—"}</td>
                    <td>{u.login_count}</td>
                    <td className="ad-mono">{dayOf(u.first_seen_at)}</td>
                    <td className="ad-mono">{dayOf(u.last_seen_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="ad-dim ad-foot">
        数据来自 app_users / app_events / app_learning 三张表，只统计到你有权读的行（RLS 在数据库侧生效）。
        联系方式为脱敏存储，仅用于认出同一个家长，不含完整号码。
      </p>
    </Shell>
  );
}

const METHOD = {
  phone: "手机验证码",
  email: "邮箱验证码",
  wechat: "微信",
  workbuddy: "WorkBuddy 账号",
};

function Kpi({ label, value, sub }) {
  return (
    <div className="ad-kpi">
      <span>{label}</span>
      <b>{value}</b>
      {sub && <small>{sub}</small>}
    </div>
  );
}

function Shell({ children }) {
  return (
    <div className="ad-page">
      <header className="ad-top">
        <div className="wrap ad-top-in">
          <Link href="/" className="ad-back">
            ← 返回站点
          </Link>
          <h1>数据看板</h1>
        </div>
      </header>
      <div className="wrap ad-body">{children}</div>
    </div>
  );
}
