import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { randomUUID } from "node:crypto";
import Redis from "ioredis";
import {
    createWidgetGenerationCoordinator,
    widgetGenerationNamespace,
    WIDGET_GENERATION_LEASE_MS,
} from "./widget-generation-coordinator";

test("database namespaces isolate slots and survive credential rotation", () => {
    expect(
        widgetGenerationNamespace("mongodb://a:secret@host/prod?ssl=true"),
    ).toBe(
        widgetGenerationNamespace("mongodb://b:rotated@host/prod?ssl=false"),
    );
    expect(widgetGenerationNamespace("mongodb://a:secret@host/prod")).not.toBe(
        widgetGenerationNamespace("mongodb://a:secret@host/blue"),
    );
});

const withRedis =
    spawnSync("redis-server", ["--version"]).status === 0
        ? describe
        : describe.skip;
withRedis("atomic widget coordination with an isolated Redis server", () => {
    let child, redis, coordinator, now;
    beforeAll(async () => {
        const server = createServer();
        await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
        const port = server.address().port;
        await new Promise((resolve) => server.close(resolve));
        child = spawn(
            "redis-server",
            [
                "--port",
                String(port),
                "--bind",
                "127.0.0.1",
                "--save",
                "",
                "--appendonly",
                "no",
            ],
            { stdio: "ignore" },
        );
        redis = new Redis(port, "127.0.0.1", { retryStrategy: () => 30 });
        redis.on("error", () => {});
        await redis.ping();
    });
    afterAll(async () => {
        if (redis) await redis.quit();
        if (child) {
            const exited = new Promise((resolve) =>
                child.once("exit", resolve),
            );
            child.kill();
            await exited;
        }
    });
    beforeEach(() => {
        now = Date.now();
        coordinator = createWidgetGenerationCoordinator(redis, {
            namespace: randomUUID(),
            now: () => now,
        });
    });

    test("at most two different applets can claim slots across simultaneous requests", async () => {
        const results = await Promise.all(
            Array.from({ length: 12 }, (_, i) =>
                coordinator.claim(String(i), "v1"),
            ),
        );
        expect(results.filter((r) => r.status === "claimed")).toHaveLength(2);
        expect(results.filter((r) => r.status === "queued")).toHaveLength(10);
    });
    test("simultaneous requests for one applet share one generation", async () => {
        const results = await Promise.all(
            Array.from({ length: 12 }, () => coordinator.claim("same", "v1")),
        );
        expect(results.filter((r) => r.status === "claimed")).toHaveLength(1);
        expect(results.filter((r) => r.status === "running")).toHaveLength(11);
    });
    test("retains completed HTML for another process to retry saving", async () => {
        const claim = await coordinator.claim("same", "v1");
        await coordinator.finish(
            "same",
            claim.token,
            "ready",
            "<html>saved result</html>",
        );
        expect(await coordinator.claim("same", "v1", true)).toMatchObject({
            status: "ready",
            html: "<html>saved result</html>",
        });
    });
    test("a lost process requires explicit retry after its lease expires", async () => {
        const old = await coordinator.claim("same", "v1");
        now += WIDGET_GENERATION_LEASE_MS + 1;
        expect(await coordinator.claim("same", "v1")).toEqual({
            status: "failed",
            code: "WIDGET_INTERRUPTED",
        });
        expect((await coordinator.claim("same", "v1", true)).status).toBe(
            "claimed",
        );
        await expect(
            coordinator.finish("same", old.token, "ready", "stale"),
        ).rejects.toThrow("ownership lost");
    });
    test("a queued explicit retry is remembered without repeated retry flags", async () => {
        const failed = await coordinator.claim("failed", "v1");
        await coordinator.finish(
            "failed",
            failed.token,
            "failed",
            "WIDGET_GENERATION_FAILED",
        );
        const a = await coordinator.claim("a", "v1");
        await coordinator.claim("b", "v1");
        expect((await coordinator.claim("failed", "v1")).status).toBe("failed");
        expect((await coordinator.claim("failed", "v1", true)).status).toBe(
            "queued",
        );
        await coordinator.finish("a", a.token, "ready", "html");
        expect((await coordinator.claim("failed", "v1")).status).toBe(
            "claimed",
        );
    });
});
