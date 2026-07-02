import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import HomeAppletDirectory, {
    getGroupEndInsertIndex,
    resolveWidgetDropIndex,
} from "./HomeAppletDirectory";
import { arrayMove } from "@dnd-kit/sortable";

const mockPush = jest.fn();
const mockMutateDigest = jest.fn();

const digestBlocks = [
    {
        _id: "digest-1",
        title: "Market Brief",
        prompt: "Summarize markets",
        content: JSON.stringify({ payload: "Digest content" }),
        updatedAt: "2026-06-15T00:00:00.000Z",
    },
    {
        _id: "automation-block-1",
        title: "Nightly Report",
        automationId: "automation-1",
        automation: { _id: "automation-1" },
        automationRun: {
            _id: "run-1",
            status: "completed",
            completedAt: "2026-06-15T01:00:00.000Z",
        },
    },
];
let mockCurrentDigestBlocks = digestBlocks;
let scrollIntoViewMock;

const mockAutomations = [
    {
        _id: "automation-1",
        name: "Nightly Report",
        description: "Already on Home",
    },
    {
        _id: "automation-2",
        name: "Weekly Automation",
        description: "Addable automation",
    },
];

const homeApplets = [
    {
        appletId: "applet-1",
        name: "First Home Applet",
        slug: "first-home-applet",
        listedInStore: true,
        category: "Utility",
        tags: ["briefing"],
        imageLightUrl: "https://images.example/home-applet-light.webp",
        imageDarkUrl: "https://images.example/home-applet-dark.webp",
        authorName: "editor@example.com",
        updatedAt: "2026-06-15T00:00:00.000Z",
        latestVersionIndex: 0,
    },
    {
        appletId: "applet-2",
        name: "Second Home Applet",
        listedInStore: false,
        updatedAt: "2026-06-14T00:00:00.000Z",
        publishedVersionIndex: 1,
    },
];

jest.mock("next/navigation", () => ({
    __esModule: true,
    useRouter: () => ({
        push: mockPush,
    }),
}));

jest.mock("react-i18next", () => ({
    __esModule: true,
    useTranslation: () => ({
        t: (key, values) => {
            if (!values) return key;
            return Object.entries(values).reduce(
                (text, [name, value]) =>
                    text.replace(`{{${name}}}`, String(value)),
                key,
            );
        },
    }),
}));

jest.mock("@/src/contexts/LanguageProvider", () => {
    const React = require("react");
    return {
        __esModule: true,
        LanguageContext: React.createContext({ direction: "ltr" }),
    };
});

jest.mock("react-toastify", () => ({
    __esModule: true,
    toast: {
        error: jest.fn(),
    },
}));

jest.mock("../../queries/digest", () => ({
    __esModule: true,
    useCurrentUserDigest: () => ({
        data: { blocks: mockCurrentDigestBlocks },
    }),
    useUpdateCurrentUserDigest: () => ({
        mutateAsync: mockMutateDigest,
    }),
}));

jest.mock("@/src/hooks/useAutomations", () => ({
    __esModule: true,
    useAutomations: () => ({
        data: mockAutomations,
    }),
}));

jest.mock("@/src/components/automations/CreateAutomationDialog", () => ({
    __esModule: true,
    default: ({ open, onOpenChange, onCreated }) =>
        open ? (
            <div role="dialog" aria-label="New automation">
                <button
                    type="button"
                    onClick={() => {
                        onCreated?.(
                            { _id: "automation-new", name: "New Automation" },
                            { customize: false },
                        );
                        onOpenChange(false);
                    }}
                >
                    Create
                </button>
            </div>
        ) : null,
}));

jest.mock("./DigestBlock", () => ({
    __esModule: true,
    default: ({ block, className }) => (
        <section className={className} data-testid={`home-block-${block._id}`}>
            {block.title}
        </section>
    ),
    FullscreenBlock: ({ block, onClose }) => (
        <section role="dialog" aria-label={block.title}>
            <button type="button" onClick={onClose}>
                Close
            </button>
            {block.title}
        </section>
    ),
}));

function homeItemKey(item) {
    if (item.type === "group") return `group:${item.groupId}`;
    if (item.type === "applet") return `applet:${item.appletId}`;
    return `${item.type}:${item.blockId || item.automationId}`;
}

