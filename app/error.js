"use client";

// 路由段错误兜底（根 layout 之内）。真正的界面在 components/ErrorFallback。
import ErrorFallback from "../components/ErrorFallback";

export default function ErrorPage({ error, reset }) {
  return <ErrorFallback error={error} reset={reset} where="route" />;
}
