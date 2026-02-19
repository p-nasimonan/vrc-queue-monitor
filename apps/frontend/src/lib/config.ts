// 環境変数から設定を取得

export const config = {
  // サイト設定
  siteName: process.env.NEXT_PUBLIC_SITE_NAME || "VRC Queue Monitor",

  // API設定
  apiUrl: process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000",
  useMockApi: process.env.NEXT_PUBLIC_USE_MOCK_API === "true",

  // 自動更新間隔（ミリ秒）
  refreshInterval: parseInt(process.env.NEXT_PUBLIC_REFRESH_INTERVAL || "60000"),

  // 表示するイベント日数
  displayDays: parseInt(process.env.NEXT_PUBLIC_DISPLAY_DAYS || "30"),

  // デフォルトテーマ
  defaultTheme: (process.env.NEXT_PUBLIC_DEFAULT_THEME || "light") as "light" | "dark",
};
