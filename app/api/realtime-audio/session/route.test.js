/**
 * @jest-environment node
 */

/* eslint-disable import/first */

jest.mock("../../utils/auth", () => ({
    getCurrentUser: jest.fn(),
}));

jest.mock("../../utils/realtime-audio", () => ({
    createRealtimeAudioSession: jest.fn(),
    getRealtimeAudioPublicConfig: jest.fn(() => ({
        enabled: true,
        capabilities: { transcribe: true, translate: true },
    })),
    RealtimeAudioError: class RealtimeAudioError extends Error {
        constructor(message, { status = 500, code = "TEST_ERROR" } = {}) {
            super(message);
            this.status = status;
            this.code = code;
        }
    },
}));

import { getCurrentUser } from "../../utils/auth";
import {
    createRealtimeAudioSession,
    getRealtimeAudioPublicConfig,
    RealtimeAudioError,
} from "../../utils/realtime-audio";
import { clearRealtimeAudioSessionBucketsForTests } from "../../utils/realtime-audio-rate-limit";
import { GET, POST } from "./route";

function makeRequest(body, headers = {}) {
    return {
        headers: {
            get: jest.fn((name) => headers[name.toLowerCase()] || null),
        },
        json: jest.fn().mockResolvedValue(body),
    };
}

describe("/api/realtime-audio/session", () => {
    const originalLimit = process.env.REALTIME_AUDIO_SESSION_LIMIT;

    beforeEach(() => {
        jest.clearAllMocks();
        delete process.env.REALTIME_AUDIO_SESSION_LIMIT;
        clearRealtimeAudioSessionBucketsForTests();
        getCurrentUser.mockResolvedValue({ _id: "user-1" });
        createRealtimeAudioSession.mockResolvedValue({
            value: "ephemeral-secret",
            callsUrl: "https://aoai.test/openai/v1/realtime/calls",
            mode: "transcribe",
        });
    });

    afterEach(() => {
        if (originalLimit === undefined) {
            delete process.env.REALTIME_AUDIO_SESSION_LIMIT;
        } else {
            process.env.REALTIME_AUDIO_SESSION_LIMIT = originalLimit;
        }
        clearRealtimeAudioSessionBucketsForTests();
    });

    it("returns public availability from GET", async () => {
        const response = await GET();

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual({
            enabled: true,
            capabilities: { transcribe: true, translate: true },
        });
        expect(getRealtimeAudioPublicConfig).toHaveBeenCalled();
    });

    it("creates a client secret for the current user", async () => {
        const response = await POST(
            makeRequest({
                mode: "transcribe",
                sourceLanguage: "en",
                delay: "low",
            }),
        );

        expect(response.status).toBe(200);
        expect(createRealtimeAudioSession).toHaveBeenCalledWith({
            mode: "transcribe",
            sourceLanguage: "en",
            targetLanguage: undefined,
            delay: "low",
            userId: "user-1",
        });
        await expect(response.json()).resolves.toEqual({
            value: "ephemeral-secret",
            callsUrl: "https://aoai.test/openai/v1/realtime/calls",
            mode: "transcribe",
        });
    });

    it("maps realtime configuration errors to their status code", async () => {
        createRealtimeAudioSession.mockRejectedValue(
            new RealtimeAudioError("not configured", {
                status: 503,
                code: "REALTIME_NOT_CONFIGURED",
            }),
        );

        const response = await POST(makeRequest({ mode: "translate" }));

        expect(response.status).toBe(503);
        await expect(response.json()).resolves.toEqual({
            error: "not configured",
            code: "REALTIME_NOT_CONFIGURED",
        });
    });

    it("rate limits repeated client secret requests for the same user", async () => {
        process.env.REALTIME_AUDIO_SESSION_LIMIT = "1";

        const first = await POST(makeRequest({ mode: "transcribe" }));
        const second = await POST(makeRequest({ mode: "transcribe" }));

        expect(first.status).toBe(200);
        expect(second.status).toBe(429);
        await expect(second.json()).resolves.toEqual(
            expect.objectContaining({
                code: "REALTIME_AUDIO_RATE_LIMITED",
            }),
        );
        expect(createRealtimeAudioSession).toHaveBeenCalledTimes(1);
    });

    it("does not share authenticated session quota across a NAT IP", async () => {
        process.env.REALTIME_AUDIO_SESSION_LIMIT = "1";

        getCurrentUser
            .mockResolvedValueOnce({ _id: "user-1" })
            .mockResolvedValueOnce({ _id: "user-2" });

        const first = await POST(
            makeRequest(
                { mode: "transcribe" },
                { "x-forwarded-for": "192.0.2.1" },
            ),
        );
        const second = await POST(
            makeRequest(
                { mode: "transcribe" },
                { "x-forwarded-for": "192.0.2.1" },
            ),
        );

        expect(first.status).toBe(200);
        expect(second.status).toBe(200);
        expect(createRealtimeAudioSession).toHaveBeenCalledTimes(2);
    });
});
