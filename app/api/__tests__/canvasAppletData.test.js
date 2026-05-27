/**
 * @jest-environment node
 */

import { GET, PUT } from "../canvas-applets/[id]/data/route";

jest.mock("next/server", () => ({
    NextResponse: {
        json: (data, options) => ({
            ...data,
            status: (options && options.status) || 200,
        }),
    },
}));

jest.mock("next/headers", () => ({
    headers: jest.fn(
        () =>
            new Map([
                ["host", "localhost:3000"],
                ["x-forwarded-proto", "http"],
            ]),
    ),
}));

jest.mock("../utils/auth", () => ({
    getCurrentUser: jest.fn(),
}));

jest.mock("../utils/fileValidation", () => ({
    validateMongoDBKey: jest.fn(),
}));

jest.mock("../models/applet", () => ({
    __esModule: true,
    default: {
        findOne: jest.fn(),
        findById: jest.fn(),
        updateOne: jest.fn(),
    },
}));

jest.mock("../models/applet-data", () => {
    const mockFindOne = jest.fn();
    const mockFindOneAndUpdate = jest.fn();
    return {
        __esModule: true,
        default: {
            findOne: mockFindOne,
            findOneAndUpdate: mockFindOneAndUpdate,
        },
    };
});

jest.mock("mongoose", () => ({
    __esModule: true,
    default: {
        Types: {
            ObjectId: {
                isValid: jest.fn(),
            },
        },
    },
}));