function homeItemPutCalls() {
    return global.fetch.mock.calls.filter(
        ([url, options]) =>
            url === "/api/users/me/home-items" && options?.method === "PUT",
    );
}

function renderDirectory(props = {}) {
    return render(
        <HomeAppletDirectory
            applets={homeApplets}
            initialHomeItems={[
                {
                    type: "digest",
                    blockId: "digest-1",
                    size: "large",
                    order: 0,
                },
                {
                    type: "applet",
                    appletId: "applet-1",
                    size: "large",
                    order: 1,
                },
                {
                    type: "automation",
                    blockId: "automation-block-1",
                    automationId: "automation-1",
                    size: "mini",
                    order: 2,
                },
            ]}
            initialHomeItemsConfigured
            initialHomeItemsDefaultGroupMigrated
            {...props}
        />,
    );
}

function openGroupAddMenu(index = 0) {
    fireEvent.click(screen.getAllByRole("button", { name: "Add" })[index]);
}

async function addGroupAndOpenAddMenu() {
    fireEvent.click(screen.getByRole("button", { name: "Add group" }));
    await waitFor(() => {
        expect(homeItemPutCalls()).toHaveLength(1);
    });
    await waitFor(() => {
        expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument();
    });
    openGroupAddMenu();
}

async function addGroupAndChooseOption(label) {
    await addGroupAndOpenAddMenu();
    chooseGroupAddOption(label);
}

function chooseGroupAddOption(label) {
    fireEvent.click(screen.getByRole("menuitem", { name: label }));
}

