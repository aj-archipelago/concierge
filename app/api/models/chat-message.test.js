/** @jest-environment node */

const mockConnect = jest.fn();
const mockClose = jest.fn();
const mockHasNext = jest.fn();
const mockCommand = jest.fn();
const mockCreateIndexes = jest.fn();
const mockCollection = jest.fn(() => ({ createIndexes: mockCreateIndexes }));
const mockDb = {
    listCollections: jest.fn(() => ({ hasNext: mockHasNext })),
    command: mockCommand,
    collection: mockCollection,
};

jest.mock("mongodb", () => ({
    ...jest.requireActual("mongodb"),
    MongoClient: jest.fn().mockImplementation(() => ({
        connect: mockConnect,
        close: mockClose,
        db: () => mockDb,
    })),
}));

const COSMOS_URI =
    "mongodb://example.mongo.cosmos.azure.com/concierge-dev?tls=true";
let MongoClient;
let ChatMessage;
let ensureChatMessageStorage;

describe("ensureChatMessageStorage", () => {
    const originalMongoUri = process.env.MONGO_URI;

    beforeAll(async () => {
        ({ MongoClient } = await import("mongodb"));
        const chatMessageModule = await import("./chat-message.mjs");
        ChatMessage = chatMessageModule.default;
        ensureChatMessageStorage = chatMessageModule.ensureChatMessageStorage;
    });

    beforeEach(() => {
        jest.clearAllMocks();
        process.env.MONGO_URI = COSMOS_URI;
        mockHasNext.mockResolvedValue(false);
        mockCommand.mockImplementation(async ({ customAction }) =>
            customAction === "GetCollection"
                ? { shardKeyDefinition: { chatId: "Hash" } }
                : { ok: 1 },
        );
        mockCreateIndexes.mockResolvedValue([]);
    });

    afterAll(() => {
        if (originalMongoUri === undefined) {
            delete process.env.MONGO_URI;
        } else {
            process.env.MONGO_URI = originalMongoUri;
        }
    });

    test("provisions Cosmos metadata and indexes through a plain client", async () => {
        await ensureChatMessageStorage();

        expect(MongoClient).toHaveBeenCalledWith(
            COSMOS_URI,
            expect.objectContaining({ maxPoolSize: 1 }),
        );
        expect(mockConnect).toHaveBeenCalledTimes(1);
        expect(mockCommand).toHaveBeenNthCalledWith(1, {
            customAction: "CreateCollection",
            collection: "chat_messages",
            shardKey: "chatId",
            autoScaleSettings: { maxThroughput: 5000 },
        });
        expect(mockCommand).toHaveBeenNthCalledWith(2, {
            customAction: "GetCollection",
            collection: "chat_messages",
        });
        expect(mockCollection).toHaveBeenCalledWith("chat_messages");
        expect(mockCreateIndexes).toHaveBeenCalledWith([
            { key: { chatId: 1, generationId: 1, sequence: 1 } },
            { key: { chatId: 1, generationId: 1, messageId: 1 } },
            {
                key: { chatId: 1, generationId: 1, taskId: 1 },
                sparse: true,
            },
        ]);
        expect(mockClose).toHaveBeenCalledTimes(1);
    });

    test("skips collection creation when the partitioned collection exists", async () => {
        mockHasNext.mockResolvedValue(true);

        await ensureChatMessageStorage();

        expect(mockCommand).toHaveBeenCalledTimes(1);
        expect(mockCommand).toHaveBeenCalledWith({
            customAction: "GetCollection",
            collection: "chat_messages",
        });
        expect(mockCreateIndexes).toHaveBeenCalledTimes(1);
    });

    test("uses the configured autoscale ceiling only for a new collection", async () => {
        process.env.CHAT_MESSAGES_AUTOSCALE_MAX_RU = "8000";
        try {
            await ensureChatMessageStorage();
            expect(mockCommand).toHaveBeenCalledWith(
                expect.objectContaining({
                    customAction: "CreateCollection",
                    autoScaleSettings: { maxThroughput: 8000 },
                }),
            );
        } finally {
            delete process.env.CHAT_MESSAGES_AUTOSCALE_MAX_RU;
        }
    });

    test("rejects invalid capacity before creating a collection", async () => {
        process.env.CHAT_MESSAGES_AUTOSCALE_MAX_RU = "1500";
        try {
            await expect(ensureChatMessageStorage()).rejects.toThrow(
                "must be a multiple of 1000",
            );
            expect(mockCommand).not.toHaveBeenCalled();
            expect(mockClose).toHaveBeenCalledTimes(1);
        } finally {
            delete process.env.CHAT_MESSAGES_AUTOSCALE_MAX_RU;
        }
    });

    test("always closes the plain client when provisioning fails", async () => {
        mockCommand.mockRejectedValueOnce(
            new Error("Cosmos collection creation failed"),
        );

        await expect(ensureChatMessageStorage()).rejects.toThrow(
            "Cosmos collection creation failed",
        );
        expect(mockClose).toHaveBeenCalledTimes(1);
    });

    test("uses the existing Mongoose connection outside Cosmos", async () => {
        process.env.MONGO_URI = "mongodb://127.0.0.1/concierge-test";
        const createIndexes = jest
            .spyOn(ChatMessage, "createIndexes")
            .mockResolvedValueOnce([]);

        await ensureChatMessageStorage();

        expect(createIndexes).toHaveBeenCalledTimes(1);
        expect(MongoClient).not.toHaveBeenCalled();
        createIndexes.mockRestore();
    });
});
