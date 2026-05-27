import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import LLM from "./app/api/models/llm";
import Prompt from "./app/api/models/prompt";
import App, { APP_TYPES, APP_STATUS } from "./app/api/models/app";
import User from "./app/api/models/user.mjs";
import { migrateLLMsToModelIds, seedNativeApps } from "./instrumentation";
import config from "./config/index";

let mongoServer;
let originalConsole;

beforeAll(async () => {
    // Mock console methods
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
            // Bind the in-memory MongoDB instance explicitly to localhost to ensure
            // consistent behavior across environments (e.g., Docker/CI) and avoid
            // exposing it on external interfaces.
            ip: "127.0.0.1",
        },
    });
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);
});

afterAll(async () => {
    // Restore console methods
    console.log = originalConsole.log;
    console.warn = originalConsole.warn;
    console.error = originalConsole.error;

    await mongoose.disconnect();
    await mongoServer.stop();
});

beforeEach(async () => {
    await LLM.deleteMany({});
    await Prompt.deleteMany({});
    await App.deleteMany({});
    await User.deleteMany({});
});

describe("LLM to Model ID Migration", () => {
    test("should migrate prompt with LLM ObjectId to cortex model name", async () => {
        const llm = await LLM.create({
            name: "GPT-4o",
            cortexModelName: "oai-gpt4o",
            cortexPathwayName: "run_workspace_prompt",
            identifier: "gpt4o",
            isDefault: true,
        });

        const prompt = await Prompt.create({
            title: "Test Prompt",
            text: "Test prompt text",
            llm: llm._id,
        });

        await migrateLLMsToModelIds();

        const updatedPrompt = await Prompt.findById(prompt._id);
        expect(updatedPrompt.llm).toBe("oai-gpt4o");
    });

    test("should migrate conciergeagent to agentMode", async () => {
        const llm = await LLM.create({
            name: "Concierge Agent",
            cortexModelName: "concierge-agent",
            cortexPathwayName: "run_workspace_agent",
            identifier: "conciergeagent",
            isDefault: false,
        });

        const prompt = await Prompt.create({
            title: "Agent Prompt",
            text: "Test agent prompt",
            llm: llm._id,
        });

        await migrateLLMsToModelIds();

        const updatedPrompt = await Prompt.findById(prompt._id);
        expect(updatedPrompt.llm).toBe(config.cortex.defaultChatModel);
        expect(updatedPrompt.agentMode).toBe(true);
        expect(updatedPrompt.reasoningEffort).toBeNull();
    });

    test("should migrate conciergeresearchagent to agentMode with high reasoning", async () => {
        const llm = await LLM.create({
            name: "Research Agent",
            cortexModelName: "concierge-research-agent",
            cortexPathwayName: "run_workspace_agent",
            identifier: "conciergeresearchagent",
            isDefault: false,
        });

        const prompt = await Prompt.create({
            title: "Research Prompt",
            text: "Test research prompt",
            llm: llm._id,
        });

        await migrateLLMsToModelIds();

        const updatedPrompt = await Prompt.findById(prompt._id);
        expect(updatedPrompt.llm).toBe(config.cortex.defaultChatModel);
        expect(updatedPrompt.agentMode).toBe(true);
        expect(updatedPrompt.reasoningEffort).toBe("high");
    });

    test("should use default model for orphaned LLM references", async () => {
        // Create a prompt pointing to an ObjectId that doesn't exist in LLM collection
        const fakeId = new mongoose.Types.ObjectId();
        const prompt = await Prompt.create({
            title: "Orphan Prompt",
            text: "Test orphan prompt",
            llm: fakeId,
        });

        await migrateLLMsToModelIds();

        const updatedPrompt = await Prompt.findById(prompt._id);
        expect(updatedPrompt.llm).toBe(config.cortex.defaultChatModel);
    });

    test("should not modify prompts with string model IDs (already migrated)", async () => {
        const prompt = await Prompt.create({
            title: "Already Migrated",
            text: "Test prompt",
            llm: "oai-gpt4o",
        });

        await migrateLLMsToModelIds();

        const updatedPrompt = await Prompt.findById(prompt._id);
        expect(updatedPrompt.llm).toBe("oai-gpt4o");
    });

    test("should clean up LLM collection after migration", async () => {
        await LLM.create({
            name: "GPT-4o",
            cortexModelName: "oai-gpt4o",
            cortexPathwayName: "run_workspace_prompt",
            identifier: "gpt4o",
            isDefault: true,
        });

        expect(await LLM.countDocuments()).toBe(1);

        await migrateLLMsToModelIds();

        expect(await LLM.countDocuments()).toBe(0);
    });

    test("should handle multiple prompts referencing different LLMs", async () => {
        const llm1 = await LLM.create({
            name: "GPT-4o",
            cortexModelName: "oai-gpt4o",
            cortexPathwayName: "run_workspace_prompt",
            identifier: "gpt4o",
            isDefault: true,
        });

        const llm2 = await LLM.create({
            name: "Claude",
            cortexModelName: "claude-sonnet",
            cortexPathwayName: "run_workspace_prompt",
            identifier: "claude",
            isDefault: false,
        });

        const [prompt1, prompt2] = await Promise.all([
            Prompt.create({ title: "Prompt 1", text: "Text 1", llm: llm1._id }),
            Prompt.create({ title: "Prompt 2", text: "Text 2", llm: llm2._id }),
        ]);

        await migrateLLMsToModelIds();

        const updated1 = await Prompt.findById(prompt1._id);
        const updated2 = await Prompt.findById(prompt2._id);
        expect(updated1.llm).toBe("oai-gpt4o");
        expect(updated2.llm).toBe("claude-sonnet");
    });

    test("should be a no-op on subsequent runs", async () => {
        const prompt = await Prompt.create({
            title: "Already Done",
            text: "Test",
            llm: "oai-gpt4o",
        });

        await migrateLLMsToModelIds();
        await migrateLLMsToModelIds();

        const updatedPrompt = await Prompt.findById(prompt._id);
        expect(updatedPrompt.llm).toBe("oai-gpt4o");
    });
});

