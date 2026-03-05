import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "api.vrchat.cloud",
        pathname: "/api/1/**",
      },
    ],
  },
  // /api/* のプロキシは src/app/api/[...path]/route.ts で実行時に処理
  // （rewrites() はビルド時評価のため k8s では使えない）
};

export default nextConfig;
