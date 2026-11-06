"use client";

// 登录弹窗：手机验证码 / 邮箱验证码 / 微信授权 / WorkBuddy 账号。
// 线性图标风格，与全站一致。

import { useEffect, useMemo, useRef, useState } from "react";
import { PHONE_RE, sendCode, startOAuth, verifyCode } from "../lib/auth";
import { createLinkCode, stashBind } from "../lib/person";
import { EVENT, track } from "../lib/track";

const S = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

function IconClose(p) {
  return (
    <svg {...S} {...p}>
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  );
}

function IconPhone(p) {
  return (
    <svg {...S} {...p}>
      <rect x="6.5" y="2.8" width="11" height="18.4" rx="2.6" />
      <path d="M10.6 18.4h2.8" />
    </svg>
  );
}

function IconMail(p) {
  return (
    <svg {...S} {...p}>
      <rect x="2.8" y="5.2" width="18.4" height="13.6" rx="2.4" />
      <path d="m3.4 6.6 8.6 6 8.6-6" />
    </svg>
  );
}

function IconWechat(p) {
  return (
    <svg {...S} {...p}>
      <path d="M9.2 3.6c-3.6 0-6.5 2.3-6.5 5.2 0 1.6.9 3 2.3 4l-.6 2 2.2-1.1c.5.1 1 .2 1.6.2" />
      <path d="M14.6 9.4c3.3 0 6 2.1 6 4.8 0 1.5-.8 2.8-2.1 3.7l.5 1.9-2-1c-.5.1-1 .2-1.6.2-3.3 0-6-2.1-6-4.8s2.7-4.8 6-4.8Z" />
    </svg>
  );
}

function IconBuddy(p) {
  return (
    <svg {...S} {...p}>
      <circle cx="12" cy="12" r="8.6" />
      <path d="M8.4 15.2V9.4l3.6 3 3.6-3v5.8" />
    </svg>
  );
}

function IconShield(p) {
  return (
    <svg {...S} width={13} height={13} {...p}>
      <path d="M12 3.2 5.6 5.6v5.1c0 4 2.7 7 6.4 8.1 3.7-1.1 6.4-4.1 6.4-8.1V5.6z" />
      <path d="m9.3 11.8 1.9 1.9 3.6-3.6" />
    </svg>
  );
}

const TABS = [
  { k: "phone", label: "手机号", icon: IconPhone },
  { k: "email", label: "邮箱", icon: IconMail },
];

