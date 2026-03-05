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
  // バックエンド API へのリクエストをサーバーサイドでプロキシ
  // BACKEND_API_URL はビルド後の実行時に参照されるサーバーサイド環境変数
  async rewrites() {
    const backendUrl = process.env.BACKEND_API_URL || "http://localhost:8000";
    return [
      {
        source: "/api/:path*",
        destination: `${backendUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
