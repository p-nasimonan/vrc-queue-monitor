import { spawn } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

console.log("\x1b[32m[dev:mock] frontend をモックAPIモードで起動中...\x1b[0m");

const proc = spawn(
    "pnpm",
    ["--filter", "vrc-queue-monitor-frontend", "dev"],
    {
        cwd: ROOT,
        stdio: "inherit",
        shell: true,
        env: { ...process.env, NEXT_PUBLIC_USE_MOCK_API: "true" },
    }
);

proc.on("exit", (code) => {
    process.exit(code ?? 0);
});

// Ctrl+C / SIGTERM で停止
function shutdown() {
    proc.kill("SIGTERM");
    process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