describe("HomeAppletDirectory", () => {
    describe("cross-group drag helpers", () => {
        const layout = [
            { type: "group", groupId: "g1", title: "First" },
            { type: "digest", blockId: "digest-1" },
            { type: "group", groupId: "g2", title: "Second" },
            { type: "applet", appletId: "applet-1" },
        ];

        test("resolves dropping a widget onto another group's item", () => {
            const move = resolveWidgetDropIndex(
                layout,
                "digest:digest-1",
                "applet:applet-1",
            );
            expect(move).toEqual({ currentIndex: 1, targetIndex: 3 });
            expect(
                arrayMove(layout, move.currentIndex, move.targetIndex).map(
                    homeItemKey,
                ),
            ).toEqual([
                "group:g1",
                "group:g2",
                "applet:applet-1",
                "digest:digest-1",
            ]);
        });

        test("resolves dropping a widget into an empty group drop zone", () => {
            const emptySecondGroup = [
                { type: "group", groupId: "g1", title: "First" },
                { type: "digest", blockId: "digest-1" },
                { type: "group", groupId: "g2", title: "Second" },
            ];
            const move = resolveWidgetDropIndex(
                emptySecondGroup,
                "digest:digest-1",
                "group-drop:g2",
            );
            expect(move).toEqual({ currentIndex: 1, targetIndex: 3 });
        });

        test("finds the end insert index for a group", () => {
            expect(getGroupEndInsertIndex(layout, "g1")).toBe(2);
            expect(getGroupEndInsertIndex(layout, "g2")).toBe(4);
        });
    });

    beforeEach(() => {
        jest.clearAllMocks();
        scrollIntoViewMock = jest.fn();
        Element.prototype.scrollIntoView = scrollIntoViewMock;
        mockCurrentDigestBlocks = digestBlocks;
        mockMutateDigest.mockImplementation(async ({ blocks }) => {
            mockCurrentDigestBlocks = blocks.map((block) => {
                if (block._id) return block;
                if (block.automationId) {
                    return {
                        ...block,
                        _id: "automation-block-2",
                        automation: { _id: block.automationId },
                        automationRun: null,
                    };
                }
                return {
                    ...block,
                    _id: "digest-2",
                };
            });
            return { blocks: mockCurrentDigestBlocks };
        });
        global.fetch = jest.fn((url, options = {}) => {
            if (
                url === "/api/users/me/home-items" &&
                options.method === "PUT"
            ) {
                const body = JSON.parse(options.body);
                return Promise.resolve({
                    ok: true,
                    json: async () => ({
                        homeItems: body.homeItems,
                        homeItemsConfigured: true,
                        homeItemsDefaultGroupMigrated: true,
                    }),
                });
            }
            if (url === "/api/canvas-applets") {
                return Promise.resolve({
                    ok: true,
                    json: async () => ({
                        applets: [
                            {
                                _id: "applet-3",
                                version: 2,
                                name: "Third Home Applet",
                                updatedAt: "2026-06-13T00:00:00.000Z",
                                app: {
                                    name: "Third Home Applet",
                                    category: "Planning",
                                },
                            },
                            {
                                _id: "applet-4",
                                version: 2,
                                name: "Fourth Home Applet",
                                updatedAt: "2026-06-14T00:00:00.000Z",
                                app: {
                                    name: "Fourth Home Applet",
                                    category: "Planning",
                                },
                            },
                        ],
                    }),
                });
            }
            return Promise.resolve({
                ok: false,
                json: async () => ({}),
            });
        });
    });

    test("launches applets outside edit mode", () => {
        renderDirectory();

        fireEvent.click(screen.getByText("First Home Applet"));

        expect(mockPush).toHaveBeenCalledWith("/apps/first-home-applet");
    });

    test("does not show applet authors on Home cards", () => {
        renderDirectory();

        expect(screen.getByText("First Home Applet")).toBeInTheDocument();
        expect(
            screen.queryByText("editor@example.com"),
        ).not.toBeInTheDocument();
    });

    test("uses the shared image card treatment for mini applet cards", () => {
        renderDirectory({
            initialHomeItems: [
                {
                    type: "applet",
                    appletId: "applet-1",
                    size: "mini",
                    order: 0,
                },
            ],
            initialHomeItemsConfigured: true,
        });

        expect(
            screen.getByRole("heading", {
                name: "First Home Applet",
            }),
        ).toBeInTheDocument();
        expect(screen.getByTestId("app-catalog-card")).toHaveClass(
            "bg-gray-950",
            "!min-h-0",
        );
        expect(screen.getByTestId("app-catalog-card-image")).toHaveAttribute(
            "src",
            "https://images.example/home-applet-light.webp",
        );
        expect(screen.getByTestId("app-catalog-card-overlay")).toHaveClass(
            "bg-[linear-gradient(180deg,rgba(255,255,255,0)_0%,rgba(255,255,255,0)_40%,rgba(255,255,255,0.8)_66%,rgba(255,255,255,0.94)_100%)]",
        );
        expect(screen.getByText("Utility")).toBeInTheDocument();
        expect(screen.queryByText("briefing")).not.toBeInTheDocument();
    });

    test("supports drag handles, removal, and size changes on the mixed home item endpoint", async () => {
        renderDirectory();

        fireEvent.click(screen.getByRole("button", { name: "Edit" }));
        expect(
            screen.getAllByRole("button", { name: "Drag to reorder Home" }),
        ).toHaveLength(3);

        fireEvent.click(
            screen.getAllByRole("button", { name: "Make mini" })[1],
        );
        await waitFor(() => {
            expect(homeItemPutCalls()).toHaveLength(1);
        });
        let body = JSON.parse(homeItemPutCalls()[0][1].body);
        expect(body.homeItems[1]).toMatchObject({
            type: "applet",
            appletId: "applet-1",
            size: "mini",
        });

        await waitFor(() => {
            expect(
                screen.getAllByRole("button", {
                    name: "Remove from Home",
                })[1],
            ).not.toBeDisabled();
        });
        fireEvent.click(
            screen.getAllByRole("button", { name: "Remove from Home" })[1],
        );
        await waitFor(() => {
            expect(homeItemPutCalls()).toHaveLength(2);
        });
        body = JSON.parse(homeItemPutCalls()[1][1].body);
        expect(body.homeItems.map(homeItemKey)).toEqual([
            "digest:digest-1",
            "automation:automation-block-1",
        ]);
    });

    test("adds digest cards from Home edit controls", async () => {
        renderDirectory({
            initialHomeItems: [],
            initialHomeItemsConfigured: true,
        });

        fireEvent.click(screen.getByRole("button", { name: "Edit" }));
        await addGroupAndChooseOption("Add digest");

        expect(
            screen.getByRole("dialog", { name: "Add digest" }),
        ).toBeInTheDocument();
        fireEvent.change(screen.getByPlaceholderText("Prompt"), {
            target: { value: "Daily markets" },
        });
        fireEvent.click(screen.getByRole("button", { name: "Add digest" }));

        await waitFor(() => {
            expect(mockMutateDigest).toHaveBeenCalledWith({
                blocks: [
                    ...digestBlocks,
                    expect.objectContaining({
                        title: "",
                        prompt: "Daily markets",
                    }),
                ],
            });
        });
        const body = JSON.parse(homeItemPutCalls()[1][1].body);
        expect(body.homeItems).toEqual([
            expect.objectContaining({
                type: "group",
                title: "New group",
            }),
            expect.objectContaining({
                type: "digest",
                blockId: "digest-2",
                size: "large",
            }),
        ]);
        await waitFor(() => {
            expect(scrollIntoViewMock).toHaveBeenCalled();
        });
    });

    test("edits digest cards from Home edit mode", async () => {
        renderDirectory();

        fireEvent.click(screen.getByRole("button", { name: "Edit" }));
        fireEvent.click(
            screen.getAllByRole("button", { name: "Edit widget" })[0],
        );
        fireEvent.change(screen.getByPlaceholderText("Title"), {
            target: { value: "Morning Brief" },
        });
        fireEvent.click(screen.getByRole("button", { name: "Save" }));

        await waitFor(() => {
            expect(mockMutateDigest).toHaveBeenCalledWith({
                blocks: expect.arrayContaining([
                    expect.objectContaining({
                        _id: "digest-1",
                        title: "Morning Brief",
                    }),
                ]),
            });
        });
        expect(homeItemPutCalls()).toHaveLength(0);
    });

    test("edits automation widgets from Home edit mode", async () => {
        renderDirectory();

        fireEvent.click(screen.getByRole("button", { name: "Edit" }));
        fireEvent.click(
            screen.getAllByRole("button", { name: "Edit widget" })[1],
        );
        fireEvent.change(screen.getByRole("combobox"), {
            target: { value: "automation-2" },
        });
        fireEvent.click(screen.getByRole("button", { name: "Save" }));

        await waitFor(() => {
            expect(mockMutateDigest).toHaveBeenCalledWith({
                blocks: expect.arrayContaining([
                    expect.objectContaining({
                        _id: "automation-block-1",
                        automationId: "automation-2",
                    }),
                ]),
            });
        });
        await waitFor(() => {
            expect(homeItemPutCalls()).toHaveLength(1);
        });
        const body = JSON.parse(homeItemPutCalls()[0][1].body);
        expect(body.homeItems[2]).toMatchObject({
            type: "automation",
            blockId: "automation-block-1",
            automationId: "automation-2",
        });
    });

    test("adds and renames group titles from Home edit controls", async () => {
        renderDirectory({
            initialHomeItems: [],
            initialHomeItemsConfigured: true,
        });

        fireEvent.click(screen.getByRole("button", { name: "Edit" }));
        fireEvent.click(screen.getByRole("button", { name: "Add group" }));

        await waitFor(() => {
            expect(homeItemPutCalls()).toHaveLength(1);
        });
        let body = JSON.parse(homeItemPutCalls()[0][1].body);
        expect(body.homeItems).toEqual([
            expect.objectContaining({
                type: "group",
                title: "New group",
            }),
        ]);

        fireEvent.click(
            await screen.findByRole("button", {
                name: "Click to edit group title",
            }),
        );
        const titleInput = await screen.findByLabelText("Group title");
        fireEvent.change(titleInput, { target: { value: "Newsroom" } });
        fireEvent.blur(titleInput);

        await waitFor(() => {
            expect(homeItemPutCalls()).toHaveLength(2);
        });
        body = JSON.parse(homeItemPutCalls()[1][1].body);
        expect(body.homeItems).toEqual([
            expect.objectContaining({
                type: "group",
                title: "Newsroom",
            }),
        ]);
    });

    test("uses the default Home title as an editable group item", async () => {
        renderDirectory({
            initialHomeItems: [],
            initialHomeItemsConfigured: false,
            initialHomeItemsDefaultGroupMigrated: false,
        });

        expect(
            screen.getByRole("heading", { name: "Home", level: 2 }),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole("heading", { name: "Home", level: 1 }),
        ).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "Edit" }));
        fireEvent.click(
            await screen.findByRole("button", {
                name: "Click to edit group title",
            }),
        );

        const titleInput = screen.getByLabelText("Group title");
        expect(titleInput).toHaveValue("Home");

        fireEvent.change(titleInput, { target: { value: "Command Center" } });
        fireEvent.blur(titleInput);

        await waitFor(() => {
            expect(homeItemPutCalls()).toHaveLength(1);
        });
        const body = JSON.parse(homeItemPutCalls()[0][1].body);
        expect(body.homeItems[0]).toMatchObject({
            type: "group",
            groupId: "home-default",
            title: "Command Center",
        });
    });

    test("opens mini automation cards fullscreen when only automationId is available", () => {
        mockCurrentDigestBlocks = digestBlocks.map((block) =>
            block._id === "automation-block-1"
                ? {
                      ...block,
                      automation: null,
                  }
                : block,
        );

        renderDirectory();

        fireEvent.click(
            screen.getByRole("button", {
                name: "Full screen: Nightly Report",
            }),
        );

        expect(
            screen.getByRole("dialog", { name: "Nightly Report" }),
        ).toBeInTheDocument();
    });

    test("migrates configured layouts without groups to the editable Home title", async () => {
        renderDirectory({
            initialHomeItems: [
                {
                    type: "digest",
                    blockId: "digest-1",
                    size: "large",
                    order: 0,
                },
            ],
            initialHomeItemsConfigured: true,
            initialHomeItemsDefaultGroupMigrated: false,
        });

        expect(
            screen.getByRole("heading", { name: "Home", level: 2 }),
        ).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "Edit" }));
        fireEvent.click(screen.getByRole("button", { name: "Remove group" }));

        await waitFor(() => {
            expect(homeItemPutCalls()).toHaveLength(1);
        });
        const body = JSON.parse(homeItemPutCalls()[0][1].body);
        expect(body.homeItems.map(homeItemKey)).toEqual(["digest:digest-1"]);
    });

    test("adds automation cards from Home edit controls", async () => {
        renderDirectory({
            initialHomeItems: [],
            initialHomeItemsConfigured: true,
        });

        fireEvent.click(screen.getByRole("button", { name: "Edit" }));
        await addGroupAndChooseOption("Add automation");

        expect(
            screen.getByRole("dialog", { name: "Add automation" }),
        ).toBeInTheDocument();
        fireEvent.change(screen.getByRole("combobox"), {
            target: { value: "automation-2" },
        });
        fireEvent.click(screen.getByRole("button", { name: "Add automation" }));

        await waitFor(() => {
            expect(mockMutateDigest).toHaveBeenLastCalledWith({
                blocks: [
                    ...digestBlocks,
                    expect.objectContaining({
                        title: "",
                        prompt: "",
                        automationId: "automation-2",
                    }),
                ],
            });
        });
        const body = JSON.parse(homeItemPutCalls()[1][1].body);
        expect(body.homeItems).toEqual([
            expect.objectContaining({
                type: "group",
                title: "New group",
            }),
            expect.objectContaining({
                type: "automation",
                blockId: "automation-block-2",
                automationId: "automation-2",
            }),
        ]);
    });

    test("creates a new automation from Home add controls", async () => {
        renderDirectory({
            initialHomeItems: [],
            initialHomeItemsConfigured: true,
        });

        fireEvent.click(screen.getByRole("button", { name: "Edit" }));
        await addGroupAndChooseOption("Add automation");
        fireEvent.click(screen.getByRole("button", { name: "New automation" }));
        fireEvent.click(screen.getByRole("button", { name: "Create" }));

        await waitFor(() => {
            expect(mockMutateDigest).toHaveBeenLastCalledWith({
                blocks: [
                    ...digestBlocks,
                    expect.objectContaining({
                        title: "New Automation",
                        automationId: "automation-new",
                    }),
                ],
            });
        });
        const body = JSON.parse(homeItemPutCalls()[1][1].body);
        expect(body.homeItems).toEqual([
            expect.objectContaining({
                type: "group",
                title: "New group",
            }),
            expect.objectContaining({
                type: "automation",
                blockId: "automation-block-2",
                automationId: "automation-new",
            }),
        ]);
    });

    test("adds applet cards from Home edit controls", async () => {
        renderDirectory({
            initialHomeItems: [],
            initialHomeItemsConfigured: true,
        });

        fireEvent.click(screen.getByRole("button", { name: "Edit" }));
        await addGroupAndOpenAddMenu();
        chooseGroupAddOption("Add applet");
        expect(
            await screen.findByText("Third Home Applet"),
        ).toBeInTheDocument();
        expect(screen.getByText("Fourth Home Applet")).toBeInTheDocument();
        expect(
            screen.queryByRole("button", { name: "Load applets" }),
        ).not.toBeInTheDocument();
        expect(screen.queryByText("Weekly Automation")).not.toBeInTheDocument();

        const fetchWithImmediatePut = global.fetch;
        let resolveAdd;
        global.fetch = jest.fn((url, options = {}) => {
            if (
                url === "/api/users/me/home-items" &&
                options.method === "PUT"
            ) {
                return new Promise((resolve) => {
                    resolveAdd = () => {
                        const body = JSON.parse(options.body);
                        resolve({
                            ok: true,
                            json: async () => ({
                                homeItems: body.homeItems,
                                homeItemsConfigured: true,
                                homeItemsDefaultGroupMigrated: true,
                            }),
                        });
                    };
                });
            }
            return fetchWithImmediatePut(url, options);
        });

        fireEvent.click(
            screen.getByRole("button", { name: "Add Third Home Applet" }),
        );
        fireEvent.click(
            screen.getByRole("button", { name: "Add Fourth Home Applet" }),
        );
        expect(
            screen.getByRole("button", { name: "Remove Third Home Applet" }),
        ).toBeInTheDocument();
        expect(screen.getAllByText("Added")).toHaveLength(2);
        const pickerAddButton = screen.getByTestId("app-picker-add-button");
        fireEvent.click(pickerAddButton);

        expect(pickerAddButton).toHaveAttribute("aria-busy", "true");
        resolveAdd();

        await waitFor(() => {
            expect(
                global.fetch.mock.calls.some(
                    ([url]) => url === "/api/users/me/home-items",
                ),
            ).toBe(true);
        });
        const body = JSON.parse(
            global.fetch.mock.calls.find(
                ([url]) => url === "/api/users/me/home-items",
            )[1].body,
        );
        expect(body.homeItems).toEqual([
            expect.objectContaining({
                type: "group",
                title: "New group",
            }),
            expect.objectContaining({
                type: "applet",
                appletId: "applet-3",
            }),
            expect.objectContaining({
                type: "applet",
                appletId: "applet-4",
            }),
        ]);
        await waitFor(() => {
            expect(scrollIntoViewMock).toHaveBeenCalled();
        });
    });

    test("shows a placeholder when the home page has no groups or items", () => {
        renderDirectory({
            initialHomeItems: [],
            initialHomeItemsConfigured: true,
            initialHomeItemsDefaultGroupMigrated: true,
        });

        expect(
            screen.getByRole("heading", {
                name: "Your home page is empty.",
            }),
        ).toBeInTheDocument();
        expect(
            screen.getByText(
                "Click Edit to add groups and pin applets, digests, and automations.",
            ),
        ).toBeInTheDocument();
    });

    test("shows edit-mode guidance when the home page is completely empty", () => {
        renderDirectory({
            initialHomeItems: [],
            initialHomeItemsConfigured: true,
            initialHomeItemsDefaultGroupMigrated: true,
        });

        fireEvent.click(screen.getByRole("button", { name: "Edit" }));

        expect(
            screen.getByText("Add a group to start building your home page."),
        ).toBeInTheDocument();
    });

    test("shows a placeholder inside empty groups", () => {
        renderDirectory({
            initialHomeItems: [
                {
                    type: "group",
                    groupId: "empty-group",
                    title: "Empty section",
                    order: 0,
                },
            ],
            initialHomeItemsConfigured: true,
            initialHomeItemsDefaultGroupMigrated: true,
        });

        expect(screen.getByText("This group is empty.")).toBeInTheDocument();
    });
});
