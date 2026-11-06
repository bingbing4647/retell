"use client";

// 「账号与登录方式」面板：看已绑定的登录方式、绑定新的、用绑定码把另一台设备并进来。
//
// 一个「人」= 一个 person_id，下面挂多行 app_members（每行一种登录方式）。
// 绑定只改归属，不搬动任何练习记录（数据库 RLS 按同一 person 的 uid 集合放开读取）。

import { useEffect, useState } from "react";
import { LOGIN_METHODS } from "../lib/auth";
import { createLinkCode, redeemLinkCode, unbindLogin } from "../lib/person";

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

function IconLink(p) {
  return (
    <svg {...S} {...p}>
      <path d="M10.2 13.8a3.6 3.6 0 0 0 5.1 0l2.6-2.6a3.6 3.6 0 0 0-5.1-5.1l-1.3 1.3" />
      <path d="M13.8 10.2a3.6 3.6 0 0 0-5.1 0l-2.6 2.6a3.6 3.6 0 0 0 5.1 5.1l1.3-1.3" />
    </svg>
  );
}

const ICONS = {
  wechat: IconWechat,
  workbuddy: IconBuddy,
  phone: IconPhone,
  email: IconMail,
};

function methodLabel(m) {
  return LOGIN_METHODS[m] || (m === "unknown" || !m ? "未知方式" : m);
}

function prettyCode(code) {
  const s = String(code || "");
  return s.length === 8 ? `${s.slice(0, 4)}-${s.slice(4)}` : s;
}

export default function AccountDialog({
  onClose,
  personId,
  members,
  onBindMore,
  onRefresh,
  notice,
  clearNotice,
}) {
  const [code, setCode] = useState("");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState(notice || "");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " ", "Home", "End"].includes(e.key)) {
        const t = e.target;
        const tag = t && t.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") return;
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

  useEffect(() => {
    if (notice) {
      setMsg(notice);
      if (clearNotice) clearNotice();
    }
  }, [notice, clearNotice]);

  const list = Array.isArray(members) ? members : [];
  const primary = list.find((m) => m.is_primary) || list[0] || null;

  const doGen = async () => {
    setErr("");
    setMsg("");
    setCopied(false);
    setBusy("gen");
    const r = await createLinkCode();
    setBusy("");
    if (!r.ok) {
      setErr(r.error);
      return;
    }
    setCode(r.code);
  };

  const doCopy = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(prettyCode(code));
      setCopied(true);
    } catch {
      setErr("复制失败，请长按选中后手动复制");
    }
  };

  const doRedeem = async () => {
    setErr("");
    setMsg("");
    setBusy("redeem");
    const r = await redeemLinkCode(input);
    setBusy("");
    if (!r.ok) {
      setErr(r.error);
      return;
    }
    setInput("");
    await onRefresh();
    setMsg(r.same ? "这个账号本来就是当前账号，不需要合并。" : "合并成功，两边的练习记录已经并到一起了。");
  };

  const doUnbind = async (m) => {
    const name = methodLabel(m.method);
    // eslint-disable-next-line no-alert
    if (!window.confirm(`解绑「${name}」后，用它登录时就只能看到它自己产生的记录，确定解绑吗？`)) return;
    setErr("");
    setMsg("");
    setBusy(m.owner_id);
    const r = await unbindLogin(m.owner_id);
    setBusy("");
    if (!r.ok) {
      setErr(r.error);
      return;
    }
    await onRefresh();
    setMsg(`已解绑「${name}」。`);
  };

  return (
    <div className="lg-mask" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="lg-box ac-box" role="dialog" aria-modal="true" aria-labelledby="ac-title">
        <button type="button" className="lg-x" onClick={onClose} aria-label="关闭">
          <IconClose />
        </button>

        <h2 id="ac-title" className="lg-title">
          账号与登录方式
        </h2>
        <p className="lg-sub">
          把微信、手机号、邮箱都绑到同一个人身上，换哪种方式登录都能看到同一份学习记录。
        </p>

        {/* 已绑定列表 */}
        <div className="ac-list">
          {list.length === 0 && <p className="ac-empty">还没有读到绑定信息，请稍后重试。</p>}
          {list.map((m) => {
            const I = ICONS[m.method] || IconLink;
            const isPrimary = primary && m.owner_id === primary.owner_id;
            return (
              <div className="ac-row" key={m.owner_id}>
                <span className="ac-ico">
                  <I width={16} height={16} />
                </span>
                <span className="ac-name">
                  {methodLabel(m.method)}
                  {m.identifier_hint && <em>{m.identifier_hint}</em>}
                </span>
                {isPrimary ? (
                  <span className="ac-tag">主账号</span>
                ) : (
                  <button
                    type="button"
                    className="ac-unbind"
                    onClick={() => doUnbind(m)}
                    disabled={!!busy}
                  >
                    {busy === m.owner_id ? "解绑中…" : "解绑"}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <button type="button" className="ac-add" onClick={onBindMore} disabled={!!busy}>
          <IconLink width={15} height={15} />
          绑定新的登录方式
        </button>

        {/* 绑定码 */}
        <div className="ac-sep">
          <span>换设备 / 换浏览器？</span>
        </div>

        <p className="ac-tip">
          在已经登录的这边生成一个 8 位绑定码，到另一台设备上登录后输入它，就会合并成同一个账号。
          绑定码 10 分钟内有效，只能用一次。
        </p>

        {code ? (
          <div className="ac-code">
            <b>{prettyCode(code)}</b>
            <button type="button" className="ac-copy" onClick={doCopy}>
              {copied ? "已复制" : "复制"}
            </button>
            <button type="button" className="ac-regen" onClick={doGen} disabled={busy === "gen"}>
              换一个
            </button>
          </div>
        ) : (
          <button type="button" className="ac-gen" onClick={doGen} disabled={busy === "gen"}>
            {busy === "gen" ? "生成中…" : "生成绑定码"}
          </button>
        )}

        <div className="ac-merge">
          <input
            value={input}
            placeholder="输入对方给的 8 位绑定码"
            maxLength={9}
            autoComplete="off"
            onChange={(e) => {
              const v = e.target.value.replace(/[^0-9a-zA-Z]/g, "").toUpperCase().slice(0, 8);
              setInput(v);
              setErr("");
            }}
          />
          <button type="button" onClick={doRedeem} disabled={busy === "redeem" || input.length !== 8}>
            {busy === "redeem" ? "合并中…" : "合并到当前账号"}
          </button>
        </div>

        {err && <p className="lg-err">{err}</p>}
        {!err && msg && <p className="ac-ok">{msg}</p>}

        <p className="lg-note">
          <IconShield />
          <span>
            绑定只改归属关系，不复制、不删除任何记录。解绑后，被解绑的那种登录方式只保留它自己产生的记录。
          </span>
        </p>
        {personId && <p className="ac-pid">账号编号 {String(personId).slice(-8)}</p>}
      </div>
    </div>
  );
}
