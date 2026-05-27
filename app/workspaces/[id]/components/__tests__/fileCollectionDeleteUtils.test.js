/**
 * @jest-environment jsdom
 */

import { deleteAppletUserFileFromWorkspace } from "../fileCollectionDeleteUtils";

global.fetch = jest.fn();

describe("deleteAppletUserFileFromWorkspace", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("uses the workspace applet delete route", async () => {
        global.fetch.mockResolvedValue({
            ok: true,
            json: async () => ({ success: true }),
        });

        await deleteAppletUserFileFromWorkspace({
            workspaceId: "workspace-123",
            filename: "My File.pdf",
        });

        expect(global.fetch).toHaveBeenCalledWith(
            "/api/workspaces/workspace-123/applet/files?filename=My%20File.pdf",
            { method: "DELETE" },
        );
    });

    it("throws the API error when deletion fails", async () => {
        global.fetch.mockResolvedValue({
            ok: false,
            json: async () => ({ error: "File not found" }),
        });

        await expect(
            deleteAppletUserFileFromWorkspace({
                workspaceId: "workspace-123",
                filename: "missing.pdf",
            }),
        ).rejects.toThrow("File not found");
    });
});
