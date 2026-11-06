"use client";

// 顶栏右上角的登录入口 / 已登录头像。
// 未登录时只是一个「登录」按钮，不拦任何操作。

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { LOGIN_METHODS } from "../lib/auth";
import { useAuth } from "./AuthProvider";

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

function IconUser(p) {
  return (
    <svg {...S} width={15} height={15} {...p}>
      <circle cx="12" cy="8.4" r="3.7" />
      <path d="M4.8 20.2c.6-3.5 3.6-5.6 7.2-5.6s6.6 2.1 7.2 5.6" />
    </svg>
  );
}

function IconLink(p) {
  return (
    <svg {...S} width={15} height={15} {...p}>
      <path d="M10.2 13.8a3.6 3.6 0 0 0 5.1 0l2.6-2.6a3.6 3.6 0 0 0-5.1-5.1l-1.3 1.3" />
      <path d="M13.8 10.2a3.6 3.6 0 0 0-5.1 0l-2.6 2.6a3.6 3.6 0 0 0 5.1 5.1l1.3-1.3" />
    </svg>
  );
}

export default function UserMenu() {
  const { ready, user, members, openLogin, openAccount, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const box = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (box.current && !box.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // 会话恢复完成前不渲染，避免先闪「登录」再变头像
  if (!ready) return null;

  if (!user) {
    return (
      <button type="button" className="um-login" onClick={() => openLogin()}>
        <IconUser />
        登录
      </button>
    );
  }

  const name = user.name || (user.phone ? "家长" : "我的账号");
  const initial = String(name).trim().slice(0, 1) || "我";

  const bound = (Array.isArray(members) ? members : [])
    .map((m) => LOGIN_METHODS[m.method] || null)
    .filter(Boolean);

  return (
    <div className="um-wrap" ref={box}>
      <button
        type="button"
        className="um-avatar"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={name}
      >
        {user.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.avatarUrl} alt="" />
        ) : (
          <span>{initial}</span>
        )}
      </button>

      {open && (
        <div className="um-menu" role="menu">
          <div className="um-head">
            <b>{name}</b>
            <small>{bound.length ? `已绑定 ${bound.join(" / ")}` : "已登录"}</small>
          </div>
          <Link href="/" className="um-item" onClick={() => setOpen(false)}>
            首页 · 选剧
          </Link>
          <Link href="/admin/" className="um-item" onClick={() => setOpen(false)}>
            数据看板
          </Link>
          <button
            type="button"
            className="um-item"
            onClick={() => {
              setOpen(false);
              openAccount();
            }}
          >
            <IconLink width={14} height={14} />
            账号与登录方式
          </button>
          <button
            type="button"
            className="um-item danger"
            onClick={async () => {
              setOpen(false);
              await signOut();
            }}
          >
            退出登录
          </button>
        </div>
      )}
    </div>
  );
}
