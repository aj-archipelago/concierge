/**
 * @jest-environment node
 */

import {
    formatDbErrorForLog,
    getCosmosRetryAfterMs,
    isCosmosRateLimitError,
    withCosmosRetry,
} from "../db-retry.mjs";

describe("db-retry cosmos helpers", () => {
    test("detects Cosmos rate-limit errors", () => {
        const error = new Error(
            "Error=16500, RetryAfterMs=4326, Details='TooManyRequests (429)'",
        );
        error.code = 16500;

        expect(isCosmosRateLimitError(error)).toBe(true);
        expect(getCosmosRetryAfterMs(error)).toBe(4326);
        expect(formatDbErrorForLog(error)).toContain("Cosmos rate limited");
    });

    test("retries Cosmos throttle then succeeds", async () => {
        const throttle = new Error("Error=16500, RetryAfterMs=10");
        throttle.code = 16500;
        const operation = jest
            .fn()
            .mockRejectedValueOnce(throttle)
            .mockResolvedValue("ok");
        const sleepFn = jest.fn().mockResolvedValue();
        const onRetry = jest.fn();

        await expect(
            withCosmosRetry(operation, {
                label: "test op",
                attempts: 3,
                sleepFn,
                onRetry,
            }),
        ).resolves.toBe("ok");

        expect(operation).toHaveBeenCalledTimes(2);
        expect(sleepFn).toHaveBeenCalledTimes(1);
        expect(onRetry).toHaveBeenCalledWith(
            expect.objectContaining({
                attempt: 1,
                attempts: 3,
                delayMs: expect.any(Number),
            }),
        );
    });

    test("does not retry non-throttle failures", async () => {
        const error = new Error("boom");
        const operation = jest.fn().mockRejectedValue(error);
        const sleepFn = jest.fn();

        await expect(
            withCosmosRetry(operation, {
                label: "test op",
                attempts: 3,
                sleepFn,
            }),
        ).rejects.toThrow("boom");

        expect(operation).toHaveBeenCalledTimes(1);
        expect(sleepFn).not.toHaveBeenCalled();
    });

    test("exhausts retries for persistent Cosmos throttle", async () => {
        const throttle = new Error("TooManyRequests RetryAfterMs=5");
        throttle.code = 16500;
        const operation = jest.fn().mockRejectedValue(throttle);
        const sleepFn = jest.fn().mockResolvedValue();

        await expect(
            withCosmosRetry(operation, {
                label: "test op",
                attempts: 2,
                sleepFn,
                onRetry: () => {},
            }),
        ).rejects.toThrow("TooManyRequests");

        expect(operation).toHaveBeenCalledTimes(2);
        expect(sleepFn).toHaveBeenCalledTimes(1);
    });
});
