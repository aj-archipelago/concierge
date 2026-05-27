import React from "react";
import { redirect } from "next/navigation";
import AdminLayout from "../layout";
import { getCurrentUser } from "../../api/utils/auth";

// Mock the next/navigation module
jest.mock("next/navigation", () => ({
    redirect: jest.fn(),
}));

const mockHeadersGet = jest.fn();
jest.mock("next/headers", () => ({
    headers: () => ({ get: mockHeadersGet }),
}));

// Mock the auth utility
jest.mock("../../api/utils/auth", () => ({
    getCurrentUser: jest.fn(),
}));

describe("AdminLayout", () => {
    const originalNodeEnv = process.env.NODE_ENV;

    beforeEach(() => {
        // Clear all mocks before each test
        jest.clearAllMocks();
        mockHeadersGet.mockReturnValue("example.com");
    });

    afterEach(() => {
        process.env.NODE_ENV = originalNodeEnv;
    });

    it("should allow non-admin users on localhost", async () => {
        process.env.NODE_ENV = "development";
        mockHeadersGet.mockReturnValue("localhost:3000");
        getCurrentUser.mockResolvedValue({ role: "user" });

        await AdminLayout({ children: <div>Test Content</div> });

        expect(redirect).not.toHaveBeenCalled();
    });

    it("should redirect non-admin users to home page", async () => {
        // Mock a non-admin user
        getCurrentUser.mockResolvedValue({
            role: "user",
        });

        // Mock children component
        const mockChildren = <div>Test Content</div>;

        // Call the layout component
        await AdminLayout({ children: mockChildren });

        // Verify that redirect was called with '/'
        expect(redirect).toHaveBeenCalledWith("/");
    });

    it("should redirect unauthenticated users to home page", async () => {
        // Mock no user (unauthenticated)
        getCurrentUser.mockResolvedValue(null);

        // Mock children component
        const mockChildren = <div>Test Content</div>;

        // Call the layout component
        await AdminLayout({ children: mockChildren });

        // Verify that redirect was called with '/'
        expect(redirect).toHaveBeenCalledWith("/");
    });

    it("should render children for admin users", async () => {
        // Mock an admin user
        getCurrentUser.mockResolvedValue({
            role: "admin",
        });

        // Mock children component
        const mockChildren = <div>Test Content</div>;

        // Call the layout component
        const result = await AdminLayout({ children: mockChildren });

        // Verify that redirect was not called
        expect(redirect).not.toHaveBeenCalled();

        // Verify that the children are rendered
        expect(result.props.children).toBeDefined();
    });
});
