/** @type {import('next').NextConfig} */
const nextConfig = {
  // 纯静态导出：构建产物可直接托管，也方便随时预览
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  eslint: { ignoreDuringBuilds: true },
  // 默认 .next；旧目录被锁或不想删时，用 NEXT_DIST_DIR=.next2 换个干净目录构建
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // 本机并发写 .next 时会出现 "刚写就被判定不存在" 的竞态
  // （Collecting build traces / pages-manifest.json 等 ENOENT），
  // 降并发、少开 worker 后稳定。构建慢一点但不会半途失败。
  experimental: {
    cpus: 1,
    staticGenerationMaxConcurrency: 1,
    staticGenerationMinPagesPerWorker: 1000,
  },
};

export default nextConfig;
