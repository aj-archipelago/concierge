/**
 * @jest-environment node
 */

import mongoose from "mongoose";
import { Buffer } from "buffer";
import { MongoMemoryServer } from "mongodb-memory-server";
import User from "../models/user.mjs";
import { getCurrentUser } from "./auth";
import { headers, cookies } from "next/headers";
import { getClient } from "../../../src/graphql";

jest.mock("next/headers", () => ({
    headers: jest.fn(),
    cookies: jest.fn(),
}));

jest.mock("../../../config", () => ({
    auth: {
        provider: "entra",
    },
    cortex: {
        defaultChatModel: "test-model",
    },
}));

jest.mock("../../../src/graphql", () => ({
    getClient: jest.fn(),
    SYS_ENTITY_UPSERT_PERSONAL: "SYS_ENTITY_UPSERT_PERSONAL",
}));

function createDeferred() {
    let resolve;
    const promise = new Promise((innerResolve) => {
        resolve = innerResolve;
    });
    return { promise, resolve };
}

async function waitForExpectation(expectation, timeoutMs = 1000) {
    const deadline = Date.now() + timeoutMs;
    let lastError;

    while (Date.now() < deadline) {
        try {
            expectation();
            return;
        } catch (error) {
            lastError = error;
            await new Promise((resolve) => setTimeout(resolve, 10));
        }
    }

    throw lastError || new Error("Timed out waiting for expectation");
}

const encodePrincipal = (claims) =>
    Buffer.from(JSON.stringify({ claims }), "utf8").toString("base64");

describe("getCurrentUser personal entity provisioning", () => {
    let mongoServer;
    let originalWindow;

    beforeAll(async () => {
        process.env.NEXT_RUNTIME = "nodejs";
        process.env.SUPPRESS_JEST_WARNINGS = "1";
        delete process.env.ENTRA_AUTHORIZED_TENANT_IDS;

        mongoServer = await MongoMemoryServer.create({
            instance: {
                ip: "127.0.0.1",
            },
        });
        await mongoose.connect(mongoServer.getUri());
    });

    afterAll(async () => {
        await mongoose.disconnect();
        await mongoServer.stop();
    });

    beforeEach(async () => {
        await User.deleteMany({});
        jest.clearAllMocks();
        originalWindow = global.window;
        global.window = undefined;

        headers.mockReturnValue(
            new Map([
                ["X-MS-CLIENT-PRINCIPAL-ID", "user-1"],
                ["X-MS-CLIENT-PRINCIPAL-NAME", "user-1@example.com"],
            ]),
        );
        cookies.mockReturnValue({
            get: jest.fn().mockReturnValue(undefined),
        });
    });

    afterEach(() => {
        delete process.env.ENTRA_AUTHORIZED_TENANT_IDS;
        global.window = originalWindow;
    });

    test("claims provisioning so concurrent first-run requests only create one personal entity", async () => {
        await User.create({
            userId: "user-1",
            username: "user-1@example.com",
            name: "User One",
            contextId: "context-1",
            contextKey: "context-key-1",
            aiMemorySelfModify: true,
            aiName: "Concierge",
            agentModel: "test-model",
        });

        const deferred = createDeferred();
        const query = jest.fn().mockImplementation(async () => {
            await deferred.promise;
            return {
                data: {
                    sys_entity_upsert_personal: {
                        result: JSON.stringify({ id: "entity-123" }),
                    },
                },
            };
        });

        getClient.mockReturnValue({ query });

        const firstRequest = getCurrentUser(false);

        await waitForExpectation(() => {
            expect(query).toHaveBeenCalledTimes(1);
        });

        expect(query).toHaveBeenCalledWith(
            expect.objectContaining({
                variables: {
                    userId: "context-1",
                    name: "Concierge",
                },
            }),
        );

        const secondRequest = getCurrentUser(false);

        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(query).toHaveBeenCalledTimes(1);

        deferred.resolve();

        const [firstUser, secondUser] = await Promise.all([
            firstRequest,
            secondRequest,
        ]);

        expect(firstUser.personalEntityId).toBe("entity-123");
        expect(secondUser.personalEntityId).toBe("entity-123");

        const storedUser = await User.findOne({ userId: "user-1" }).lean();
        expect(storedUser.personalEntityId).toBe("entity-123");
        expect(storedUser.personalEntityProvisioningAt).toBeUndefined();
    });

    test("concurrent first-login requests create exactly one user record", async () => {
        const query = jest.fn().mockResolvedValue({
            data: {
                sys_entity_upsert_personal: {
                    result: JSON.stringify({ id: "entity-456" }),
                },
            },
        });
        getClient.mockReturnValue({ query });

        headers.mockReturnValue(
            new Map([
                ["X-MS-CLIENT-PRINCIPAL-ID", "new-user-1"],
                ["X-MS-CLIENT-PRINCIPAL-NAME", "new-user-1@example.com"],
            ]),
        );

        // Fire 5 concurrent requests for a user that doesn't exist yet
        const results = await Promise.all(
            Array.from({ length: 5 }, () => getCurrentUser(false)),
        );

        // All should return a valid user
        for (const user of results) {
            expect(user.userId).toBe("new-user-1");
            expect(user.contextId).toBeTruthy();
        }

        // All should share the same contextId (same record)
        const contextIds = new Set(results.map((u) => u.contextId));
        expect(contextIds.size).toBe(1);

        // Exactly one user record in the database
        const userCount = await User.countDocuments({ userId: "new-user-1" });
        expect(userCount).toBe(1);

        expect(query).toHaveBeenCalledWith(
            expect.objectContaining({
                variables: expect.objectContaining({
                    userId: expect.any(String),
                    name: "Concierge",
                }),
            }),
        );
    });

    test("uses tenant id for Entra authorization and preferred_username for username", async () => {
        process.env.ENTRA_AUTHORIZED_TENANT_IDS =
            "11111111-1111-4111-8111-111111111111";

        const userId = "33333333-3333-4333-8333-333333333333";
        const username = "user@example.test";
        const tenantId = "11111111-1111-4111-8111-111111111111";

        headers.mockReturnValue(
            new Map([
                ["X-MS-CLIENT-PRINCIPAL-ID", userId],
                ["X-MS-CLIENT-PRINCIPAL-NAME", userId],
                [
                    "X-MS-CLIENT-PRINCIPAL",
                    encodePrincipal([
                        {
                            typ: "preferred_username",
                            val: username,
                        },
                        {
                            typ: "tid",
                            val: tenantId,
                        },
                    ]),
                ],
            ]),
        );

        const query = jest.fn().mockResolvedValue({
            data: {
                sys_entity_upsert_personal: {
                    result: JSON.stringify({ id: "entity-789" }),
                },
            },
        });
        getClient.mockReturnValue({ query });

        const user = await getCurrentUser(false);

        expect(user.userId).toBe(userId);
        expect(user.username).toBe(username);

        const storedUser = await User.findOne({ userId }).lean();
        expect(storedUser.username).toBe(username);
    });
});
