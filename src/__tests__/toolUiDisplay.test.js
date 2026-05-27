import ar from "../../config/default/locales/ar.json";
import { getToolUiDescription, getToolUiName } from "../utils/toolUiDisplay";

const KNOWN_CLIENT_TOOLS = [
    "Navigate",
    "SubmitFeedback",
    "OpenCanvasFile",
    "OpenInCanvas",
    "CreateArticle",
    "CreateNewStory",
    "CloseCanvas",
    "CreateApplet",
    "CreateSkill",
    "EditSkill",
    "ListApplets",
    "GetApplet",
    "GetAppletState",
    "OpenAppletDraft",
    "SaveAppletDraftAsVersion",
    "PublishAppletVersion",
    "DeleteAppletVersion",
    "ListAutomations",
    "ReadAutomation",
    "CreateAutomation",
    "UpdateAutomation",
    "RunAutomation",
    "DeleteAutomation",
    "ViewAutomationHtml",
    "UpdateAppletMetadata",
    "UnpublishApplet",
    "GetAppletVersionSource",
    "CopyAppletVersionToDraft",
    "DeleteApplet",
    "SearchChats",
    "GetChatContent",
    "LoadSkill",
    "InspectCanvas",
    "GetCanvasState",
    "ModifyImage",
    "ApplyImageTransform",
    "ReplaceImage",
    "GetImageInfo",
    "ReadImageContent",
    "GetWorkspaceInfo",
    "ListWorkspaces",
];

function tAr(key, opts) {
    if (Object.prototype.hasOwnProperty.call(ar, key)) {
        return ar[key];
    }
    return opts?.defaultValue ?? key;
}

describe("toolUiDisplay", () => {
    it("provides Arabic name/desc keys for all known tools", () => {
        for (const name of KNOWN_CLIENT_TOOLS) {
            expect(typeof ar[`tool_display_${name}_name`]).toBe("string");
            expect(ar[`tool_display_${name}_name`].length).toBeGreaterThan(0);
            expect(typeof ar[`tool_display_${name}_desc`]).toBe("string");
            expect(ar[`tool_display_${name}_desc`].length).toBeGreaterThan(0);
        }
    });

    it("getToolUi* uses translations when available", () => {
        const tool = { function: { name: "Navigate", description: "EN" } };
        const name = getToolUiName(tool, tAr);
        const desc = getToolUiDescription(tool, tAr);
        expect(name).toBe(ar.tool_display_Navigate_name);
        expect(desc).toBe(ar.tool_display_Navigate_desc);
    });

    it("getToolUi* falls back to English default when only defaultValue matters", () => {
        const tool = {
            function: {
                name: "Navigate",
                description: "Fallback long description",
            },
        };
        const tEn = (key, opts) => opts?.defaultValue ?? key;
        expect(getToolUiName(tool, tEn)).toBe("Navigate");
        expect(getToolUiDescription(tool, tEn)).toBe(
            "Fallback long description",
        );
    });
});
