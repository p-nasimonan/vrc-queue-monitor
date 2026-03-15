/**
 * バックエンド API へのリバースプロキシ（クライアントサイドリクエスト用）
 *
 * next.config.ts の rewrites() はビルド時評価のため k8s 実行時に env を読めない。
 * Route Handler はリクエストごとに実行されるため BACKEND_API_URL を確実に参照できる。
 *
 * セキュリティ: GET のみ許可。バックエンドは読み取り専用 API のため。
 */

import { NextRequest, NextResponse } from "next/server";

/** 許可するパスのプレフィックス（バックエンドの既知エンドポイントのみ） */
const ALLOWED_PATHS = ["instances", "event-groups", "metrics", "config"];

const getBackendUrl = () =>
  process.env.BACKEND_API_URL || "http://localhost:8000";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;

  if (!ALLOWED_PATHS.includes(path[0])) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const url = new URL(request.url);
  const backendUrl = `${getBackendUrl()}/api/${path.join("/")}${url.search}`;

  try {
    const reqHeaders = new Headers();
    // 必要なヘッダーのみ転送（ホストヘッダー等は除外）
    const accept = request.headers.get("accept");
    if (accept) reqHeaders.set("accept", accept);

    const response = await fetch(backendUrl, {
      method: "GET",
      headers: reqHeaders,
    });

    const resHeaders = new Headers(response.headers);
    resHeaders.delete("transfer-encoding");

    return new NextResponse(response.body, {
      status: response.status,
      headers: resHeaders,
    });
  } catch (error) {
    console.error(`Failed to proxy GET ${backendUrl}:`, error);
    return NextResponse.json({ error: "Backend connection failed" }, { status: 502 });
  }
}
