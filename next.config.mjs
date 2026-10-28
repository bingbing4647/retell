/** @type {import('next').NextConfig} */
const nextConfig = {
  // 纯静态导出：构建产物可直接托管，也方便随时预览
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