describe("Native Apps Seeding", () => {
    test("should seed native apps with icons", async () => {
        await seedNativeApps();

        const nativeApps = await App.find({ type: APP_TYPES.NATIVE });

        // Should have 6 native apps
        expect(nativeApps.length).toBe(6);

        // Check that each app has the expected properties
        const expectedApps = [
            {
                name: "Translate",
                slug: "translate",
                icon: "Globe",
                description:
                    "Translate text between multiple languages with AI-powered accuracy",
            },
            {
                name: "Transcribe",
                slug: "video",
                icon: "Video",
                description:
                    "Transcribe and translate video and audio files with AI-powered accuracy",
            },
            {
                name: "Write",
                slug: "write",
                icon: "Pencil",
                description:
                    "Write and edit content with AI-powered writing assistance",
            },
            {
                name: "Workspaces",
                slug: "workspaces",
                icon: "AppWindow",
                description:
                    "Manage your AI workspaces and collaborate on projects",
            },
            {
                name: "Media",
                slug: "media",
                icon: "Image",
                description: "Generate and manage images and media content",
            },
            {
                name: "Jira",
                slug: "jira",
                icon: "Bug",
                description:
                    "Integrate with Jira for issue tracking and project management",
            },
        ];

        expectedApps.forEach((expectedApp) => {
            const app = nativeApps.find((a) => a.slug === expectedApp.slug);
            expect(app).toBeTruthy();
            expect(app.name).toBe(expectedApp.name);
            expect(app.icon).toBe(expectedApp.icon);
            expect(app.description).toBe(expectedApp.description);
            expect(app.type).toBe(APP_TYPES.NATIVE);
            expect(app.status).toBe(APP_STATUS.ACTIVE);
        });
    });

    test("should create system user for native apps", async () => {
        await seedNativeApps();

        const systemUser = await User.findOne({ role: "admin" });
        expect(systemUser).toBeTruthy();
        expect(systemUser.userId).toBe("system");
        expect(systemUser.username).toBe("system");
        expect(systemUser.name).toBe("System");
    });

    test("should not duplicate native apps on multiple seed runs", async () => {
        await seedNativeApps();
        await seedNativeApps();

        const nativeApps = await App.find({ type: APP_TYPES.NATIVE });
        expect(nativeApps.length).toBe(6);
    });
});
