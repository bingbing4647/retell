"use client";

// 全站登录态：恢复会话 / 处理 OAuth 回调 / 提供登录入口 / 记页面访问。
//
// ⚠️ 回调分发必须发生在任何"拦截未登录用户"的逻辑之前 —— code 是一次性的，
// 被跳转打断就废了。所以这里没有任何强制登录守卫（本站是可选登录）。

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname } from "next/navigation";
import { getCloud } from "../lib/cloud";
import {
  LOGIN_METHODS,
  contactHint,
  ensureProfile,
  resolveOAuthCallback,
  takeReturnTarget,
} from "../lib/auth";
import {
  autoRedeem,
  cachedPerson,
  clearBind,
  loadMembers,
  resolvePerson,
} from "../lib/person";
import { bindAutoPush, pullProgress, setSyncUser } from "../lib/sync";
import { EVENT, bindTrackLifecycle, flush, setTrackUser, track } from "../lib/track";
import LoginDialog from "./LoginDialog";
import AccountDialog from "./AccountDialog";

const AuthCtx = createContext(null);

/** 同一个标签页里只把"登录"算一次（每次翻页都会重新跑 boot，不挡住会重复累加）。 */
const LOGIN_MARK = "dora.login.marked";

function markLoginOnce(uid) {
  try {
    if (window.sessionStorage.getItem(LOGIN_MARK) === uid) return false;
    window.sessionStorage.setItem(LOGIN_MARK, uid);
  } catch {
    /* 隐私模式：当作第一次，最多多算一次 */
  }
  return true;
}

function clearLoginMark() {
  try {
    window.sessionStorage.removeItem(LOGIN_MARK);
  } catch {
    /* 忽略 */
  }
}

export function useAuth() {
  return useContext(AuthCtx) || EMPTY;
}

const EMPTY = {
  ready: true,
  user: null,
  session: null,
  personId: null,
  members: [],
  openLogin: () => {},
  closeLogin: () => {},
  openAccount: () => {},
  closeAccount: () => {},
  refreshMembers: async () => {},
  signOut: async () => {},
  refresh: async () => {},
  onSignedIn: null,
  notice: "",
  clearNotice: () => {},
};

