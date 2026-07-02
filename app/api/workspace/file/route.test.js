/**
 * @jest-environment node
 */

import { GET as queryGet } from "./route";
import { GET as directGet } from "../../../workspace/files/[...path]/route";
import { getCurrentUser } from "../../utils/auth";

jest.mock("../../utils/auth", () => ({
    getCurrentUser: jest.fn(),
}));

describe("workspace file routes", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        getCurrentUser.mockResolvedValue({
            _id: "user-1",
            contextId: "user-context-1",
        });
        global.fetch = jest.fn();
    });

    function mockWorkspaceFile(content = "file-bytes", type = "image/jpeg") {
        global.fetch
            .mockResolvedValueOnce(
                new Response(
                    JSON.stringify({
                        shortLivedUrl: "https://storage.test/file",
                    }),
                    {
                        status: 200,
                        headers: { "content-type": "application/json" },
                    },
                ),
            )
            .mockResolvedValueOnce(
                new Response(content, {
                    status: 200,
                    headers: { "content-type": type },
                }),
            );
    }

    test("serves workspace files through the existing query route", async () => {
        mockWorkspaceFile("<html>draft</html>", "text/html");

        const response = await queryGet(
            new Request(
                "http://localhost/api/workspace/file?path=/workspace/files/applets/weather.html",
            ),
        );

        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toBe("text/html");
        expect(await response.text()).toBe("<html>draft</html>");
        const lookupUrl = new URL(global.fetch.mock.calls[0][0]);
        expect(lookupUrl.searchParams.get("blobPath")).toBe(
            "applets/weather.html",
        );
        expect(lookupUrl.searchParams.get("userId")).toBe("user-context-1");
    });

    test("serves /workspace/files paths so iframe-relative applet assets resolve", async () => {
        mockWorkspaceFile("jpeg-bytes", "image/jpeg");

        const response = await directGet(
            new Request(
                "http://localhost/workspace/files/applets/assets/text-ai-launcher/banner.jpg",
            ),
            {
                params: {
                    path: [
                        "applets",
                        "assets",
                        "text-ai-launcher",
                        "banner.jpg",
                    ],
                },
            },
        );

        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toBe("image/jpeg");
        expect(await response.text()).toBe("jpeg-bytes");
        const lookupUrl = new URL(global.fetch.mock.calls[0][0]);
        expect(lookupUrl.searchParams.get("blobPath")).toBe(
            "applets/assets/text-ai-launcher/banner.jpg",
        );
        expect(lookupUrl.searchParams.get("userId")).toBe("user-context-1");
    });
});
