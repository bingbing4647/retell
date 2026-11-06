"use client";

// WorkBuddy 云服务接入层（单例）。
//
// publicConfig 只能来自 workbuddy_cloud_service 的返回值，此处为 2026-10-31 开通时
// 读取到的实际配置：
//   resourceId     wbcs_e66lN6YRxFDgMTigQLSQbm
//   billingStatus  normal / provisionStatus assigned
//
// ⚠️ endpoint 就是本应用的发布域名（https://retell.app.workbuddy.host），服务端按
// Origin 精确匹配。**不要**换成 location.origin、env 变量或任何硬编码推导值，也
// 不要在换域名后"顺手改一下"——这个值必须来自 publicConfig。
//
// publishableKey 只标识「是哪个应用」，本身不带权限，出现在前端源码里是设计如此；
// 但它不该进日志。

import { createWorkBuddyCloud } from "@tencent-ai/workbuddy-cloud-sdk";

export const PUBLIC_CONFIG = {
  endpoint: "https://retell.app.workbuddy.host",
  oauthRelayBaseUrl: "https://www.workbuddy.cn/v2/as/genie-baas/oauth",
  publishableKey: "wbpk_BCIX0naGSML3uxR0P4aSN8_mgXbMaqC7Lo9lomI2heUykeKmGNM6iKw",
};

let _cloud = null;
let _initTried = false;

/** 取云服务客户端；浏览器之外（SSR / 构建期）返回 null。 */
export function getCloud() {
  if (typeof window === "undefined") return null;
  if (_initTried) return _cloud;
  _initTried = true;
  try {
    _cloud = createWorkBuddyCloud({
      endpoint: PUBLIC_CONFIG.endpoint,
      oauthRelayBaseUrl: PUBLIC_CONFIG.oauthRelayBaseUrl,
      publishableKey: PUBLIC_CONFIG.publishableKey,
    });
  } catch (err) {
    // 初始化失败不抛给页面：没有云服务时站点仍然可以当纯静态页面用
    console.error("[cloud] 初始化失败：", err && err.message ? err.message : err);
    _cloud = null;
  }
  return _cloud;
}

/** 统一的错误文案：不把原始 token / 手机号 / 邮箱塞进界面。 */
export function readError(err, fallback = "网络不太稳定，请稍后再试") {
  if (!err) return fallback;
  const kind = err.kind;
  if (kind === "network") return "网络连接失败，请检查网络后重试";
  if (kind === "backend-unavailable") return "服务暂时不可用，请稍后再试";
  if (kind === "rate-limited") return "操作太频繁了，请稍等一会儿";
  if (kind === "credits-exhausted") return "服务额度已用完，请联系管理员";
  if (kind === "permission-denied") return "没有权限执行这个操作";
  if (kind === "unauthenticated") return "登录已过期，请重新登录";
  return err.message || fallback;
}
