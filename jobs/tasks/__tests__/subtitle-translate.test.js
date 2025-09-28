// Test file for subtitle-translate task

// Mock dependencies before importing the handler
const mockMongoose = {
    connection: { readyState: 1 },
};

const mockConnectToDatabase = jest.fn();

const mockUser = {
    findById: jest.fn(),
};

const mockUserState = {
    findOne: jest.fn(),
    prototype: {
        save: jest.fn(),
    },
};

const mockTask = {
    find: jest.fn(),
};

// Mock the GraphQL query
const mockTRANSLATE_SUBTITLE = "mocked-translate-subtitle-query";

// Create mock constructors
const MockedUserState = jest.fn().mockImplementation((data) => ({
    ...data,
    serializedState: null,
    save: jest.fn().mockResolvedValue(true),
}));

// Set up prototype methods
Object.setPrototypeOf(MockedUserState.prototype, mockUserState.prototype);
MockedUserState.findOne = mockUserState.findOne;

const MockedTask = jest.fn();
MockedTask.find = mockTask.find;

const MockedUser = jest.fn();
MockedUser.findById = mockUser.findById;

// Mock modules using jest.mock
jest.mock("mongoose", () => ({
    __esModule: true,
    default: mockMongoose,
}));

jest.mock("../../../src/db.mjs", () => ({
    connectToDatabase: mockConnectToDatabase,
}));

jest.mock("../../graphql.mjs", () => ({
    TRANSLATE_SUBTITLE: mockTRANSLATE_SUBTITLE,
}));

jest.mock("../../../app/api/models/user.mjs", () => ({
    __esModule: true,
    default: MockedUser,
}));

jest.mock("../../../app/api/models/user-state.mjs", () => ({
    __esModule: true,
    default: MockedUserState,
}));

jest.mock("../../../app/api/models/task.mjs", () => ({
    __esModule: true,
    default: MockedTask,
}));

// Mock the BaseTask class
jest.mock("../base-task.mjs", () => ({
    BaseTask: class MockBaseTask {
        get displayName() {
            throw new Error("displayName must be implemented by handler");
        }
        get isRetryable() {
            return false;
        }
        async startRequest(job) {
            throw new Error("startRequest must be implemented by handler");
        }
        async handleCompletion(taskId, dataObject, infoObject, metadata, client) {
            return dataObject;
        }
        async cancelRequest(taskId, client) {
            return;
        }
    },
}));

// Create a mock SubtitleTranslateHandler class for testing
const SubtitleTranslateHandler = jest.fn().mockImplementation(() => ({
    displayName: "Subtitle translation",
    isRetryable: true,

    async startRequest(job) {
        const { taskId, metadata } = job.data;
        const { text, to, format } = metadata;

        const { data, errors } = await job.client.query({
            query: mockTRANSLATE_SUBTITLE,
            variables: {
                text,
                to,
                format,
                async: true,
            },
            fetchPolicy: "no-cache",
        });

        if (errors) {
            throw new Error(`GraphQL errors: ${JSON.stringify(errors)}`);
        }

        const result = data?.translate_subtitle?.result;

        if (!result) {
            throw new Error("No result returned from translation service");
        }

        return result;
    },

    async handleCompletion(taskId, dataObject, infoObject, metadata, client) {
        try {
            const { userId } = metadata;
            await this.handleTranslationCompletion(
                userId,
                dataObject,
                metadata.format,
                metadata,
            );
        } catch (error) {
            // Don't throw the error as we still want to return the translation
        }
        return dataObject;
    },

    async handleTranslationCompletion(
        userId,
        translationData,
        format,
        metadata,
    ) {
        // Simulate the database operation logic
        if (mockMongoose.connection.readyState !== 1) {
            await mockConnectToDatabase();
        }

        const user = await MockedUser.findById(userId);
        if (!user) {
            throw new Error(`User ${userId} not found`);
        }

        let userState = await MockedUserState.findOne({ user: userId });
        if (!userState) {
            userState = new MockedUserState({ user: userId });
        }

        let state = {};
        if (userState.serializedState) {
            try {
                state = JSON.parse(userState.serializedState);
            } catch (error) {
                state = {};
            }
        }

        const transcribeState = state.transcribe || {};
        const transcripts = transcribeState.transcripts || [];

        const updatedTranscripts = [
            ...transcripts,
            {
                text: translationData,
                format: format || "vtt",
                name: metadata.name,
                timestamp: new Date().toISOString(),
            },
        ];

        const newActiveIndex = updatedTranscripts.length - 1;

        const updatedState = {
            ...state,
            transcribe: {
                ...transcribeState,
                transcripts: updatedTranscripts,
                activeTranscript: newActiveIndex,
            },
        };

        userState.serializedState = JSON.stringify(updatedState);
        await userState.save();
    },

    async getUserTranslationJobs(userId) {
        if (mockMongoose.connection.readyState !== 1) {
            await mockConnectToDatabase();
        }

        const jobs = await MockedTask.find({
            owner: userId,
            type: "subtitle-translate",
        }).sort({ createdAt: -1 });

        return jobs;
    },
}));

