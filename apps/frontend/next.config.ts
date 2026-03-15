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
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          // クリックジャッキング防止
          { key: "X-Frame-Options", value: "DENY" },
          // MIMEスニッフィング防止
          { key: "X-Content-Type-Options", value: "nosniff" },
          // リファラ情報を最小化
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // 権限ポリシー（不要なブラウザ機能を無効化）
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
