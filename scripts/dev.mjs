#!/usr/bin/env node
/**
 * ローカル開発スクリプト
 *
 * 起動するプロセス:
 *   [db]       docker compose up postgres -d  (自動起動)
 *   [api]      pnpm dev:api  (tsx watch、ホットリロード)
 *   [frontend] pnpm dev      (Next.js、ホットリロード)
 *
 * Ctrl+C で全プロセスを停止する
 */

import { spawn } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const COLORS = {
  cyan:    "\x1b[36m",
  green:   "\x1b[32m",
  yellow:  "\x1b[33m",
  magenta: "\x1b[35m",
  reset:   "\x1b[0m",
};

/** @type {import("node:child_process").ChildProcess[]} */
const procs = [];

/**
 * @param {string} cmd
 * @param {string[]} args
 * @param {{ cwd?: string; label: string; color: keyof typeof COLORS }} opts
 */
function run(cmd, args, { cwd = ROOT, label, color }) {
  const pre = `${COLORS[color] ?? ""}[${label}]${COLORS.reset} `;
  const proc = spawn(cmd, args, { cwd, stdio: ["inherit", "pipe", "pipe"] });

  proc.stdout?.on("data", (d) => {
    for (const line of d.toString().split("\n")) {
      if (line.trim()) process.stdout.write(pre + line + "\n");
    }
  });
  proc.stderr?.on("data", (d) => {
    for (const line of d.toString().split("\n")) {
      if (line.trim()) process.stderr.write(pre + line + "\n");
    }
  });
  proc.on("exit", (code) => {
    if (code !== null && code !== 0)
      console.error(`${pre}終了 (exit: ${code})`);
  });

  procs.push(proc);
  return proc;
}

/** @param {string} cmd @param {string[]} args @param {{ cwd?: string }} opts */
function runSync(cmd, args, { cwd = ROOT } = {}) {
  return new Promise((res) => {
    const proc = spawn(cmd, args, { cwd, stdio: "inherit" });
    proc.on("close", res);
  });
}

function shutdown() {
  console.log("\n\x1b[33m[dev] 停止中...\x1b[0m");
  for (const p of procs) p.kill("SIGTERM");
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// 1. PostgreSQL を起動
console.log("\x1b[36m[dev] PostgreSQL を起動中...\x1b[0m");
await runSync("docker", ["compose", "up", "postgres", "-d"]);

// 2. API (tsx watch — pnpm 経由でクロスプラットフォーム対応)
run("pnpm", ["--filter", "vrc-queue-monitor-backend", "dev:api"], {
  label: "api",
  color: "cyan",
});

// 3. Frontend (Next.js dev)
run("pnpm", ["--filter", "vrc-queue-monitor-frontend", "dev"], {
  label: "frontend",
  color: "green",
});

console.log(`\x1b[36m[dev] 起動完了\x1b[0m`);
console.log(`  API      → http://localhost:${process.env.API_PORT ?? 8000}`);
console.log(`  Frontend → http://localhost:3000`);
