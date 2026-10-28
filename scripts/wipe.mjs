// 递归删除目录（必须用原生 fs，所以调用方要把 NODE_OPTIONS 置空）
// 用法：node scripts/wipe.mjs .next3 out
import fs from "node:fs";

for (const p of process.argv.slice(2)) {
  if (!p) continue;
  if (!fs.existsSync(p)) continue;
  try {
    fs.rmSync(p, { recursive: true, force: true, maxRetries: 8 });
  } catch {}
  if (fs.existsSync(p)) {
    // 极端情况下 rmSync 会因目录非空失败，退化为逐项删除
    (function walk(d) {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const q = d + "/" + e.name;
        if (e.isDirectory()) walk(q);
        else {
          try {
            fs.unlinkSync(q);
          } catch {}
        }
      }
      try {
        fs.rmdirSync(d);
      } catch {}
    })(p);
  }
  console.log(`wiped: ${p}${fs.existsSync(p) ? " (残留)" : ""}`);
}
