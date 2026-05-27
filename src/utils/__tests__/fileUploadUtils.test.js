/**
 * @jest-environment jsdom
 */

import { listUserFolder } from "../fileUploadUtils";
import {
    createAppletUserStorageTarget,
    createWorkspacePrivateStorageTarget,
} from "../storageTargets";

global.fetch = jest.fn();

describe("listUserFolder", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        global.fetch.mockResolvedValue({
            ok: true,
            json: async () => ({ files: [], count: 0 }),
        });
    });

    it("serializes appletId for applet-user storage targets", async () => {
        await listUserFolder("user-ctx-1", {
            serverUrl: "http://localhost:3000/media-helper",
            storageTarget: createAppletUserStorageTarget(
                "user-ctx-1",
                "applet-123",
            ),
        });

        const [requestUrl] = global.fetch.mock.calls[0];
        const url = new URL(requestUrl);

        expect(url.pathname).toBe("/media-helper");
        expect(url.searchParams.get("listFolder")).toBe("true");
        expect(url.searchParams.get("userId")).toBe("user-ctx-1");
        expect(url.searchParams.get("fileScope")).toBe("applet-user");
        expect(url.searchParams.get("appletId")).toBe("applet-123");
    });

    it("serializes workspace-private targets with the legacy workspace scope name", async () => {
        await listUserFolder("user-ctx-1", {
            serverUrl: "http://localhost:3000/media-helper",
            storageTarget: createWorkspacePrivateStorageTarget(
                "user-ctx-1",
                "workspace-123",
            ),
        });

        const [requestUrl] = global.fetch.mock.calls[0];
        const url = new URL(requestUrl);

        expect(url.searchParams.get("userId")).toBe("user-ctx-1");
        expect(url.searchParams.get("workspaceId")).toBe("workspace-123");
        expect(url.searchParams.get("fileScope")).toBe("workspace-user-legacy");
    });
});
