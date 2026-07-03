import {
    buildHtmlWorkspaceRefreshContent,
    isAppletDraftWorkspacePath,
} from "../canvasWorkspaceRefresh";

describe("canvas workspace refresh helpers", () => {
    test("identifies editable applet Draft workspace paths only", () => {
        expect(
            isAppletDraftWorkspacePath(
                "/workspace/files/applets/image-lab.html",
            ),
        ).toBe(true);
        expect(
            isAppletDraftWorkspacePath(
                "/workspace/files/applets/versions/applet-1/v000002.html",
            ),
        ).toBe(false);
        expect(
            isAppletDraftWorkspacePath("/workspace/files/articles/story.html"),
        ).toBe(false);
    });

    test("returns null for unchanged live HTML so refreshes cannot dispatch in a loop", () => {
        expect(
            buildHtmlWorkspaceRefreshContent(
                {
                    type: "html",
                    htmlContent: "<html>same</html>",
                    htmlStatus: "live",
                    appletId: "applet-1",
                    workspacePath: "/workspace/files/applets/image-lab.html",
                    appletActiveVersionIndex: 1,
                    appletActiveVersionNumber: 2,
                    appletIsViewingDraft: false,
                },
                "<html>same</html>",
                () => 123,
            ),
        ).toBeNull();
    });

    test("marks applet Draft as active when a fetched Draft body changes", () => {
        expect(
            buildHtmlWorkspaceRefreshContent(
                {
                    type: "html",
                    htmlContent: "<html>v2 draft</html>",
                    htmlStatus: "live",
                    appletId: "applet-1",
                    workspacePath: "/workspace/files/applets/image-lab.html",
                    appletActiveVersionIndex: 1,
                    appletActiveVersionNumber: 2,
                    appletIsViewingDraft: false,
                },
                "<html>agent edited draft</html>",
                () => 123,
            ),
        ).toEqual({
            htmlContent: "<html>agent edited draft</html>",
            htmlStatus: "live",
            workspaceContentVersion: 123,
            appletActiveVersionIndex: null,
            appletActiveVersionNumber: null,
            appletIsViewingDraft: true,
        });
    });

    test("does not clear saved-version state for saved version file refreshes", () => {
        expect(
            buildHtmlWorkspaceRefreshContent(
                {
                    type: "html",
                    htmlContent: "<html>v2</html>",
                    htmlStatus: "loading",
                    appletId: "applet-1",
                    workspacePath:
                        "/workspace/files/applets/versions/applet-1/v000002.html",
                    appletActiveVersionIndex: 1,
                    appletActiveVersionNumber: 2,
                    appletIsViewingDraft: false,
                },
                "<html>v2 updated read</html>",
                () => 123,
            ),
        ).toEqual({
            htmlContent: "<html>v2 updated read</html>",
            htmlStatus: "live",
        });
    });
});