export default function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [personId, setPersonId] = useState(null);
  const [members, setMembers] = useState([]);
  const [loginOpen, setLoginOpen] = useState(false);
  const [loginLink, setLoginLink] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [bootError, setBootError] = useState("");
  const [notice, setNotice] = useState("");
  const signedInCb = useRef(null);
  const path = usePathname();
  const lastPath = useRef(null);

  const refreshMembers = useCallback(async () => {
    const r = await loadMembers();
    if (r.ok) {
      setMembers(r.members);
      if (r.personId) setPersonId(r.personId);
    }
    return r;
  }, []);

  /* ---------- 登录成功后的统一收尾 ---------- */
  const finishSignIn = useCallback(
    async (sess, method) => {
      if (!sess || !sess.user) return;
      setSession(sess);
      setUser(sess.user);
      setTrackUser(sess.user.id);
      setSyncUser(sess.user.id);

      const first = markLoginOnce(sess.user.id);

      // 只有真正走了一次登录动作（授权回调 / 验证码）才算登录。
      // 「刷新页面、新开标签页时恢复已有会话」不算，否则登录次数会虚高，
      // 还会把 login_method 覆盖成 unknown。
      const known = method && LOGIN_METHODS[method] ? method : null;
      const hint = contactHint(sess.user);

      // ① 先落成员关系，拿到 person_id（一个「人」可能挂了多种登录方式）
      const ident = await resolvePerson(sess, { method: known, hint });
      let pid = ident.personId || cachedPerson() || sess.user.id;
      if (!ident.ok) console.warn("[auth] 成员关系读取失败：", ident.error);

      // ② 本机若刚发起过「绑定」，趁新身份还在手里把它兑换掉
      const bind = await autoRedeem();
      if (bind.done) {
        if (bind.ok) {
          pid = bind.personId || pid;
          setNotice("已把这个登录方式绑定到你的账号，学习记录已合并。");
        } else {
          setNotice(bind.error || "绑定没有成功");
        }
      }
      setPersonId(pid);

      // ③ 建档（以 person_id 为主键，不是当前 uid）
      if (first || bind.done) {
        if (known) track(EVENT.LOGIN_SUCCESS, { method: known, bind: bind.done ? 1 : 0 });
        const prof = await ensureProfile(sess, { personId: pid, method: known, hint, count: !!known });
        if (!prof.ok) console.warn("[auth] 建档失败：", prof.error);
      }

      await refreshMembers();

      const pulled = await pullProgress();
      if (pulled.rows > 0) {
        console.info(`[sync] 云端 ${pulled.rows} 集进度已合并，补推 ${pulled.dirty.length} 集`);
      }
      flush();

      if ((first || bind.done) && typeof signedInCb.current === "function") {
        try {
          signedInCb.current(sess);
        } catch {
          /* 页面自己的回调出错不该影响登录 */
        }
      }
    },
    [refreshMembers]
  );

  /* ---------- 启动：先处理回调，再恢复会话 ---------- */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const cloud = getCloud();
    try {
      bindTrackLifecycle();
    } catch {
      /* 埋点挂钩失败不该影响使用 */
    }
    const offAutoPush = bindAutoPush();
    let offAuth = () => {};

    (async () => {
      // 整个启动流程包在 try 里：云服务/网络/RLS 任何一环出问题，
      // 结果只能是「降级成游客可用」，绝不能把整页炸成 Application error
      // —— 那会变成家长看到白屏，而登录本来是可选功能。
      try {
        if (!cloud) return;

        const cb = await resolveOAuthCallback();
        if (cb.handled && cb.error) {
          // 授权失败：之前 stash 的绑定码作废，别让它下次误并
          clearBind();
          setBootError(cb.error);
          setLoginOpen(true);
        }
        if (cb.session) {
          await finishSignIn(cb.session, cb.method);
          const back = takeReturnTarget();
          if (back && back !== window.location.pathname + window.location.search) {
            // 回到登录前那一页；用 replace 避免登录页留在历史里
            window.location.replace(back);
            return;
          }
        } else {
          const got = await cloud.auth.getSession();
          // 这里是「恢复已有会话」，不是一次新的登录动作：method 传 null，
          // 于是只刷新档案、不累加登录次数（见 ensureProfile 的 opts.count）。
          if (got.data) await finishSignIn(got.data, null);
        }

        offAuth = cloud.auth.onAuthStateChange((event, sess) => {
          if (event === "SIGNED_OUT") {
            setSession(null);
            setUser(null);
            setPersonId(null);
            setMembers([]);
            setTrackUser(null);
            setSyncUser(null);
            clearLoginMark();
          } else if (sess && (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "USER_UPDATED")) {
            setSession(sess);
            setUser(sess.user || null);
            setTrackUser(sess.user && sess.user.id);
            setSyncUser(sess.user && sess.user.id);
          }
        });
      } catch (err) {
        // 云服务/网络/RLS 出错就降级成游客：页面照常能看能听，登录只是附加功能。
        console.warn("[auth] 启动流程出错，已降级为游客模式：", err);
      } finally {
        setReady(true);
      }
    })();

    return () => {
      offAuth();
      offAutoPush();
    };
  }, [finishSignIn]);

  /* ---------- 页面访问 ---------- */
  useEffect(() => {
    if (!ready || !path) return;
    if (lastPath.current === path) return;
    lastPath.current = path;
    const m = /^\/lesson\/(S\d{2}E\d{2})\/?$/i.exec(path);
    track(EVENT.PAGE_VIEW, m ? { lesson_id: m[1].toUpperCase() } : null);
  }, [path, ready]);

  /* ---------- 对外动作 ---------- */
  const openLogin = useCallback((reason) => {
    if (reason) setBootError(String(reason));
    setLoginLink(false);
    setNotice("");
    track(EVENT.LOGIN_OPEN);
    setLoginOpen(true);
  }, []);

  const closeLogin = useCallback(() => {
    setLoginOpen(false);
    setLoginLink(false);
    setBootError("");
  }, []);

  /** 已登录状态下再开登录弹窗 = 绑定新方式，不退出当前账号。 */
  const openLinkLogin = useCallback(() => {
    setBootError("");
    setNotice("");
    track(EVENT.LOGIN_OPEN, { mode: "bind" });
    setLoginLink(true);
    setLoginOpen(true);
  }, []);

  const openAccount = useCallback(() => {
    // 注意：不要在这里清 notice —— 「已绑定」的提示要留到面板里给用户看，
    // 由 AccountDialog 消费后自行清掉（clearNotice）。
    setAccountOpen(true);
    refreshMembers();
  }, [refreshMembers]);

  const closeAccount = useCallback(() => setAccountOpen(false), []);

  const signOut = useCallback(async () => {
    const cloud = getCloud();
    track(EVENT.LOGOUT);
    await flush();
    if (cloud) {
      try {
        await cloud.auth.signOut();
      } catch {
        /* 忽略：本地状态照常清掉 */
      }
    }
    setSession(null);
    setUser(null);
    setPersonId(null);
    setMembers([]);
    setAccountOpen(false);
    setTrackUser(null);
    setSyncUser(null);
    clearLoginMark();
  }, []);

  const refresh = useCallback(async () => {
    const cloud = getCloud();
    if (!cloud) return;
    const got = await cloud.auth.getSession();
    if (got.data) {
      setSession(got.data);
      setUser(got.data.user || null);
    }
  }, []);

  const value = useMemo(
    () => ({
      ready,
      session,
      user,
      personId,
      members,
      openLogin,
      closeLogin,
      openLinkLogin,
      openAccount,
      closeAccount,
      refreshMembers,
      signOut,
      refresh,
      bootError,
      notice,
      clearNotice: () => setNotice(""),
      /// 页面可在登录成功后做一次自己的收尾（例如看板重新拉数据）
      setOnSignedIn: (fn) => {
        signedInCb.current = fn;
      },
    }),
    [
      ready,
      session,
      user,
      personId,
      members,
      openLogin,
      closeLogin,
      openLinkLogin,
      openAccount,
      closeAccount,
      refreshMembers,
      signOut,
      refresh,
      bootError,
      notice,
    ]
  );

  return (
    <AuthCtx.Provider value={value}>
      {children}
      <LoginHost
        open={loginOpen}
        link={loginLink}
        onClose={closeLogin}
        bootError={bootError}
        onSignedIn={finishSignIn}
      />
      <AccountHost
        open={accountOpen}
        onClose={closeAccount}
        personId={personId}
        members={members}
        user={user}
        onBindMore={() => {
          setAccountOpen(false);
          openLinkLogin();
        }}
        onRefresh={refreshMembers}
        notice={notice}
        clearNotice={() => setNotice("")}
      />
    </AuthCtx.Provider>
  );
}

/* 单独拆一层，避免 provider 与弹窗互相 import 造成循环依赖 */
function LoginHost({ open, link, onClose, bootError, onSignedIn }) {
  if (!open) return null;
  return (
    <LoginDialog
      linkMode={link}
      onClose={() => {
        // 绑定流程没走完就关掉：把待兑换的绑定码清掉，避免以后误并账号
        if (link) clearBind();
        onClose();
      }}
      bootError={bootError}
      onSignedIn={onSignedIn}
    />
  );
}

function AccountHost({ open, onClose, personId, members, user, onBindMore, onRefresh, notice, clearNotice }) {
  if (!open) return null;
  return (
    <AccountDialog
      onClose={onClose}
      personId={personId}
      members={members}
      user={user}
      onBindMore={onBindMore}
      onRefresh={onRefresh}
      notice={notice}
      clearNotice={clearNotice}
    />
  );
}
