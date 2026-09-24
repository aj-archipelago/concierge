/**
 * @jest-environment node
 */

import {
    assertRealtimeAudioSessionsAllowed,
    clearRealtimeAudioSessionBucketsForTests,
} from "../realtime-audio-rate-limit";

describe("realtime audio distributed rate limit", () => {
    afterEach(() => clearRealtimeAudioSessionBucketsForTests());

    it("claims all limiter keys atomically in Redis", async () => {
        const redisClient = { eval: jest.fn().mockResolvedValue([1, 0]) };

        await expect(
            assertRealtimeAudioSessionsAllowed({
                keys: ["ip:192.0.2.1", "user:user-1"],
                now: 1000,
                redisClient,
            }),
        ).resolves.toBeUndefined();

        expect(redisClient.eval).toHaveBeenCalledTimes(1);
        expect(redisClient.eval.mock.calls[0][1]).toBe(2);
    });

    it("returns the shared-store retry interval", async () => {
        const redisClient = { eval: jest.fn().mockResolvedValue([0, 4500]) };

        await expect(
            assertRealtimeAudioSessionsAllowed({
                keys: ["user:user-1"],
                now: 1000,
                redisClient,
            }),
        ).rejects.toMatchObject({
            status: 429,
            code: "REALTIME_AUDIO_RATE_LIMITED",
            retryAfter: 5,
        });
    });

    it("fails closed when the shared store times out", async () => {
        process.env.REALTIME_AUDIO_RATE_LIMIT_TIMEOUT_MS = "10";
        const redisClient = {
            disconnect: jest.fn(),
            eval: jest.fn(() => new Promise(() => {})),
        };

        try {
            await expect(
                assertRealtimeAudioSessionsAllowed({
                    keys: ["user:user-1"],
                    now: 1000,
                    redisClient,
                }),
            ).rejects.toMatchObject({
                status: 503,
                code: "REALTIME_AUDIO_RATE_LIMIT_UNAVAILABLE",
            });
            expect(redisClient.disconnect).toHaveBeenCalledWith(false);
        } finally {
            delete process.env.REALTIME_AUDIO_RATE_LIMIT_TIMEOUT_MS;
        }
    });
});
