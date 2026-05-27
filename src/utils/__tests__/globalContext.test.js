import {
    buildCanvasWorkflowContext,
    buildGlobalContext,
    buildStoriesAndFilesContext,
    combineContexts,
} from "../globalContext";

describe("globalContext", () => {
    test("uses a balanced canvas workflow primer instead of an article template", () => {
        const context = buildCanvasWorkflowContext();

        expect(context).toContain("## Canvas Workflows");
        expect(context).toContain("SearchAvailableTools");
        expect(context).toContain("CreateArticle");
        expect(context).toContain("CreateApplet");
        expect(context).toContain("LoadSkill");
        expect(context).toContain("SubmitFeedback");
        expect(context).toContain("Standalone generated files");
        expect(context).toContain("/workspace/files/chats/<chatId>/");
        expect(context).toContain("fileRef");
        expect(context).toContain("`articles`");
        expect(context).toContain("`applets`");
        expect(context).toContain(
            "do not call **CreateApplet** to edit an existing applet",
        );
        expect(context).not.toContain("<!DOCTYPE html>");
        expect(context).not.toContain('<meta id="featuredImage"');
    });

    test("keeps the legacy helper name aligned with the canvas workflow context", () => {
        expect(buildStoriesAndFilesContext()).toBe(
            buildCanvasWorkflowContext(),
        );
    });

    test("buildGlobalContext includes page, recent chats, and canvas guidance", () => {
        const context = buildGlobalContext({
            pathname: "/chat",
            currentChatId: "chat-current",
            activeChats: [
                {
                    _id: "chat-current",
                    title: "Current Chat",
                },
                {
                    _id: "chat-old",
                    title: "Older Article Work",
                },
            ],
        });

        expect(context).toContain("You are currently on the page: **/chat**");
        expect(context).toContain("Older Article Work (ID: chat-old)");
        expect(context).not.toContain("Current Chat (ID: chat-current)");
        expect(context).toContain("## Canvas Workflows");
        expect(context).toContain("/workspace/files/chats/chat-current/");
    });

    test("combineContexts appends page-specific context after the global primer", () => {
        const context = combineContexts({
            pathname: "/chat",
            activeChats: [],
            currentChatId: "chat-current",
            pageContext:
                "## Article Canvas Context\n- Workspace path: /workspace/files/articles/story.html",
        });

        expect(context.indexOf("## Canvas Workflows")).toBeGreaterThan(-1);
        expect(context.indexOf("## Article Canvas Context")).toBeGreaterThan(
            context.indexOf("## Canvas Workflows"),
        );
    });
});
