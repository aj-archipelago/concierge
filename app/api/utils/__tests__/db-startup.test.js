/**
 * @jest-environment node
 */
import {
    DEFAULT_CONNECTION_OPTIONS,
    withCosmosStartupRetry,
} from "../../../../src/db.mjs";

describe("database startup helpers", () => {
    let warnSpy;

    beforeEach(() => {
        warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    });

    afterEach(() => {
        warnSpy.mockRestore();
    });

    it("disables automatic collection and index work on runtime connects", () => {
        expect(DEFAULT_CONNECTION_OPTIONS).toMatchObject({
            autoCreate: false,
            autoIndex: false,
            bufferCommands: false,
        });
    });

    it("retries Cosmos rate limits during startup operations", async () => {
        const error = new Error("Error=16500, RetryAfterMs=25");
        error.code = 16500;
        const operation = jest
            .fn()
            .mockRejectedValueOnce(error)
            .mockResolvedValue("connected");
        const sleepFn = jest.fn().mockResolvedValue();

        await expect(
            withCosmosStartupRetry(operation, {
                label: "Test startup operation",
                attempts: 3,
                sleepFn,
            }),
        ).resolves.toBe("connected");

        expect(operation).toHaveBeenCalledTimes(2);
        expect(sleepFn).toHaveBeenCalledTimes(1);
        expect(sleepFn).toHaveBeenCalledWith(expect.any(Number));
        expect(warnSpy).toHaveBeenCalledWith(
            expect.stringContaining("Test startup operation was rate limited"),
        );
    });

    it("does not retry non-Cosmos startup failures", async () => {
        const error = new Error("boom");
        const operation = jest.fn().mockRejectedValue(error);
        const sleepFn = jest.fn();

        await expect(
            withCosmosStartupRetry(operation, {
                label: "Test startup operation",
                attempts: 3,
                sleepFn,
            }),
        ).rejects.toThrow("boom");

        expect(operation).toHaveBeenCalledTimes(1);
        expect(sleepFn).not.toHaveBeenCalled();
        expect(warnSpy).not.toHaveBeenCalled();
    });

    it("stops retrying after the configured startup attempts", async () => {
        const error = new Error("TooManyRequests RetryAfterMs=25");
        const operation = jest.fn().mockRejectedValue(error);
        const sleepFn = jest.fn().mockResolvedValue();

        await expect(
            withCosmosStartupRetry(operation, {
                label: "Test startup operation",
                attempts: 2,
                sleepFn,
            }),
        ).rejects.toThrow("TooManyRequests");

        expect(operation).toHaveBeenCalledTimes(2);
        expect(sleepFn).toHaveBeenCalledTimes(1);
    });
});
