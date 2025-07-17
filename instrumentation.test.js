import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import LLM from "./app/api/models/llm";
import Prompt from "./app/api/models/prompt";
import App, { APP_TYPES, APP_STATUS } from "./app/api/models/app";
import User from "./app/api/models/user.mjs";
import { seed } from "./instrumentation";
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

    mongoServer = await MongoMemoryServer.create();
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

describe("LLM Initialization", () => {
    test("should migrate LLMs without identifiers", async () => {
        // Create an LLM without identifier
        const llmWithoutIdentifier = await LLM.create({
            name: "Test LLM",
            cortexModelName: "oai-gpt4o",
            cortexPathwayName: "run_gpt4_o",
            isDefault: false,
            identifier: null,
        });

        await seed();

        const updatedLLM = await LLM.findById(llmWithoutIdentifier._id);
        expect(updatedLLM.identifier).toBe("gpt4o");
    });

    test("should upsert LLMs from config", async () => {
        await seed();

        const llms = await LLM.find({});
        expect(llms.length).toBe(config.data.llms.length);

        // Verify default LLM exists
        const defaultLLM = await LLM.findOne({ isDefault: true });
        expect(defaultLLM).toBeTruthy();
        expect(defaultLLM.identifier).toBe("gpt4o");
    });

    test("should handle LLMs missing from config", async () => {
        // Create an LLM that doesn't exist in config
        const obsoleteLLM = await LLM.create({
            name: "Obsolete LLM",
            cortexModelName: "obsolete-model",
            cortexPathwayName: "run_obsolete",
            identifier: "obsolete",
            isDefault: false,
        });

        // Create a prompt using the obsolete LLM
        const prompt = await Prompt.create({
            title: "Test Prompt",
            text: "Test prompt text",
            llm: obsoleteLLM._id,
        });

        await seed();

        // Verify obsolete LLM was deleted
        const deletedLLM = await LLM.findById(obsoleteLLM._id);
        expect(deletedLLM).toBeNull();

        // Verify prompt was updated to use default LLM
        const updatedPrompt = await Prompt.findById(prompt._id);
        const defaultLLM = await LLM.findOne({ isDefault: true });
        expect(updatedPrompt.llm.toString()).toBe(defaultLLM._id.toString());
    });

    test("should handle multiple prompts referencing missing LLMs", async () => {
        // Create an obsolete LLM
        const obsoleteLLM = await LLM.create({
            name: "Obsolete LLM",
            cortexModelName: "obsolete-model",
            cortexPathwayName: "run_obsolete",
            identifier: "obsolete",
            isDefault: false,
        });

        // Create multiple prompts using the obsolete LLM
        const prompts = await Promise.all([
            Prompt.create({
                title: "Prompt 1",
                text: "Test prompt 1",
                llm: obsoleteLLM._id,
            }),
            Prompt.create({
                title: "Prompt 2",
                text: "Test prompt 2",
                llm: obsoleteLLM._id,
            }),
        ]);

        await seed();

        // Verify all prompts were updated to use default LLM
        const defaultLLM = await LLM.findOne({ isDefault: true });
        const updatedPrompts = await Prompt.find({
            _id: { $in: prompts.map((p) => p._id) },
        });

        updatedPrompts.forEach((prompt) => {
            expect(prompt.llm.toString()).toBe(defaultLLM._id.toString());
        });
    });

    test("should not modify prompts if no LLMs are missing from config", async () => {
        // First seed to create valid LLMs
        await seed();

        const defaultLLM = await LLM.findOne({ isDefault: true });

        // Create a prompt with valid LLM
        const prompt = await Prompt.create({
            title: "Test Prompt",
            text: "Test prompt text",
            llm: defaultLLM._id,
        });

        // Run seed again
        await seed();

        // Verify prompt's LLM hasn't changed
        const updatedPrompt = await Prompt.findById(prompt._id);
        expect(updatedPrompt.llm.toString()).toBe(defaultLLM._id.toString());
    });

    test("should correctly match config LLM with database LLM using cortexModelName", async () => {
        // Ensure we have multiple LLMs in config to test against
        expect(config.data.llms.length).toBeGreaterThan(1);

        // Find a non-first LLM from config to test against
        const targetConfigLLM = config.data.llms[1]; // Use second LLM in config

        // Create an LLM without identifier but with matching cortexModelName
        const llmWithoutIdentifier = await LLM.create({
            name: "Test LLM",
            cortexModelName: targetConfigLLM.cortexModelName,
            cortexPathwayName: targetConfigLLM.cortexPathwayName,
            isDefault: false,
            identifier: null,
        });

        await seed();

        // Verify the LLM was updated with correct identifier from config
        const updatedLLM = await LLM.findById(llmWithoutIdentifier._id);
        expect(updatedLLM.identifier).toBe(targetConfigLLM.identifier);
    });
});

describe("Native Apps Seeding", () => {
    test("should seed native apps with icons", async () => {
        await seed();

        const nativeApps = await App.find({ type: APP_TYPES.NATIVE });

        // Should have 6 native apps
        expect(nativeApps.length).toBe(6);

        // Check that each app has the expected properties
        const expectedApps = [
            { name: "Translate", slug: "translate", icon: "Globe" },
            { name: "Video", slug: "video", icon: "Video" },
            { name: "Write", slug: "write", icon: "Pencil" },
            { name: "Workspaces", slug: "workspaces", icon: "AppWindow" },
            { name: "Media", slug: "media", icon: "Image" },
            { name: "Jira", slug: "jira", icon: "Bug" },
        ];

        expectedApps.forEach((expectedApp) => {
            const app = nativeApps.find((a) => a.slug === expectedApp.slug);
            expect(app).toBeTruthy();
            expect(app.name).toBe(expectedApp.name);
            expect(app.icon).toBe(expectedApp.icon);
            expect(app.type).toBe(APP_TYPES.NATIVE);
            expect(app.status).toBe(APP_STATUS.ACTIVE);
        });
    });

    test("should create system user for native apps", async () => {
        await seed();

        const systemUser = await User.findOne({ role: "admin" });
        expect(systemUser).toBeTruthy();
        expect(systemUser.userId).toBe("system");
        expect(systemUser.username).toBe("system");
        expect(systemUser.name).toBe("System");
    });

    test("should not duplicate native apps on multiple seed runs", async () => {
        await seed();
        await seed();

        const nativeApps = await App.find({ type: APP_TYPES.NATIVE });
        expect(nativeApps.length).toBe(6);
    });
});
