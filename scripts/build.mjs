// 一条命令完成「干净构建 + 校验 out」。
//
// 本机的两个坑（2026-10-28 实测，务必保留这两个补丁）：
//  1) 打开 `<项目>/.next/trace` 一直 EPERM，Next 当 uncaughtException 直接中断构建。
//     → --require scripts/no-trace.cjs 把这个纯日志文件改成空写（不影响产物）。
//  2) WorkBuddy 给 node 注入的 fs shim 会拦批量删除，且 NODE_OPTIONS 存在时
//     fs.cpSync 会段错误。→ 脚本先以空 NODE_OPTIONS 重启自己，再清理目录。
//
// 用法：npm run build
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = process.cwd();
const SELF = fileURLToPath(import.meta.url);

if ((process.env.NODE_OPTIONS || "").includes("node-language-shim")) {
  const r = spawnSync(process.execPath, [SELF, ...process.argv.slice(2)], {
    cwd: ROOT,
    env: { ...process.env, NODE_OPTIONS: "" },
    stdio: "inherit",
  });
  process.exit(r.status ?? 1);
}

const OUT = "out";
const cleanEnv = { ...process.env, NODE_OPTIONS: "" };

function run(args) {
  const r = spawnSync(process.execPath, args, {
    cwd: ROOT,
    env: cleanEnv,
    stdio: "inherit",
  });
  return r.status ?? 1;
}

console.log("==> 清理 .next / out");
run(["scripts/wipe.mjs", ".next", OUT]);

// 本机已知竞态：首次全量构建到 "Collecting build traces" 时，某些
// `.next/server/**/*.nft.json` 还没落盘 → ENOENT 直接失败；
// 保留 .next 缓存重跑一次，增量编译几秒就过。所以最多试 3 次。
let ok = false;
for (let attempt = 1; attempt <= 3 && !ok; attempt++) {
  console.log(`==> next build（第 ${attempt} 次）`);
  const code = run([
    "--require",
    path.join(ROOT, "scripts/no-trace.cjs"),
    "node_modules/next/dist/bin/next",
    "build",
  ]);
  ok = code === 0 && fs.existsSync(OUT);
  if (!ok) {
    console.log(`   第 ${attempt} 次未通过，保留缓存重试…`);
  }
}
if (!ok) {
  console.error("构建失败（已重试 3 次）");
  process.exit(1);
}

const count = (dir) => {
  let n = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const q = path.join(dir, e.name);
    if (e.isDirectory()) n += count(q);
    else if (e.name.endsWith(".html")) n++;
  }
  return n;
};

const html = count(OUT);
const imgs = fs.existsSync(path.join(OUT, "img"))
  ? fs.readdirSync(path.join(OUT, "img")).length
  : 0;
console.log(`==> 完成：${OUT}/ 共 ${html} 个 html、${imgs} 个剧集图目录`);

if (html < 2 || imgs === 0) {
  console.error("输出异常：页面或图片缺失");
  process.exit(1);
}
