/**
 * @jest-environment node
 */

jest.mock("../../models/applet-shared-file.js", () => ({
    __esModule: true,
    default: {
        findOneAndUpdate: jest.fn(),
        findOne: jest.fn(),
    },
}));

jest.mock("../../models/prompt.js", () => ({
    __esModule: true,
    default: {
        find: jest.fn(),
    },
}));

const AppletSharedFile = require("../../models/applet-shared-file.js").default;
const Prompt = require("../../models/prompt.js").default;
const {
    collectLegacyAppletSharedFileIds,
    ensureAppletSharedFileStore,
} = require("../applet-shared-file-utils.js");

describe("applet-shared-file-utils", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe("collectLegacyAppletSharedFileIds", () => {
        it("collects the union of workspace files and prompt files", async () => {
            Prompt.find.mockReturnValue({
                select: jest.fn().mockResolvedValue([
                    { files: ["prompt-file-1", "shared-file-2"] },
                    {
                        files: [
                            {
                                toString: () => "prompt-file-2",
                            },
                        ],
                    },
                ]),
            });

            const fileIds = await collectLegacyAppletSharedFileIds({
                files: [
                    {
                        toString: () => "shared-file-1",
                    },
                    "shared-file-2",
                ],
                prompts: ["prompt-1", "prompt-2"],
            });

            expect(fileIds).toEqual([
                "shared-file-1",
                "shared-file-2",
                "prompt-file-1",
                "prompt-file-2",
            ]);
        });

        it("uses populated prompt documents without querying Prompt again", async () => {
            const fileIds = await collectLegacyAppletSharedFileIds({
                files: ["shared-file-1"],
                prompts: [
                    { files: ["prompt-file-1", "shared-file-1"] },
                    { files: ["prompt-file-2"] },
                ],
            });

            expect(Prompt.find).not.toHaveBeenCalled();
            expect(fileIds).toEqual([
                "shared-file-1",
                "prompt-file-1",
                "prompt-file-2",
            ]);
        });
    });

    describe("ensureAppletSharedFileStore", () => {
        it("bootstraps the applet shared store from legacy workspace and prompt references", async () => {
            Prompt.find.mockReturnValue({
                select: jest
                    .fn()
                    .mockResolvedValue([
                        { files: ["prompt-file-1"] },
                        { files: ["prompt-file-2"] },
                    ]),
            });

            const sharedStore = {
                files: [{ _id: "shared-file-1" }],
            };
            AppletSharedFile.findOne.mockReturnValue({
                populate: jest.fn().mockResolvedValue(sharedStore),
            });

            const result = await ensureAppletSharedFileStore({
                applet: "applet-123",
                files: ["shared-file-1"],
                prompts: ["prompt-1", "prompt-2"],
            });

            expect(AppletSharedFile.findOneAndUpdate).toHaveBeenCalledWith(
                { appletId: "applet-123" },
                {
                    $addToSet: {
                        files: {
                            $each: [
                                "shared-file-1",
                                "prompt-file-1",
                                "prompt-file-2",
                            ],
                        },
                    },
                },
                expect.objectContaining({
                    new: true,
                    upsert: true,
                    runValidators: true,
                }),
            );
            expect(AppletSharedFile.findOne).toHaveBeenCalledWith({
                appletId: "applet-123",
            });
            expect(result).toBe(sharedStore);
        });
    });
});
