/**
 * @jest-environment jsdom
 */

import { listUserFolder, uploadFileToMediaHelper } from "../fileUploadUtils";
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

describe("location-based uploads", () => {
    const OriginalXHR = global.XMLHttpRequest;
    afterEach(() => {
        global.XMLHttpRequest = OriginalXHR;
    });

    it("uploads identical bytes independently to the requested locations without hash lookups", async () => {
        const requests = [];
        global.fetch.mockClear();
        global.XMLHttpRequest = class {
            upload = {};
            status = 200;
            responseText = JSON.stringify({
                url: "https://files.test/new",
                blobPath: "global/file.txt",
            });
            open(method, url) {
                this.method = method;
                this.url = url;
            }
            send(form) {
                requests.push({ url: this.url, form });
                this.onload();
            }
        };
        const file = new File(["same bytes"], "file.txt", {
            type: "text/plain",
        });
        for (const userId of ["first-user", "second-user"]) {
            const result = await uploadFileToMediaHelper(file, {
                userId,
                fileScope: "global",
                checkHash: true,
                serverUrl: "http://localhost:3000/media-helper",
            });
            expect(result.blobPath).toBe("global/file.txt");
            expect(result.hash).toBeUndefined();
        }
        expect(global.fetch).not.toHaveBeenCalled();
        expect(requests).toHaveLength(2);
        requests.forEach(({ url, form }, index) => {
            expect(new URL(url).searchParams.has("hash")).toBe(false);
            expect(form.has("hash")).toBe(false);
            expect(form.get("userId")).toBe(
                index ? "second-user" : "first-user",
            );
        });
    });
});
