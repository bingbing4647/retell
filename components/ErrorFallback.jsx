"use client";

// 出错时的兜底界面（全站共用一个）。Next 默认那句英文「Application error」
// 只会让家长以为网站坏了，这里换成中文 + 可重试，并把错误回传一条埋点。
//
// 回传本身必须层层 try/catch —— 如果崩的正是云服务模块，回传二次抛错就彻底白屏了。

import { useEffect, useState } from "react";

// 这类白屏最常见的真实原因：浏览器还拿着上一次发布的 HTML，里面写的 chunk
// 文件名已经被新版本替换 → 加载脚本失败。它跟「代码写错了」完全是两回事，
// 处理方式就是换一个不带缓存的地址重进一次。
const STALE_RE = /ChunkLoadError|Loading chunk .* failed|Failed to fetch dynamically imported module|Importing a module script failed|Unexpected token '</i;
const GUARD = "dora.err_reload";

function isStale(err) {
  const msg = String((err && (err.message || err.name)) || err || "");
  return STALE_RE.test(msg);
}

function report(err, where) {
  try {
    const msg = String((err && err.message) || err || "").slice(0, 300);
    const stack = String((err && err.stack) || "").slice(0, 600);
    console.error(`[app-error:${where}]`, err);
    import("../lib/track")
      .then(({ track, flush }) => {
        try {
          track("client_error", {
            where,
            msg,
            stack,
            path: typeof window !== "undefined" ? window.location.pathname : "",
            ua: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 110) : "",
          });
          flush();
        } catch {
          /* 忽略 */
        }
      })
      .catch(() => {});
  } catch {
    /* 忽略 */
  }
}

const box = {
  minHeight: "100%",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 14,
  padding: "48px 22px",
  textAlign: "center",
  fontFamily: "system-ui, -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif",
  color: "#33302c",
  background: "#fdfbf7",
};

export default function ErrorFallback({ error, reset, where = "route" }) {
  const [auto, setAuto] = useState(false);

  useEffect(() => {
    report(error, where);
  }, [error, where]);

  // 旧版本缓存导致的加载失败：静默换地址重进一次，用户基本察觉不到。
  // 用「5 分钟内最多 2 次」做闸门，真坏了也不会变成无限刷新。
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!isStale(error)) return;
    let n = 0;
    try {
      const raw = window.sessionStorage.getItem(GUARD);
      const rec = raw ? JSON.parse(raw) : null;
      if (rec && Date.now() - Number(rec.t || 0) < 5 * 60 * 1000) n = Number(rec.n || 0);
    } catch {
      /* sessionStorage 不可用就当作第一次 */
    }
    if (n >= 2) return;

    setAuto(true);
    try {
      window.sessionStorage.setItem(GUARD, JSON.stringify({ n: n + 1, t: Date.now() }));
    } catch {
      /* 忽略 */
    }
    const timer = window.setTimeout(() => {
      try {
        const url = new URL(window.location.href);
        url.searchParams.set("_r", String(Date.now())); // 绕开缓存里的旧 HTML
        window.location.replace(url.toString());
      } catch {
        window.location.reload();
      }
    }, 700);
    return () => window.clearTimeout(timer);
  }, [error]);

  return (
    <div style={box}>
      <svg
        width="38"
        height="38"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#e8863c"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8v5.2" />
        <path d="M12 16.2h.01" />
      </svg>
      <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>
        {auto ? "正在为你重新载入…" : "这一页刚刚出了点问题"}
      </h1>
      <p style={{ margin: 0, maxWidth: 460, fontSize: 14, lineHeight: 1.75, color: "#7b7268" }}>
        {auto
          ? "页面有新版更新，马上自动打开。如果几秒后还停在这里，点下面的按钮手动重试。"
          : "不是你的操作有误，重新加载一次通常就好。如果反复出现，把下面这行文字发给我，我这边能直接定位。"}
      </p>
      {!auto && error && error.message ? (
        <code
          style={{
            maxWidth: 520,
            padding: "8px 12px",
            borderRadius: 8,
            background: "#f6efe6",
            color: "#9a8f81",
            fontSize: 11.5,
            lineHeight: 1.6,
            wordBreak: "break-all",
          }}
        >
          {String(error.message).slice(0, 180)}
        </code>
      ) : null}
      <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
        <button
          type="button"
          onClick={() => {
            try {
              if (reset) reset();
              else window.location.reload();
            } catch {
              window.location.reload();
            }
          }}
          style={{
            padding: "9px 20px",
            borderRadius: 10,
            border: "0",
            background: "#e8863c",
            color: "#fff",
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          重试
        </button>
        <button
          type="button"
          onClick={() => window.location.assign("/")}
          style={{
            padding: "9px 20px",
            borderRadius: 10,
            border: "1px solid #e6dccd",
            background: "#fff",
            color: "#4a453e",
            fontSize: 14,
            cursor: "pointer",
          }}
        >
          回首页
        </button>
      </div>
    </div>
  );
}
