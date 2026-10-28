/**
 * 把每一集的 A4 页面打印成独立 PDF，输出到 public/pdf/<ID>.pdf
 *
 * 用法：
 *   node scripts/make-pdfs.js                 # 全部重做
 *   node scripts/make-pdfs.js S03E01 S03E05   # 只做指定的几集
 *   BASE=http://127.0.0.1:3111 node ...        # 指定站点地址（默认 3111）
 *   ONLY_MISSING=1 node ...                    # 跳过已存在的
 *
 * 前置：站点必须已经 build 并起了一个静态服务（读的是导出的 out/，不是 dev 模式）。
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const OUT_DIR = path.join(ROOT, "public", "pdf");
const BASE = process.env.BASE || "http://127.0.0.1:3111";

function loadIds() {
  const data = JSON.parse(fs.readFileSync(path.join(ROOT, "lib", "lessons.json"), "utf8"));
  return Object.keys(data).sort((a, b) => {
    const na = Number(a.slice(1, 3)) * 1000 + Number(a.slice(4));
    const nb = Number(b.slice(1, 3)) * 1000 + Number(b.slice(4));
    return na - nb;
  });
}

(async () => {
  const { chromium } = require("playwright");
  const exe =
    process.env.CHROME_PATH ||
    path.join(process.env.LOCALAPPDATA, "ms-playwright", "chromium-1148", "chrome-win", "chrome.exe");

  let ids = process.argv.slice(2).filter((a) => /^S\d{2}E\d{2}$/.test(a));
  if (!ids.length) ids = loadIds();
  if (process.env.ONLY_MISSING === "1") {
    ids = ids.filter((id) => !fs.existsSync(path.join(OUT_DIR, id + ".pdf")));
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const browser = await chromium.launch({ executablePath: exe });
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 1400 } });
  const page = await ctx.newPage();

  let done = 0;
  const t0 = Date.now();
  for (const id of ids) {
    await page.goto(`${BASE}/lesson/${id}/`, { waitUntil: "networkidle", timeout: 60000 });
    // 等 9 张剧照真正解码完成，否则 PDF 里会出现空白格
    await page.waitForFunction(() => {
      const imgs = [...document.images].filter((i) => (i.currentSrc || i.src).includes("/img/"));
      return imgs.length >= 9 && imgs.every((i) => i.complete && i.naturalWidth > 0);
    }, { timeout: 30000 });
    await page.evaluate(() => document.fonts && document.fonts.ready);
    await page.emulateMedia({ media: "print" });
    await page.pdf({
      path: path.join(OUT_DIR, id + ".pdf"),
      format: "A4",
      printBackground: true,
      margin: { top: 0, bottom: 0, left: 0, right: 0 },
    });
    await page.emulateMedia({ media: "screen" });
    done++;
    if (done % 5 === 0 || done === ids.length) {
      process.stdout.write(`  ${done}/${ids.length} (${Math.round((Date.now() - t0) / 1000)}s)\n`);
    }
  }

  await browser.close();

  let bytes = 0;
  for (const id of ids) {
    const p = path.join(OUT_DIR, id + ".pdf");
    if (fs.existsSync(p)) bytes += fs.statSync(p).size;
  }
  console.log(`\n完成 ${done} 个 PDF，共 ${(bytes / 1048576).toFixed(1)} MB → ${OUT_DIR}`);
})();
