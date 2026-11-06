// 按 lib/parts/<ID>.json 里每格 cell.time 从片源抽 9 张剧照，
// 补齐 public/img/<小写id>/f1..f9.jpg（768×576 / q3，与既有剧照完全一致）。
//
// 用法：
//   node scripts/fix-frames.mjs --dry              只列出缺哪些集，不抽帧
//   node scripts/fix-frames.mjs                    补齐所有缺失集
//   node scripts/fix-frames.mjs S01E01 S04E04      只补指定集
//
// 片源根目录可用环境变量 DORA_SRC 覆盖。
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const SRC_ROOT =
  process.env.DORA_SRC ||
  "F:/002-学习资料/001-育儿教育/03英语/曼琳妈妈/3-朵拉爱冒险8季带英文字幕";
const PARTS = "lib/parts";
const IMG = "public/img";
const MIN_BYTES = 4000; // 比这小的当抽帧失败
const NEED = 9;

const args = process.argv.slice(2);
const dry = args.includes("--dry");
const only = args.filter((a) => !a.startsWith("--")).map((s) => s.toUpperCase());

function seasonDirFor(season) {
  const n = String(season).padStart(2, "0");
  return path.join(SRC_ROOT, `朵拉爱冒险-Season ${n}`);
}

function findVideo(id, season) {
  const dir = seasonDirFor(season);
  if (!fs.existsSync(dir)) return null;
  const want = `${id.toUpperCase()}_`;
  const hit = fs.readdirSync(dir).find((f) => f.toUpperCase().startsWith(want) && /\.mp4$/i.test(f));
  return hit ? path.join(dir, hit) : null;
}

function existingCount(id) {
  const dir = path.join(IMG, id.toLowerCase());
  if (!fs.existsSync(dir)) return 0;
  let n = 0;
  for (let i = 1; i <= NEED; i++) {
    const p = path.join(dir, `f${i}.jpg`);
    if (fs.existsSync(p) && fs.statSync(p).size >= MIN_BYTES) n++;
  }
  return n;
}

// ---- 收集待补集 ----
const parts = fs
  .readdirSync(PARTS)
  .filter((f) => f.endsWith(".json"))
  .map((f) => f.replace(/\.json$/, ""))
  .sort();

const todo = [];
for (const id of parts) {
  if (only.length && !only.includes(id)) continue;
  const n = existingCount(id);
  if (n >= NEED) continue;
  const meta = JSON.parse(fs.readFileSync(path.join(PARTS, `${id}.json`), "utf8"));
  const cells = meta.cells || [];
  const video = findVideo(id, meta.season);
  todo.push({ id, have: n, cells: cells.length, video, title: meta.title });
}

if (!todo.length) {
  console.log("没有缺失的剧照，全部 9 张齐全。");
  process.exit(0);
}

console.log(`需要补帧：${todo.length} 集\n`);
for (const t of todo) {
  const v = t.video ? path.basename(t.video) : "✗ 找不到片源";
  console.log(`  ${t.id}  已有 ${t.have}/9  ${String(t.cells)}格  ${v}`);
}

if (dry) process.exit(0);
console.log("");

// ---- 逐集抽帧 ----
let okEp = 0;
const failed = [];

for (const t of todo) {
  if (!t.video) {
    failed.push(`${t.id}: 找不到片源`);
    continue;
  }
  const outDir = path.join(IMG, t.id.toLowerCase());
  fs.mkdirSync(outDir, { recursive: true });

  const meta = JSON.parse(fs.readFileSync(path.join(PARTS, `${t.id}.json`), "utf8"));
  let ok = 0;
  for (const c of meta.cells || []) {
    const out = path.join(outDir, `f${c.no}.jpg`);
    const r = spawnSync(
      "ffmpeg",
      ["-hide_banner", "-loglevel", "error", "-ss", c.time, "-i", t.video, "-frames:v", "1", "-vf", "scale=768:576", "-q:v", "3", "-y", out],
      { encoding: "utf8" }
    );
    const good = r.status === 0 && fs.existsSync(out) && fs.statSync(out).size >= MIN_BYTES;
    if (good) ok++;
    else failed.push(`${t.id} f${c.no} @${c.time}: ${(r.stderr || "").trim().slice(0, 120) || "输出为空"}`);
  }
  console.log(`  ${t.id}  ${ok >= NEED ? "✓" : "△"} ${ok}/9  ${meta.title || ""}`);
  if (ok >= NEED) okEp++;
  else failed.push(`${t.id}: 仅 ${ok}/9 成功`);
}

console.log(`\n完成：${okEp}/${todo.length} 集补齐`);
if (failed.length) {
  console.log(`\n问题项 ${failed.length} 条：`);
  for (const f of failed.slice(0, 30)) console.log("  " + f);
}
process.exit(failed.length ? 1 : 0);