export default function LoginDialog({ onClose, bootError, onSignedIn, linkMode = false }) {
  const [tab, setTab] = useState("phone");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [challenge, setChallenge] = useState(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState(bootError || "");
  const [warn, setWarn] = useState("");
  const [left, setLeft] = useState(0);
  const [bindReady, setBindReady] = useState(!linkMode);
  const timer = useRef(null);
  const codeRef = useRef(null);

  /* 倒计时 */
  useEffect(() => {
    if (left <= 0) {
      if (timer.current) {
        clearInterval(timer.current);
        timer.current = null;
      }
      return;
    }
    if (!timer.current) {
      timer.current = setInterval(() => setLeft((v) => (v <= 1 ? 0 : v - 1)), 1000);
    }
    return () => {
      if (timer.current && left <= 0) {
        clearInterval(timer.current);
        timer.current = null;
      }
    };
  }, [left]);

  useEffect(() => () => timer.current && clearInterval(timer.current), []);

  /* 绑定模式：先悄悄领一个绑定码存好，等新登录落地后自动并回原账号。
     必须提前领 —— 微信授权会整页跳走，来不及在点击时再请求。 */
  useEffect(() => {
    if (!linkMode) return;
    let alive = true;
    (async () => {
      const r = await createLinkCode();
      if (!alive) return;
      if (r.ok) {
        stashBind(r.code);
        setBindReady(true);
      } else {
        setErr(r.error || "暂时无法发起绑定，请稍后重试");
      }
    })();
    return () => {
      alive = false;
    };
  }, [linkMode]);

  /* Esc 关闭 + 锁滚动 + 挡住方向键（别让底下的九宫格/播放器跟着翻页） */
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " ", "Home", "End"].includes(e.key)) {
        const t = e.target;
        const tag = t && t.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") return; // 输入框里正常编辑
        e.stopPropagation();
      }
    };
    window.addEventListener("keydown", onKey, true);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const account = tab === "phone" ? phone : email;
  const accountOk = useMemo(() => {
    const v = account.trim();
    return tab === "phone" ? PHONE_RE.test(v) : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  }, [account, tab]);

  const switchTab = (k) => {
    if (k === tab) return;
    setTab(k);
    setChallenge(null);
    setSent(false);
    setCode("");
    setErr("");
    setWarn("");
    setLeft(0);
  };

  const doOAuth = async (provider) => {
    setErr("");
    setBusy(provider);
    track(EVENT.LOGIN_OPEN, { provider });
    const r = await startOAuth(provider);
    setBusy("");
    if (!r.ok) {
      setErr(r.error);
      return;
    }
    // 同一标签页跳转：PKCE 校验值存在本标签页的 sessionStorage 里
    window.location.assign(r.url);
  };

  const doSend = async () => {
    setErr("");
    setWarn("");
    if (!accountOk) {
      setWarn(tab === "phone" ? "请输入正确的 11 位手机号" : "请输入正确的邮箱地址");
      return;
    }
    setBusy("send");
    const r = await sendCode(tab === "phone" ? { phone: account.trim() } : { email: account.trim() });
    setBusy("");
    if (!r.ok) {
      setErr(r.error);
      return;
    }
    setChallenge(r.challenge);
    setSent(true);
    setLeft(60);
    setTimeout(() => codeRef.current && codeRef.current.focus(), 60);
  };

  const doVerify = async (e) => {
    if (e) e.preventDefault();
    setErr("");
    if (!challenge) {
      setWarn("请先获取验证码");
      return;
    }
    if (!/^\d{4,8}$/.test(code.trim())) {
      setWarn("请输入收到的数字验证码");
      return;
    }
    setWarn("");
    setBusy("verify");
    const r = await verifyCode(challenge, code);
    setBusy("");
    if (!r.ok) {
      setErr(r.error);
      track(EVENT.LOGIN_FAIL, { method: tab, reason: "otp" });
      return;
    }
    if (onSignedIn) await onSignedIn(r.session, r.method);
    onClose();
  };

  return (
    <div className="lg-mask" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="lg-box" role="dialog" aria-modal="true" aria-labelledby="lg-title">
        <button type="button" className="lg-x" onClick={onClose} aria-label="关闭">
          <IconClose />
        </button>

        <h2 id="lg-title" className="lg-title">
          {linkMode ? "绑定新的登录方式" : "登录"}
        </h2>
        <p className="lg-sub">
          {linkMode
            ? "绑定后，用任意一种方式登录都能看到同一份学习记录；当前账号不会被退出。"
            : "登录后练习进度会存到云端，换个设备也能接着练。"}
        </p>

        <div className="lg-oauth">
          <button
            type="button"
            className="lg-oauth-btn lg-wechat"
            onClick={() => doOAuth("wechat")}
            disabled={!!busy || !bindReady}
          >
            <IconWechat />
            {linkMode ? "绑定微信" : "微信登录"}
          </button>
          <button
            type="button"
            className="lg-oauth-btn lg-buddy"
            onClick={() => doOAuth("workbuddy")}
            disabled={!!busy || !bindReady}
          >
            <IconBuddy />
            {linkMode ? "绑定 WorkBuddy 账号" : "使用 WorkBuddy 登录"}
          </button>
        </div>

        <div className="lg-or">
          <span>或用验证码</span>
        </div>

        <div className="lg-tabs" role="tablist">
          {TABS.map((t) => {
            const I = t.icon;
            return (
              <button
                key={t.k}
                type="button"
                role="tab"
                aria-selected={tab === t.k}
                className={`lg-tab ${tab === t.k ? "on" : ""}`}
                onClick={() => switchTab(t.k)}
              >
                <I width={15} height={15} />
                {t.label}
              </button>
            );
          })}
        </div>

        <form className="lg-form" onSubmit={doVerify}>
          <label className="lg-field">
            <span>{tab === "phone" ? "手机号" : "邮箱"}</span>
            <input
              value={account}
              inputMode={tab === "phone" ? "numeric" : "email"}
              autoComplete={tab === "phone" ? "tel" : "email"}
              placeholder={tab === "phone" ? "11 位手机号" : "you@example.com"}
              onChange={(e) => {
                const v = e.target.value;
                if (tab === "phone") setPhone(v);
                else setEmail(v);
                setWarn("");
                if (challenge && v.trim() !== account.trim()) {
                  setChallenge(null);
                  setSent(false);
                }
              }}
            />
          </label>

          <label className="lg-field">
            <span>验证码</span>
            <div className="lg-code-row">
              <input
                ref={codeRef}
                value={code}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={8}
                placeholder="收到的数字验证码"
                onChange={(e) => {
                  setCode(e.target.value.replace(/\D/g, ""));
                  setWarn("");
                }}
              />
              <button
                type="button"
                className="lg-send"
                onClick={doSend}
                disabled={busy === "send" || left > 0}
              >
                {busy === "send" ? "发送中…" : left > 0 ? `${left}s 后重发` : sent ? "重新获取" : "获取验证码"}
              </button>
            </div>
          </label>

          {warn && <p className="lg-warn">{warn}</p>}
          {err && <p className="lg-err">{err}</p>}

          <button type="submit" className="lg-submit" disabled={busy === "verify" || !accountOk || !code || !bindReady}>
            {busy === "verify" ? (linkMode ? "绑定中…" : "登录中…") : linkMode ? "绑定这个登录方式" : "登录 / 注册"}
          </button>
        </form>

        <p className="lg-note">
          <IconShield />
          {linkMode
            ? "绑定只是把两种登录方式指向同一个账号，不会搬动或删除任何练习记录，随时可以在「账号与登录方式」里解绑。"
            : "登录信息仅用于同步练习进度和改进内容，不会对外分享。未注册的号码或邮箱验证后自动创建账号。"}
        </p>
      </div>
    </div>
  );
}
