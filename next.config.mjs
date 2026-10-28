/** @type {import('next').NextConfig} */
const nextConfig = {
  // 纯静态导出：构建产物可直接托管，也方便随时预览
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  eslint: { ignoreDuringBuilds: true },
  // 默认 .next；旧目录被锁或不想删时，用 NEXT_DIST_DIR=.next2 换个干净目录构建
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
