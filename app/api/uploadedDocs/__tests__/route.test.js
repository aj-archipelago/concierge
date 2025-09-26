/**
 * @jest-environment node
 */

import { NextRequest } from "next/server";
import { POST } from "../route";
import { getCurrentUser } from "../../utils/auth";

// Mock mongoose
jest.mock("mongoose", () => ({
    connection: {
        readyState: 1,
    },
    ...jest.requireActual("mongoose"),
}));

// Mock the auth utility
jest.mock("../../utils/auth", () => ({
    getCurrentUser: jest.fn(),
    handleError: jest.fn((error) => Response.json({ error: error.message }, { status: 400 })),
}));

// Mock User model
jest.mock("../../models/user", () => ({
    findByIdAndUpdate: jest.fn(),
}));

import User from "../../models/user";

describe("POST /api/uploadedDocs", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        
        // Mock getCurrentUser to return a valid user
        getCurrentUser.mockResolvedValue({
            _id: "user123",
            role: "user",
        });

        // Mock User.findByIdAndUpdate to return success
        User.findByIdAndUpdate.mockResolvedValue({
            _id: "user123",
            uploadedDocs: [
                { docId: "doc123", filename: "test.pdf", chatId: "chat123" }
            ]
        });
    });

    it("should successfully create an uploaded document with valid data", async () => {
        const validRequestData = {
            filename: "test%20file.pdf",
            docId: "doc123",
            chatId: "chat123"
        };

        const mockRequest = {
            json: jest.fn().mockResolvedValue(validRequestData)
        };

        const response = await POST(mockRequest);
        const responseData = await response.json();

        expect(response.status).toBe(200);
        expect(responseData.status).toBe("success");
        expect(responseData.uploadedDocs).toBeDefined();
        expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
            "user123",
            {
                $push: {
                    uploadedDocs: {
                        $each: [{ filename: "test file.pdf", docId: "doc123", chatId: "chat123" }],
                        $position: 0,
                    },
                },
            },
            { new: true, useFindAndModify: false, upsert: true }
        );
    });

    it("should reject request when filename is missing", async () => {
        const invalidRequestData = {
            // filename is missing
            docId: "doc123",
            chatId: "chat123"
        };

        const mockRequest = {
            json: jest.fn().mockResolvedValue(invalidRequestData)
        };

        const response = await POST(mockRequest);
        const responseData = await response.json();

        expect(response.status).toBe(400);
        expect(responseData.error).toBe("filename is required");
        expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    it("should reject request when docId is missing", async () => {
        const invalidRequestData = {
            filename: "test.pdf",
            // docId is missing
            chatId: "chat123"
        };

        const mockRequest = {
            json: jest.fn().mockResolvedValue(invalidRequestData)
        };

        const response = await POST(mockRequest);
        const responseData = await response.json();

        expect(response.status).toBe(400);
        expect(responseData.error).toBe("docId is required");
        expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    it("should reject request when chatId is missing", async () => {
        const invalidRequestData = {
            filename: "test.pdf",
            docId: "doc123"
            // chatId is missing
        };

        const mockRequest = {
            json: jest.fn().mockResolvedValue(invalidRequestData)
        };

        const response = await POST(mockRequest);
        const responseData = await response.json();

        expect(response.status).toBe(400);
        expect(responseData.error).toBe("chatId is required");
        expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    it("should reject request when chatId is null", async () => {
        const invalidRequestData = {
            filename: "test.pdf",
            docId: "doc123",
            chatId: null
        };

        const mockRequest = {
            json: jest.fn().mockResolvedValue(invalidRequestData)
        };

        const response = await POST(mockRequest);
        const responseData = await response.json();

        expect(response.status).toBe(400);
        expect(responseData.error).toBe("chatId is required");
        expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    it("should reject request when chatId is undefined", async () => {
        const invalidRequestData = {
            filename: "test.pdf",
            docId: "doc123",
            chatId: undefined
        };

        const mockRequest = {
            json: jest.fn().mockResolvedValue(invalidRequestData)
        };

        const response = await POST(mockRequest);
        const responseData = await response.json();

        expect(response.status).toBe(400);
        expect(responseData.error).toBe("chatId is required");
        expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    it("should reject request when chatId is empty string", async () => {
        const invalidRequestData = {
            filename: "test.pdf",
            docId: "doc123",
            chatId: ""
        };

        const mockRequest = {
            json: jest.fn().mockResolvedValue(invalidRequestData)
        };

        const response = await POST(mockRequest);
        const responseData = await response.json();

        expect(response.status).toBe(400);
        expect(responseData.error).toBe("chatId is required");
        expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    it("should handle double URL encoding properly", async () => {
        const validRequestData = {
            filename: "test%2520file%2520with%2520spaces.pdf", // Double encoded
            docId: "doc123",
            chatId: "chat123"
        };

        const mockRequest = {
            json: jest.fn().mockResolvedValue(validRequestData)
        };

        const response = await POST(mockRequest);
        const responseData = await response.json();

        expect(response.status).toBe(200);
        expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
            "user123",
            {
                $push: {
                    uploadedDocs: {
                        $each: [{ filename: "test file with spaces.pdf", docId: "doc123", chatId: "chat123" }],
                        $position: 0,
                    },
                },
            },
            { new: true, useFindAndModify: false, upsert: true }
        );
    });
});
