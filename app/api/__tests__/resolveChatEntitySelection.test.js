/**
 * @jest-environment node
 */

import { resolveChatEntitySelection } from "../chats/_lib/resolveChatEntitySelection";

describe("resolveChatEntitySelection", () => {
    const personalEntityId = "personal-entity-1";
    const systemDefaultEntityId = "system-default-1";
    const customEntityId = "custom-entity-1";

    const entities = [
        {
            id: systemDefaultEntityId,
            name: "Concierge",
            isDefault: true,
        },
        {
            id: personalEntityId,
            name: "Assistant",
            isDefault: false,
        },
        {
            id: customEntityId,
            name: "Researcher",
            isDefault: false,
        },
    ];

    function createClient(entityList = entities) {
        return {
            query: jest.fn().mockResolvedValue({
                data: {
                    sys_get_entities: {
                        result: JSON.stringify(entityList),
                    },
                },
            }),
        };
    }

    test("upgrades a persisted system-default entity to the personal entity", async () => {
        const graphqlClient = createClient();
        const result = await resolveChatEntitySelection({
            graphqlClient,
            currentUser: {
                contextId: "user-1",
                personalEntityId,
            },
            requestedEntityId: "",
            persistedEntityId: systemDefaultEntityId,
            getEntitiesQuery: { kind: "Document" },
        });

        expect(result.entityId).toBe(personalEntityId);
        expect(result.persistedEntityId).toBe(personalEntityId);
        expect(result.repaired).toBe(true);
    });

    test("upgrades a requested system-default entity to the personal entity", async () => {
        const graphqlClient = createClient();
        const result = await resolveChatEntitySelection({
            graphqlClient,
            currentUser: {
                contextId: "user-1",
                personalEntityId,
            },
            requestedEntityId: systemDefaultEntityId,
            persistedEntityId: systemDefaultEntityId,
            getEntitiesQuery: { kind: "Document" },
        });

        expect(result.entityId).toBe(personalEntityId);
        expect(result.repaired).toBe(true);
    });

    test("keeps an explicitly selected custom entity", async () => {
        const graphqlClient = createClient();
        const result = await resolveChatEntitySelection({
            graphqlClient,
            currentUser: {
                contextId: "user-1",
                personalEntityId,
            },
            requestedEntityId: customEntityId,
            persistedEntityId: personalEntityId,
            getEntitiesQuery: { kind: "Document" },
        });

        expect(result.entityId).toBe(customEntityId);
        expect(result.persistedEntityId).toBe(customEntityId);
        expect(result.repaired).toBe(true);
    });

    test("ignores placeholder default entity ids", async () => {
        const graphqlClient = createClient();
        const result = await resolveChatEntitySelection({
            graphqlClient,
            currentUser: {
                contextId: "user-1",
                personalEntityId,
            },
            requestedEntityId: "default",
            persistedEntityId: "",
            getEntitiesQuery: { kind: "Document" },
        });

        expect(result.entityId).toBe(personalEntityId);
        expect(result.repaired).toBe(true);
    });

    test("keeps the candidate when entity listing fails", async () => {
        const graphqlClient = {
            query: jest.fn().mockRejectedValue(new Error("network down")),
        };
        const result = await resolveChatEntitySelection({
            graphqlClient,
            currentUser: {
                contextId: "user-1",
                personalEntityId,
            },
            requestedEntityId: customEntityId,
            persistedEntityId: systemDefaultEntityId,
            getEntitiesQuery: { kind: "Document" },
        });

        expect(result.entityId).toBe(customEntityId);
        expect(result.repaired).toBe(true);
    });

    test("uses personal entity when listing fails and no candidate remains", async () => {
        const graphqlClient = {
            query: jest.fn().mockRejectedValue(new Error("network down")),
        };
        const result = await resolveChatEntitySelection({
            graphqlClient,
            currentUser: {
                contextId: "user-1",
                personalEntityId,
            },
            requestedEntityId: "default",
            persistedEntityId: "",
            getEntitiesQuery: { kind: "Document" },
        });

        expect(result.entityId).toBe(personalEntityId);
        expect(result.repaired).toBe(true);
    });
});
