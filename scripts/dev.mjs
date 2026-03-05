#!/usr/bin/env node
/**
 * ローカル開発用スクリプト
 * - docker compose で postgres と api を起動
 * - pnpm dev でfrontendを起動
 * Ctrl+C で全サービスを停止する
 */

import { spawn } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

/** @type {import("node:child_process").ChildProcess[]} */
const processes = [];

/**
 * @param {string} cmd
 * @param {string[]} args
 * @param {{ cwd?: string; label: string; color: string }} opts
 * @returns {import("node:child_process").ChildProcess}
 */
function run(cmd, args, { cwd = ROOT, label, color }) {
    const colors = {
        cyan: "\x1b[36m",
        green: "\x1b[32m",
        yellow: "\x1b[33m",
        reset: "\x1b[0m",
    };
    const prefix = `${colors[color] ?? ""}[${label}]${colors.reset} `;

    const proc = spawn(cmd, args, { cwd, stdio: ["inherit", "pipe", "pipe"] });

    proc.stdout?.on("data", (data) => {
        for (const line of data.toString().split("\n")) {
            if (line.trim()) process.stdout.write(prefix + line + "\n");
        }
    });
    proc.stderr?.on("data", (data) => {
        for (const line of data.toString().split("\n")) {
            if (line.trim()) process.stderr.write(prefix + line + "\n");
        }
    });

    proc.on("exit", (code) => {
        if (code !== null && code !== 0) {
            console.error(`${prefix}プロセスが終了しました (exit code: ${code})`);
        }
    });

    processes.push(proc);
    return proc;
}

// Ctrl+C / SIGTERM で全サービスを停止
async function shutdown() {
    console.log("\n\x1b[33m[dev] 全サービスを停止中...\x1b[0m");

    // frontend プロセスを終了
    for (const proc of processes) {
        proc.kill("SIGTERM");
    }

    // docker compose down
    await new Promise((resolve) => {
        const down = spawn(
            "docker",
            ["compose", "stop", "postgres", "api"],
            { cwd: ROOT, stdio: "inherit" }
        );
        down.on("close", resolve);
    });

    process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// 1. docker compose でバックエンドを起動
console.log("\x1b[36m[dev] docker compose で postgres と api を起動中...\x1b[0m");
await new Promise((resolve, reject) => {
    const up = spawn(
        "docker",
        ["compose", "up", "-d", "postgres", "api"],
        { cwd: ROOT, stdio: "inherit" }
    );
    up.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`docker compose up が失敗しました (exit code: ${code})`));
    });
});

// 2. API の起動を少し待つ
console.log("\x1b[36m[dev] API の起動を待機中 (3秒)...\x1b[0m");
await new Promise((resolve) => setTimeout(resolve, 3000));

// 3. API ログをストリーム表示
run("docker", ["compose", "logs", "-f", "--no-log-prefix", "api", "collector"], {
    label: "backend",
    color: "cyan",
});

// 4. Next.js frontend を起動
console.log("\x1b[32m[dev] frontend を起動中...\x1b[0m");
run("pnpm", ["--filter", "vrc-queue-monitor-frontend", "dev"], {
    label: "frontend",
    color: "green",
});
