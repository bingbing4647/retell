"use client";

// 根 layout 自身出错时的兜底。这个文件会**替换**整个 <html>，所以必须自带 html/body，
// 也不能依赖 globals.css（此时样式表可能根本没加载）—— 视觉全部走内联样式。

import ErrorFallback from "../components/ErrorFallback";

export default function GlobalError({ error, reset }) {
  return (
    <html lang="zh-CN">
      <body style={{ margin: 0, background: "#fdfbf7" }}>
        <ErrorFallback error={error} reset={reset} where="global" />
      </body>
    </html>
  );
}
