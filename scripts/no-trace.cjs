// 构建期 preload：把 Next 的 `.next/trace` 写入变成空写。
//
// 为什么需要：本机打开 `<项目>/.next/trace` 一直返回
//   EPERM: operation not permitted, open '...\.next\trace'
// Next 把它当 uncaughtException 直接中断构建。
// 而 `output: "export"` 会把自定义 distDir 强制改回 `.next`（见 next/dist/build/index.js
// 的 hasCustomExportOutput 分支），所以换目录绕不开。
//
// trace 只是构建耗时/事件日志，不参与产物生成，屏蔽它不影响 out/ 的正确性。

const fs = require("node:fs");
const path = require("node:path");
const { Writable } = require("node:stream");

const isTraceFile = (file) => {
  if (!file || typeof file !== "string") return false;
  const abs = path.resolve(file);
  return path.basename(abs) === "trace" && abs.split(path.sep).includes(".next");
};

const orig = fs.createWriteStream;

fs.createWriteStream = function (file, opts) {
  if (isTraceFile(file)) {
    const sink = new Writable({
      write(_chunk, _enc, cb) {
        cb();
      },
    });
    sink.path = String(file);
    process.nextTick(() => sink.emit("open", 1));
    return sink;
  }
  return orig.apply(this, arguments);
};
