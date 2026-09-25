/**
 * @jest-environment node
 */

import { NextResponse } from "next/server";
import {
    APPLET_SDK_STRIKE_LIMIT,
    clearAppletSdkGuardStateForTests,
    withAppletSdkGuard,
} from "../applet/sdk-guard";

jest.mock("../models/applet", () => ({
    __esModule: true,
    default: {
        findById: jest.fn(() => ({
            select: jest.fn().mockReturnValue({
                lean: jest.fn().mockResolvedValue(null),
            }),
        })),
        updateOne: jest.fn(),
    },
}));

const Applet = require("../models/applet").default;

function mockSuspension(applet) {
    Applet.findById.mockReturnValue({
        select: jest.fn().mockReturnValue({
            lean: jest.fn().mockResolvedValue(applet),
        }),
    });
}

describe("applet SDK guard", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        clearAppletSdkGuardStateForTests();
        mockSuspension(null);
    });

    test("blocks all SDK access while an applet suspension is active", async () => {
        const suspendedUntil = new Date(Date.now() + 60_000);
        mockSuspension({
            sdkSuspendedUntil: suspendedUntil,
            sdkSuspendedReason: "Auto-suspended after repeated SDK limits.",
        });
        const run = jest.fn(async () => NextResponse.json({ ok: true }));

        const response = await withAppletSdkGuard({
            appletId: "applet-1",
            userId: "user-1",
            api: "agent.chat",
            limits: { concurrent: 3, maxPerWindow: 10, windowMs: 60_000 },
            run,
        });
        const body = await response.json();

        expect(response.status).toBe(403);
        expect(body.code).toBe("APPLET_SDK_SUSPENDED");
        expect(body.error).toContain(suspendedUntil.toISOString());
        expect(body.error).toContain("UpdateAppletMetadata");
        expect(run).not.toHaveBeenCalled();
    });

    test("clears an expired suspension before running the SDK request", async () => {
        mockSuspension({
            sdkSuspendedUntil: new Date(Date.now() - 60_000),
            sdkSuspendedReason: "Expired suspension",
        });

        const response = await withAppletSdkGuard({
            appletId: "applet-1",
            userId: "user-1",
            api: "models.generate",
            limits: { concurrent: 3, maxPerWindow: 10, windowMs: 60_000 },
            run: async () => NextResponse.json({ ok: true }),
        });
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body).toEqual({ ok: true });
        expect(Applet.updateOne).toHaveBeenCalledWith(
            { _id: "applet-1" },
            {
                $unset: {
                    sdkSuspendedAt: "",
                    sdkSuspendedUntil: "",
                    sdkSuspendedReason: "",
                },
            },
        );
    });

    test("temporarily suspends an applet after repeated SDK limit violations", async () => {
        const run = jest.fn(async () => NextResponse.json({ ok: true }));
        const limits = { concurrent: 3, maxPerWindow: 1, windowMs: 60_000 };

        const first = await withAppletSdkGuard({
            appletId: "applet-1",
            userId: "user-1",
            api: "agent.chat",
            limits,
            run,
        });
        expect(first.status).toBe(200);

        let finalResponse = null;
        for (let i = 0; i < APPLET_SDK_STRIKE_LIMIT; i += 1) {
            finalResponse = await withAppletSdkGuard({
                appletId: "applet-1",
                userId: "user-1",
                api: "agent.chat",
                limits,
                run,
            });
        }
        const body = await finalResponse.json();

        expect(run).toHaveBeenCalledTimes(1);
        expect(finalResponse.status).toBe(403);
        expect(body.code).toBe("APPLET_SDK_SUSPENDED");
        expect(body.reason).toContain("agent.chat");
        expect(Applet.updateOne).toHaveBeenCalledWith(
            { _id: "applet-1" },
            {
                $set: expect.objectContaining({
                    sdkSuspendedAt: expect.any(Date),
                    sdkSuspendedUntil: expect.any(Date),
                    sdkSuspendedReason: expect.stringContaining("agent.chat"),
                }),
            },
        );
    });

    test("expires abandoned in-flight leases so later requests can run", async () => {
        jest.useFakeTimers();
        const limits = {
            concurrent: 1,
            maxPerWindow: 10,
            windowMs: 60_000,
            maxHoldMs: 1_000,
        };
        const hungRun = jest.fn(
            async () =>
                new Response(new ReadableStream({ start() {} }), {
                    headers: { "Content-Type": "text/event-stream" },
                }),
        );
        const okRun = jest.fn(async () => NextResponse.json({ ok: true }));

        try {
            const first = await withAppletSdkGuard({
                appletId: "applet-1",
                userId: "user-1",
                api: "sourceQa.query",
                limits,
                run: hungRun,
            });
            const blocked = await withAppletSdkGuard({
                appletId: "applet-1",
                userId: "user-1",
                api: "sourceQa.query",
                limits,
                run: okRun,
            });

            expect(first.status).toBe(200);
            expect(blocked.status).toBe(429);
            expect((await blocked.json()).code).toBe(
                "APPLET_SDK_CONCURRENCY_LIMITED",
            );
            expect(okRun).not.toHaveBeenCalled();

            await jest.advanceTimersByTimeAsync(1_000);

            const afterExpiry = await withAppletSdkGuard({
                appletId: "applet-1",
                userId: "user-1",
                api: "sourceQa.query",
                limits,
                run: okRun,
            });
            const body = await afterExpiry.json();

            expect(afterExpiry.status).toBe(200);
            expect(body).toEqual({ ok: true });
            expect(okRun).toHaveBeenCalledTimes(1);
        } finally {
            jest.useRealTimers();
        }
    });

    test("releases a concurrency slot when the request is aborted", async () => {
        const limits = {
            concurrent: 1,
            maxPerWindow: 10,
            windowMs: 60_000,
            maxHoldMs: 60_000,
        };
        const controller = new AbortController();
        const hungRun = jest.fn(
            async () =>
                new Response(new ReadableStream({ start() {} }), {
                    headers: { "Content-Type": "text/event-stream" },
                }),
        );
        const okRun = jest.fn(async () => NextResponse.json({ ok: true }));

        const first = await withAppletSdkGuard({
            appletId: "applet-1",
            userId: "user-1",
            api: "sourceQa.query",
            limits,
            signal: controller.signal,
            run: hungRun,
        });
        const blocked = await withAppletSdkGuard({
            appletId: "applet-1",
            userId: "user-1",
            api: "sourceQa.query",
            limits,
            run: okRun,
        });

        expect(first.status).toBe(200);
        expect(blocked.status).toBe(429);
        expect(okRun).not.toHaveBeenCalled();

        controller.abort();

        const afterAbort = await withAppletSdkGuard({
            appletId: "applet-1",
            userId: "user-1",
            api: "sourceQa.query",
            limits,
            run: okRun,
        });
        const body = await afterAbort.json();

        expect(afterAbort.status).toBe(200);
        expect(body).toEqual({ ok: true });
        expect(okRun).toHaveBeenCalledTimes(1);
    });

    test("holds concurrency slots until streaming responses close", async () => {
        const encoder = new TextEncoder();
        let closeStream;
        const limits = { concurrent: 1, maxPerWindow: 10, windowMs: 60_000 };
        const run = jest.fn(
            async () =>
                new Response(
                    new ReadableStream({
                        start(controller) {
                            controller.enqueue(encoder.encode("data: one\n\n"));
                            closeStream = () => controller.close();
                        },
                    }),
                    {
                        headers: { "Content-Type": "text/event-stream" },
                    },
                ),
        );

        const first = await withAppletSdkGuard({
            appletId: "applet-1",
            userId: "user-1",
            api: "sourceQa.query",
            limits,
            run,
        });
        const second = await withAppletSdkGuard({
            appletId: "applet-1",
            userId: "user-1",
            api: "sourceQa.query",
            limits,
            run,
        });

        expect(first.status).toBe(200);
        expect(second.status).toBe(429);
        expect((await second.json()).code).toBe(
            "APPLET_SDK_CONCURRENCY_LIMITED",
        );
        expect(run).toHaveBeenCalledTimes(1);

        const readPromise = first.text();
        closeStream();
        await expect(readPromise).resolves.toContain("data: one");

        const third = await withAppletSdkGuard({
            appletId: "applet-1",
            userId: "user-1",
            api: "sourceQa.query",
            limits,
            run,
        });

        expect(third.status).toBe(200);
        closeStream();
        await third.text();
        expect(run).toHaveBeenCalledTimes(2);
    });
});