describe("Canvas Applet Data Routes", () => {
    let mockUser;
    let mockApplet;

    beforeEach(() => {
        jest.clearAllMocks();

        mockUser = {
            _id: "user123",
            toString: () => "user123",
        };

        mockApplet = {
            _id: "applet123",
            owner: { toString: () => "user123" },
            version: 2,
            publishedVersionIndex: null,
        };

        const { getCurrentUser } = require("../utils/auth");
        getCurrentUser.mockResolvedValue(mockUser);

        const mongoose = require("mongoose").default;
        mongoose.Types.ObjectId.isValid.mockReturnValue(true);

        const Applet = require("../models/applet").default;
        Applet.findOne.mockResolvedValue(mockApplet);
        Applet.findById.mockReturnValue({
            select: jest.fn().mockReturnValue({
                lean: jest.fn().mockResolvedValue(null),
            }),
        });
        Applet.updateOne.mockResolvedValue({});
    });

    describe("GET", () => {
        test("should return empty data for new user/applet", async () => {
            const AppletData = require("../models/applet-data").default;
            AppletData.findOne.mockResolvedValue(null);

            const response = await GET(
                { url: "https://example.com" },
                { params: { id: "applet123" } },
            );

            expect(response.status).toBe(200);
            expect(response.data).toEqual({});
        });

        test("should return existing data", async () => {
            const AppletData = require("../models/applet-data").default;
            AppletData.findOne.mockResolvedValue({
                data: { counter: 42, name: "test" },
            });

            const response = await GET(
                { url: "https://example.com" },
                { params: { id: "applet123" } },
            );

            expect(response.status).toBe(200);
            expect(response.data).toEqual({ counter: 42, name: "test" });
        });

        test("should return 401 for unauthenticated user", async () => {
            const { getCurrentUser } = require("../utils/auth");
            getCurrentUser.mockResolvedValue(null);

            const response = await GET(
                { url: "https://example.com" },
                { params: { id: "applet123" } },
            );

            expect(response.status).toBe(401);
        });

        test("should return 400 for invalid applet ID", async () => {
            const mongoose = require("mongoose").default;
            mongoose.Types.ObjectId.isValid.mockReturnValue(false);

            const response = await GET(
                { url: "https://example.com" },
                { params: { id: "invalid" } },
            );

            expect(response.status).toBe(400);
        });

        test("should return 404 for non-existent applet", async () => {
            const Applet = require("../models/applet").default;
            Applet.findOne.mockResolvedValue(null);

            const response = await GET(
                { url: "https://example.com" },
                { params: { id: "applet123" } },
            );

            expect(response.status).toBe(404);
        });

        test("should return 403 for non-owner on unpublished applet", async () => {
            const Applet = require("../models/applet").default;
            Applet.findOne.mockResolvedValue({
                ...mockApplet,
                owner: { toString: () => "otherUser" },
                publishedVersionIndex: null,
            });

            const response = await GET(
                { url: "https://example.com" },
                { params: { id: "applet123" } },
            );

            expect(response.status).toBe(403);
        });

        test("should allow non-owner on published applet", async () => {
            const Applet = require("../models/applet").default;
            Applet.findOne.mockResolvedValue({
                ...mockApplet,
                owner: { toString: () => "otherUser" },
                publishedVersionIndex: 0,
            });

            const AppletData = require("../models/applet-data").default;
            AppletData.findOne.mockResolvedValue(null);

            const response = await GET(
                { url: "https://example.com" },
                { params: { id: "applet123" } },
            );

            expect(response.status).toBe(200);
            expect(response.data).toEqual({});
        });
    });

    describe("PUT", () => {
        test("should store key-value data", async () => {
            const { validateMongoDBKey } = require("../utils/fileValidation");
            validateMongoDBKey.mockReturnValue({
                isValid: true,
                sanitizedKey: "counter",
            });

            const AppletData = require("../models/applet-data").default;
            AppletData.findOne.mockResolvedValue({
                data: { existing: "value" },
            });
            AppletData.findOneAndUpdate.mockResolvedValue({
                data: { existing: "value", counter: 42 },
            });

            const request = {
                json: () => Promise.resolve({ key: "counter", value: 42 }),
            };

            const response = await PUT(request, {
                params: { id: "applet123" },
            });

            expect(response.status).toBe(200);
            expect(response.success).toBe(true);
            expect(response.data).toEqual({ existing: "value", counter: 42 });

            expect(AppletData.findOneAndUpdate).toHaveBeenCalledWith(
                { appletId: "applet123", userId: "user123" },
                { $set: { data: { existing: "value", counter: 42 } } },
                { new: true, upsert: true, runValidators: true },
            );
        });

        test("should return 400 when key is missing", async () => {
            const request = {
                json: () => Promise.resolve({ value: 42 }),
            };

            const response = await PUT(request, {
                params: { id: "applet123" },
            });

            expect(response.status).toBe(400);
            expect(response.error).toBe("Key and value are required");
        });

        test("should return 400 for invalid or empty json body", async () => {
            const request = {
                json: () =>
                    Promise.reject(
                        new SyntaxError("Unexpected end of JSON input"),
                    ),
            };

            const response = await PUT(request, {
                params: { id: "applet123" },
            });

            expect(response.status).toBe(400);
            expect(response.error).toBe("Invalid or empty JSON body");
        });

        test("should return 400 when value is undefined", async () => {
            const request = {
                json: () => Promise.resolve({ key: "test" }),
            };

            const response = await PUT(request, {
                params: { id: "applet123" },
            });

            expect(response.status).toBe(400);
            expect(response.error).toBe("Key and value are required");
        });

        test("should return 400 for invalid key format", async () => {
            const { validateMongoDBKey } = require("../utils/fileValidation");
            validateMongoDBKey.mockReturnValue({
                isValid: false,
                errors: ["Key cannot start with $"],
            });

            const request = {
                json: () => Promise.resolve({ key: "$set", value: "bad" }),
            };

            const response = await PUT(request, {
                params: { id: "applet123" },
            });

            expect(response.status).toBe(400);
            expect(response.error).toBe("Invalid key format");
        });

        test("should return 403 for non-owner on unpublished applet", async () => {
            const Applet = require("../models/applet").default;
            Applet.findOne.mockResolvedValue({
                ...mockApplet,
                owner: { toString: () => "otherUser" },
                publishedVersionIndex: null,
            });

            const request = {
                json: () => Promise.resolve({ key: "test", value: "data" }),
            };

            // Need to mock validateMongoDBKey since it's called before auth check
            const { validateMongoDBKey } = require("../utils/fileValidation");
            validateMongoDBKey.mockReturnValue({
                isValid: true,
                sanitizedKey: "test",
            });

            const response = await PUT(request, {
                params: { id: "applet123" },
            });

            expect(response.status).toBe(403);
        });
    });
});
