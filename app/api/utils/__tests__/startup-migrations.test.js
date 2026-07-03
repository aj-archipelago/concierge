/**
 * @jest-environment node
 */
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import SystemMigration, {
    SYSTEM_MIGRATION_STATUS,
} from "../../models/system-migration.mjs";
import { runStartupMigrations } from "../startup-migrations.mjs";

let mongoServer;
let originalConsole;

beforeAll(async () => {
    originalConsole = {
        log: console.log,
        warn: console.warn,
        error: console.error,
    };
    console.log = jest.fn();
    console.warn = jest.fn();
    console.error = jest.fn();

    mongoServer = await MongoMemoryServer.create({
        instance: {
            ip: "127.0.0.1",
        },
    });
    await mongoose.connect(mongoServer.getUri());
});

afterAll(async () => {
    console.log = originalConsole.log;
    console.warn = originalConsole.warn;
    console.error = originalConsole.error;

    if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
    }
    if (mongoServer) {
        await mongoServer.stop();
    }
});

beforeEach(async () => {
    await SystemMigration.deleteMany({});
});

describe("runStartupMigrations", () => {
    it("runs a migration once and records completion", async () => {
        const run = jest.fn().mockResolvedValue({ changed: 1 });

        const firstResults = await runStartupMigrations(
            [{ id: "test_once", name: "Test once", run }],
            { ownerId: "owner-a" },
        );

        expect(firstResults[0]).toMatchObject({
            id: "test_once",
            status: "complete",
            ownerId: "owner-a",
            result: { changed: 1 },
        });

        const completed = await SystemMigration.findOne({
            _id: "test_once",
        }).lean();
        expect(completed.status).toBe(SYSTEM_MIGRATION_STATUS.COMPLETE);
        expect(completed.ownerId).toBeNull();
        expect(completed.attempts).toBe(1);
        expect(completed.result).toEqual({ changed: 1 });

        const secondResults = await runStartupMigrations(
            [{ id: "test_once", name: "Test once", run }],
            { ownerId: "owner-b" },
        );

        expect(secondResults[0]).toMatchObject({
            id: "test_once",
            status: "skipped",
            reason: "complete",
        });
        expect(run).toHaveBeenCalledTimes(1);
    });

    it("skips non-critical work while another owner has an active lease", async () => {
        await SystemMigration.create({
            _id: "test_locked",
            status: SYSTEM_MIGRATION_STATUS.RUNNING,
            ownerId: "owner-a",
            leaseExpiresAt: new Date(Date.now() + 60_000),
            attempts: 1,
        });
        const run = jest.fn();

        const results = await runStartupMigrations(
            [{ id: "test_locked", name: "Test locked", run }],
            { ownerId: "owner-b" },
        );

        expect(results[0]).toMatchObject({
            id: "test_locked",
            status: "skipped",
            reason: "locked",
            ownerId: "owner-a",
        });
        expect(run).not.toHaveBeenCalled();
    });

    it("reclaims an expired lease and completes the migration", async () => {
        await SystemMigration.create({
            _id: "test_expired",
            status: SYSTEM_MIGRATION_STATUS.RUNNING,
            ownerId: "owner-a",
            leaseExpiresAt: new Date(Date.now() - 60_000),
            attempts: 1,
        });
        const run = jest.fn().mockResolvedValue({ repaired: true });

        const results = await runStartupMigrations(
            [{ id: "test_expired", name: "Test expired", run }],
            { ownerId: "owner-b" },
        );

        expect(results[0]).toMatchObject({
            id: "test_expired",
            status: "complete",
            ownerId: "owner-b",
        });

        const completed = await SystemMigration.findOne({
            _id: "test_expired",
        }).lean();
        expect(completed.status).toBe(SYSTEM_MIGRATION_STATUS.COMPLETE);
        expect(completed.attempts).toBe(2);
        expect(completed.result).toEqual({ repaired: true });
    });

    it("does not let a stale lease owner complete another owner's run", async () => {
        const run = jest.fn(async () => {
            await SystemMigration.findByIdAndUpdate("test_stale_complete", {
                $set: {
                    status: SYSTEM_MIGRATION_STATUS.RUNNING,
                    ownerId: "owner-b",
                    leaseExpiresAt: new Date(Date.now() + 60_000),
                },
                $inc: { attempts: 1 },
            });
            return { stale: true };
        });

        const results = await runStartupMigrations(
            [{ id: "test_stale_complete", name: "Test stale complete", run }],
            { ownerId: "owner-a" },
        );

        expect(results[0]).toMatchObject({
            id: "test_stale_complete",
            status: "skipped",
            reason: "lease_lost",
            ownerId: "owner-a",
            result: { stale: true },
        });

        const running = await SystemMigration.findOne({
            _id: "test_stale_complete",
        }).lean();
        expect(running.status).toBe(SYSTEM_MIGRATION_STATUS.RUNNING);
        expect(running.ownerId).toBe("owner-b");
        expect(running.result).toBeUndefined();
    });

    it("records non-critical failures without throwing", async () => {
        const error = new Error("migration exploded");
        const run = jest.fn().mockRejectedValue(error);

        const results = await runStartupMigrations(
            [{ id: "test_failed", name: "Test failed", run }],
            { ownerId: "owner-a" },
        );

        expect(results[0]).toMatchObject({
            id: "test_failed",
            status: "failed",
            ownerId: "owner-a",
            error,
        });

        const failed = await SystemMigration.findOne({
            _id: "test_failed",
        }).lean();
        expect(failed.status).toBe(SYSTEM_MIGRATION_STATUS.FAILED);
        expect(failed.error).toMatchObject({
            name: "Error",
            message: "migration exploded",
        });
        expect(failed.leaseExpiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    it("does not let a stale lease owner fail a completed run", async () => {
        const error = new Error("stale failure");
        const run = jest.fn(async () => {
            await SystemMigration.findByIdAndUpdate("test_stale_fail", {
                $set: {
                    status: SYSTEM_MIGRATION_STATUS.COMPLETE,
                    ownerId: null,
                    leaseExpiresAt: null,
                    completedAt: new Date(),
                    result: { winner: "owner-b" },
                },
            });
            throw error;
        });

        const results = await runStartupMigrations(
            [{ id: "test_stale_fail", name: "Test stale fail", run }],
            { ownerId: "owner-a" },
        );

        expect(results[0]).toMatchObject({
            id: "test_stale_fail",
            status: "skipped",
            reason: "lease_lost",
            ownerId: "owner-a",
            error,
        });

        const completed = await SystemMigration.findOne({
            _id: "test_stale_fail",
        }).lean();
        expect(completed.status).toBe(SYSTEM_MIGRATION_STATUS.COMPLETE);
        expect(completed.ownerId).toBeNull();
        expect(completed.result).toEqual({ winner: "owner-b" });
        expect(completed.error).toBeUndefined();
    });

    it("propagates critical migration failures after recording them", async () => {
        const run = jest.fn().mockRejectedValue(new Error("critical failed"));

        await expect(
            runStartupMigrations(
                [
                    {
                        id: "test_critical",
                        name: "Test critical",
                        critical: true,
                        run,
                    },
                ],
                { ownerId: "owner-a" },
            ),
        ).rejects.toThrow("critical failed");

        const failed = await SystemMigration.findOne({
            _id: "test_critical",
        }).lean();
        expect(failed.status).toBe(SYSTEM_MIGRATION_STATUS.FAILED);
        expect(failed.error.message).toBe("critical failed");
    });
});
