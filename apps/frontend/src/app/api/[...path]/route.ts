/**
 * バックエンド API へのリバースプロキシ（クライアントサイドリクエスト用）
 *
 * next.config.ts の rewrites() はビルド時評価のため k8s 実行時に env を読めない。
 * Route Handler はリクエストごとに実行されるため BACKEND_API_URL を確実に参照できる。
 */

import { NextRequest, NextResponse } from "next/server";

const getBackendUrl = () =>
  process.env.BACKEND_API_URL || "http://localhost:8000";

async function handler(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const url = new URL(request.url);
  const backendUrl = `${getBackendUrl()}/api/${path.join("/")}${url.search}`;

  try {
    const reqHeaders = new Headers(request.headers);
    // host ヘッダーを削除（バックエンドが混乱しないよう）
    reqHeaders.delete("host");

    const response = await fetch(backendUrl, {
      method: request.method,
      headers: reqHeaders,
      body:
        request.method !== "GET" && request.method !== "HEAD"
          ? request.body
          : undefined,
    });

    const resHeaders = new Headers(response.headers);
    // transfer-encoding はNode.jsが再設定するため削除
    resHeaders.delete("transfer-encoding");

    return new NextResponse(response.body, {
      status: response.status,
      headers: resHeaders,
    });
  } catch (error) {
    console.error(`Failed to proxy ${request.method} ${backendUrl}:`, error);
    return NextResponse.json({ error: "Backend connection failed" }, { status: 502 });
  }
}

export {
  handler as GET,
  handler as POST,
  handler as PUT,
  handler as DELETE,
  handler as PATCH,
};