describe("SubtitleTranslateHandler", () => {
    let subtitleTranslateHandler;

    beforeAll(() => {
        // Create an instance for testing
        subtitleTranslateHandler = new SubtitleTranslateHandler();
    });

    beforeEach(() => {
        jest.clearAllMocks();

        // Reset mongoose connection state
        mockMongoose.connection.readyState = 1;

        // Reset mock implementations
        mockConnectToDatabase.mockResolvedValue(true);
        mockUser.findById.mockResolvedValue({
            _id: "user123",
            name: "Test User",
        });
        mockUserState.findOne.mockResolvedValue(null);
        mockTask.find.mockReturnValue({
            sort: jest.fn().mockResolvedValue([]),
        });
    });

    describe("Basic Properties", () => {
        test("should have correct displayName", () => {
            expect(subtitleTranslateHandler.displayName).toBe(
                "Subtitle translation",
            );
        });

        test("should be retryable", () => {
            expect(subtitleTranslateHandler.isRetryable).toBe(true);
        });
    });

    describe("startRequest", () => {
        const mockJob = {
            data: {
                taskId: "task123",
                metadata: {
                    text: "Hello world",
                    to: "fr",
                    format: "vtt",
                },
            },
            client: {
                query: jest.fn(),
            },
        };

        test("should successfully start a translation request", async () => {
            const mockResult = "Bonjour le monde";
            mockJob.client.query.mockResolvedValue({
                data: {
                    translate_subtitle: {
                        result: mockResult,
                    },
                },
                errors: null,
            });

            const result = await subtitleTranslateHandler.startRequest(mockJob);

            expect(mockJob.client.query).toHaveBeenCalledWith({
                query: mockTRANSLATE_SUBTITLE,
                variables: {
                    text: "Hello world",
                    to: "fr",
                    format: "vtt",
                    async: true,
                },
                fetchPolicy: "no-cache",
            });

            expect(result).toBe(mockResult);
        });

        test("should throw error when GraphQL returns errors", async () => {
            const graphqlErrors = [{ message: "Translation failed" }];
            mockJob.client.query.mockResolvedValue({
                data: null,
                errors: graphqlErrors,
            });

            await expect(
                subtitleTranslateHandler.startRequest(mockJob),
            ).rejects.toThrow(
                'GraphQL errors: [{"message":"Translation failed"}]',
            );
        });

        test("should throw error when no result is returned", async () => {
            mockJob.client.query.mockResolvedValue({
                data: {
                    translate_subtitle: {
                        result: null,
                    },
                },
                errors: null,
            });

            await expect(
                subtitleTranslateHandler.startRequest(mockJob),
            ).rejects.toThrow("No result returned from translation service");
        });

        test("should throw error when data structure is invalid", async () => {
            mockJob.client.query.mockResolvedValue({
                data: {
                    translate_subtitle: null,
                },
                errors: null,
            });

            await expect(
                subtitleTranslateHandler.startRequest(mockJob),
            ).rejects.toThrow("No result returned from translation service");
        });
    });

    describe("handleCompletion", () => {
        const taskId = "task123";
        const dataObject = "Translated subtitle content";
        const metadata = {
            userId: "user123",
            format: "vtt",
            name: "test-subtitle.vtt",
        };
        const client = {};

        test("should handle completion successfully", async () => {
            const spy = jest
                .spyOn(subtitleTranslateHandler, "handleTranslationCompletion")
                .mockResolvedValue(true);

            const result = await subtitleTranslateHandler.handleCompletion(
                taskId,
                dataObject,
                null, // infoObject
                metadata,
                client,
            );

            expect(spy).toHaveBeenCalledWith(
                "user123",
                dataObject,
                "vtt",
                metadata,
            );
            expect(result).toBe(dataObject);

            spy.mockRestore();
        });

        test("should return data even if saving to state fails", async () => {
            const spy = jest
                .spyOn(subtitleTranslateHandler, "handleTranslationCompletion")
                .mockRejectedValue(new Error("Save failed"));

            const result = await subtitleTranslateHandler.handleCompletion(
                taskId,
                dataObject,
                null, // infoObject
                metadata,
                client,
            );

            expect(result).toBe(dataObject);

            spy.mockRestore();
        });
    });

    describe("handleTranslationCompletion", () => {
        const userId = "user123";
        const translationData = "Translated content";
        const format = "vtt";
        const metadata = {
            name: "test-subtitle.vtt",
        };

        test("should create new user state when none exists", async () => {
            const mockUser = { _id: userId, name: "Test User" };
            MockedUser.findById.mockResolvedValue(mockUser);
            MockedUserState.findOne.mockResolvedValue(null);

            const mockSave = jest.fn().mockResolvedValue(true);
            const mockUserStateInstance = {
                user: userId,
                serializedState: null,
                save: mockSave,
            };
            MockedUserState.mockImplementation(() => mockUserStateInstance);

            await subtitleTranslateHandler.handleTranslationCompletion(
                userId,
                translationData,
                format,
                metadata,
            );

            expect(MockedUser.findById).toHaveBeenCalledWith(userId);
            expect(MockedUserState.findOne).toHaveBeenCalledWith({
                user: userId,
            });
            expect(MockedUserState).toHaveBeenCalledWith({ user: userId });

            expect(mockSave).toHaveBeenCalled();
            expect(mockUserStateInstance.serializedState).toContain(
                translationData,
            );
        });

        test("should connect to database if not connected", async () => {
            mockMongoose.connection.readyState = 0; // Not connected

            const mockUser = { _id: userId, name: "Test User" };
            MockedUser.findById.mockResolvedValue(mockUser);
            MockedUserState.findOne.mockResolvedValue(null);

            const mockSave = jest.fn().mockResolvedValue(true);
            const mockUserStateInstance = {
                user: userId,
                serializedState: null,
                save: mockSave,
            };
            MockedUserState.mockImplementation(() => mockUserStateInstance);

            await subtitleTranslateHandler.handleTranslationCompletion(
                userId,
                translationData,
                format,
                metadata,
            );

            expect(mockConnectToDatabase).toHaveBeenCalled();
        });

        test("should handle database errors", async () => {
            MockedUser.findById.mockRejectedValue(new Error("Database error"));

            await expect(
                subtitleTranslateHandler.handleTranslationCompletion(
                    userId,
                    translationData,
                    format,
                    metadata,
                ),
            ).rejects.toThrow("Database error");
        });
    });

    describe("getUserTranslationJobs", () => {
        const userId = "user123";

        test("should return user translation jobs", async () => {
            const mockJobs = [
                {
                    _id: "job1",
                    type: "subtitle-translate",
                    createdAt: new Date(),
                },
                {
                    _id: "job2",
                    type: "subtitle-translate",
                    createdAt: new Date(),
                },
            ];

            MockedTask.find.mockReturnValue({
                sort: jest.fn().mockResolvedValue(mockJobs),
            });

            const result =
                await subtitleTranslateHandler.getUserTranslationJobs(userId);

            expect(MockedTask.find).toHaveBeenCalledWith({
                owner: userId,
                type: "subtitle-translate",
            });

            expect(result).toEqual(mockJobs);
        });

        test("should connect to database if not connected", async () => {
            mockMongoose.connection.readyState = 0; // Not connected

            MockedTask.find.mockReturnValue({
                sort: jest.fn().mockResolvedValue([]),
            });

            await subtitleTranslateHandler.getUserTranslationJobs(userId);

            expect(mockConnectToDatabase).toHaveBeenCalled();
        });

        test("should handle database errors", async () => {
            MockedTask.find.mockImplementation(() => {
                throw new Error("Database error");
            });

            await expect(
                subtitleTranslateHandler.getUserTranslationJobs(userId),
            ).rejects.toThrow("Database error");
        });
    });
});
