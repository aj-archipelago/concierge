#!/usr/bin/env node

/**
 * next dev wrapper that falls back to the next free port when the preferred
 * port is already in use (matching the server's listener fallback).
 *
 * Extra CLI args are forwarded to `next` (e.g. --turbopack, --webpack).
 */

import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { findFreePort } from "./lib/free-port.mjs";

const __filename = fileURLToPath(import.meta.url);
const ROOT_DIR = path.resolve(path.dirname(__filename), "..");
const require = createRequire(import.meta.url);

// Probe the same interface Next will bind. IPv4 and IPv6 listeners can share
// a port locally; probing only IPv4 can skip an available IPv6 port.
const { values } = parseArgs({
    options: {
        hostname: { type: "string", short: "H" },
        port: { type: "string", short: "p" },
    },
    strict: false,
    allowPositionals: true,
});
const preferredPort = Number(values.port ?? process.env.PORT ?? 3000);
const port = await findFreePort(preferredPort, {
    host: values.hostname || "0.0.0.0",
});

if (port !== preferredPort) {
    console.warn(`Port ${preferredPort} is in use; bound to ${port} instead`);
} else {
    console.log(`Concierge next dev using port ${port}`);
}

const nextBin = require.resolve("next/dist/bin/next", { paths: [ROOT_DIR] });
// Put the selected port last so an explicit -p cannot override the fallback.
const nextArgs = ["dev", ...process.argv.slice(2), "-p", String(port)];

const child = spawn(process.execPath, [nextBin, ...nextArgs], {
    cwd: ROOT_DIR,
    env: {
        ...process.env,
        PORT: String(port),
    },
    stdio: "inherit",
});

const shutdown = (signal) => {
    if (!child.killed) {
        child.kill(signal);
    }
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

child.on("exit", (code, signal) => {
    if (signal) {
        process.kill(process.pid, signal);
        return;
    }
    process.exit(code ?? 1);
});
