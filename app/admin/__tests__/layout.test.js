import React from "react";
import { redirect } from "next/navigation";
import AdminLayout from "../layout";
import { getCurrentUser } from "../../api/utils/auth";

// Mock the next/navigation module
jest.mock("next/navigation", () => ({
    redirect: jest.fn(),
}));

// Mock the auth utility
jest.mock("../../api/utils/auth", () => ({
    getCurrentUser: jest.fn(),
}));

describe("AdminLayout", () => {
    beforeEach(() => {
        // Clear all mocks before each test
        jest.clearAllMocks();
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
