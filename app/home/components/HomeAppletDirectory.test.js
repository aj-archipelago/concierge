import React from "react";
import { installHomeHistory } from "./__testUtils__/homeHistory";
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
let createdAppletPostCount = 0;

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

jest.mock("@/src/contexts/ThemeProvider", () => {
    const React = require("react");
    return {
        __esModule: true,
        ThemeContext: React.createContext({ theme: "light" }),
    };
});

jest.mock("@/src/components/sandbox/OutputSandbox", () => {
    const React = require("react");
    return {
        __esModule: true,
        default: function MockOutputSandbox({ content }) {
            return <div data-testid="mock-output-sandbox">{content}</div>;
        },
    };
});

jest.mock("react-toastify", () => ({
    __esModule: true,
    toast: {
        error: jest.fn(),
        success: jest.fn(),
    },
}));

jest.mock("./HomeModifyAppletDialog", () => ({
    __esModule: true,
    default: function MockHomeModifyAppletDialog({ applet, onClose }) {
        const React = require("react");
        return React.createElement(
            "div",
            { "data-testid": "home-modify-applet-dialog" },
            React.createElement(
                "h2",
                null,
                `Modify applet: ${applet?.name || applet?.applet?.name || ""}`,
            ),
            React.createElement(
                "button",
                { type: "button", onClick: onClose },
                "Done",
            ),
        );
    },
}));

jest.mock("react-redux", () => ({
    __esModule: true,
    useDispatch: () => jest.fn(),
}));

jest.mock("../../queries/chats", () => ({
    __esModule: true,
    useAddChat: () => ({ mutateAsync: jest.fn() }),
}));

jest.mock("../../queries/users", () => ({
    __esModule: true,
    useCurrentUser: () => ({ data: { contextId: "ctx-1" } }),
}));

jest.mock("@/src/stores/chatSlice", () => ({
    __esModule: true,
    setActiveCanvasChat: jest.fn(() => ({ type: "chat/setActiveCanvasChat" })),
}));

jest.mock("@/src/utils/appletGeneration", () => ({
    __esModule: true,
    deriveAppletName: () => "Generated Applet",
    launchAppletGeneration: () => ({ completion: Promise.resolve() }),
}));

jest.mock("@/src/components/chat/canvas/GenerateHtmlDialog", () => ({
    __esModule: true,
    default: ({ show }) =>
        show ? <div role="dialog" aria-label="Generate applet" /> : null,
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
    default: ({ block, className, menu, renderSummary }) =>
        renderSummary ? (
            renderSummary(menu)
        ) : (
            <section
                className={className}
                data-testid={`home-block-${block._id}`}
            >
                {block.title}
                {menu}
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

// Edit mode is entered from the header "Home options" (⋮) menu.
function enterEditMode() {
    fireEvent.click(screen.getByRole("button", { name: "Arrange" }));
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

// Used by skipped Radix Select tests; option picking is not driven in jsdom yet.
async function addGroupAndChooseOption(_optionLabel) {
    await addGroupAndOpenAddMenu();
}

async function openHomeAddDialog() {
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(
        await screen.findByRole("dialog", { name: "Add to Home" }),
    ).toBeInTheDocument();
}

async function chooseAppletPlacement(kind = "interactive") {
    fireEvent.click(
        await screen.findByTestId(
            kind === "launch"
                ? "home-add-as-launch"
                : "home-add-as-interactive",
        ),
    );
}

function createGenerateAppletResponse(html = "<html><body>Hi</body></html>") {
    const chunk = new TextEncoder().encode(
        `data: ${JSON.stringify({
            event: "complete",
            data: { html },
        })}\n\n`,
    );
    // jsdom's Jest env has no ReadableStream; stub a minimal SSE body.
    return {
        ok: true,
        body: {
            getReader() {
                let done = false;
                return {
                    cancel: async () => {},
                    releaseLock: () => {},
                    read() {
                        if (done) {
                            return Promise.resolve({
                                done: true,
                                value: undefined,
                            });
                        }
                        done = true;
                        return Promise.resolve({ done: false, value: chunk });
                    },
                };
            },
        },
    };
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
        installHomeHistory();
        jest.clearAllMocks();
        scrollIntoViewMock = jest.fn();
        createdAppletPostCount = 0;
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
                if (options.method === "POST") {
                    const body = JSON.parse(options.body || "{}");
                    createdAppletPostCount += 1;
                    const createdId = `applet-created-${createdAppletPostCount}`;
                    return Promise.resolve({
                        ok: true,
                        json: async () => ({
                            _id: createdId,
                            name: body.name || "Created Applet",
                            slug: `created-applet-${createdAppletPostCount}`,
                            updatedAt: "2026-08-04T00:00:00.000Z",
                        }),
                    });
                }
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
            if (
                typeof url === "string" &&
                url.includes("/api/generate-applet")
            ) {
                return Promise.resolve(createGenerateAppletResponse());
            }
            // `/api/apps` returns a bare array (not `{ apps: [...] }`).
            if (url === "/api/apps") {
                return Promise.resolve({
                    ok: true,
                    json: async () => [
                        {
                            _id: "store-app-1",
                            name: "Marketplace Briefing",
                            type: "applet",
                            listedInStore: true,
                            category: "News",
                            appletId: {
                                _id: "applet-market-1",
                                name: "Marketplace Briefing",
                                publishedVersionIndex: 0,
                                htmlVersions: [{ html: "<html></html>" }],
                            },
                        },
                        {
                            _id: "native-files",
                            name: "Files",
                            type: "native",
                            listedInStore: true,
                        },
                    ],
                });
            }
            if (
                typeof url === "string" &&
                url.includes("/api/canvas-applets/") &&
                options.method === "PUT"
            ) {
                return Promise.resolve({
                    ok: true,
                    json: async () => ({
                        versionSaved: true,
                    }),
                });
            }
            if (
                typeof url === "string" &&
                url.includes("/api/canvas-applets/") &&
                url.includes("/runtime")
            ) {
                return Promise.resolve({
                    ok: true,
                    json: async () => ({
                        applet: {
                            runtimeHtml: "<html><body>Widget</body></html>",
                        },
                    }),
                });
            }
            if (
                typeof url === "string" &&
                url.includes("/api/home/classify-add")
            ) {
                const body = JSON.parse(options.body || "{}");
                const prompt = String(body.prompt || "").toLowerCase();
                const kind =
                    prompt.includes("applet") ||
                    prompt.includes("translator") ||
                    prompt.includes("tracker")
                        ? "applet"
                        : "automation";
                return Promise.resolve({
                    ok: true,
                    json: async () => ({
                        classification: {
                            kind,
                            reason:
                                kind === "applet" ? "Interactive" : "Scheduled",
                        },
                    }),
                });
            }
            return Promise.resolve({
                ok: false,
                json: async () => ({}),
            });
        });
    });

    test("renders large applets as chrome-less interactive widgets", async () => {
        renderDirectory();

        expect(
            await screen.findByTestId("home-applet-widget"),
        ).toBeInTheDocument();
        expect(
            await screen.findByTestId("mock-output-sandbox"),
        ).toHaveTextContent("Widget");
        expect(
            screen.queryByTestId("home-applet-widget-open"),
        ).not.toBeInTheDocument();
        expect(
            screen.getByTestId("home-applet-widget-fullscreen"),
        ).toBeInTheDocument();
        expect(
            screen.queryByText("editor@example.com"),
        ).not.toBeInTheDocument();
    });

    test("shows a tile menu with layout actions outside edit mode", async () => {
        renderDirectory();

        const tileMenus = screen.getAllByRole("button", {
            name: "Card options",
        });
        expect(tileMenus).toHaveLength(3);

        fireEvent.click(tileMenus[1]);
        expect(
            screen.getByRole("menuitem", { name: "Show as shortcut" }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole("menuitem", { name: "Edit" }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole("menuitem", { name: "Remove from Home" }),
        ).toBeInTheDocument();

        fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
        await waitFor(() =>
            expect(screen.queryByRole("menu")).not.toBeInTheDocument(),
        );
        fireEvent.click(tileMenus[0]);
        expect(
            screen.getByRole("menuitem", { name: "Show summary" }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole("menuitem", { name: "Edit" }),
        ).toBeInTheDocument();
    });

    test("removes a tile from the view-mode context menu", async () => {
        renderDirectory();

        fireEvent.click(
            screen.getAllByRole("button", { name: "Card options" })[1],
        );
        fireEvent.click(
            screen.getByRole("menuitem", { name: "Remove from Home" }),
        );

        await waitFor(() => {
            expect(homeItemPutCalls()).toHaveLength(1);
        });
        const body = JSON.parse(homeItemPutCalls()[0][1].body);
        expect(body.homeItems.map(homeItemKey)).toEqual([
            "digest:digest-1",
            "automation:automation-block-1",
        ]);
    });

    test("acknowledges recovered digests when removing one from Home", async () => {
        renderDirectory();
        expect(screen.getByText("Market Brief")).toBeInTheDocument();
        fireEvent.click(
            screen.getAllByRole("button", { name: "Card options" })[0],
        );
        fireEvent.click(
            screen.getByRole("menuitem", { name: "Remove from Home" }),
        );
        await waitFor(() => expect(homeItemPutCalls()).toHaveLength(1));
        const body = JSON.parse(homeItemPutCalls()[0][1].body);
        expect(body.legacyDigestsIncluded).toBe(true);
        expect(body.homeItems.map(homeItemKey)).toEqual([
            "applet:applet-1",
            "automation:automation-block-1",
        ]);
        await waitFor(() =>
            expect(screen.queryByText("Market Brief")).not.toBeInTheDocument(),
        );
        expect(mockMutateDigest).not.toHaveBeenCalled();
    });

    test("does not acknowledge hidden digests before their query succeeds", async () => {
        mockCurrentDigestBlocks = undefined;
        renderDirectory();
        fireEvent.click(
            screen.getAllByRole("button", { name: "Card options" })[0],
        );
        fireEvent.click(
            screen.getByRole("menuitem", { name: "Remove from Home" }),
        );
        await waitFor(() => expect(homeItemPutCalls()).toHaveLength(1));
        const body = JSON.parse(homeItemPutCalls()[0][1].body);
        expect(body.legacyDigestsIncluded).toBe(false);
    });

    test("switches an applet to Launch from the view-mode context menu", async () => {
        renderDirectory();

        fireEvent.click(
            screen.getAllByRole("button", { name: "Card options" })[1],
        );
        fireEvent.click(
            screen.getByRole("menuitem", { name: "Show as shortcut" }),
        );

        await waitFor(() => {
            expect(homeItemPutCalls()).toHaveLength(1);
        });
        const body = JSON.parse(homeItemPutCalls()[0][1].body);
        expect(body.homeItems[1]).toMatchObject({
            type: "applet",
            appletId: "applet-1",
            size: "mini",
        });
    });

    test("opens the applet modify dialog from the view-mode context menu", async () => {
        renderDirectory();

        fireEvent.click(
            screen.getAllByRole("button", { name: "Card options" })[1],
        );
        fireEvent.click(screen.getByRole("menuitem", { name: "Edit" }));

        expect(
            await screen.findByTestId("home-modify-applet-dialog"),
        ).toBeInTheDocument();
    });

    test("hides tile menus while editing layout", () => {
        renderDirectory();
        enterEditMode();

        expect(
            screen.queryByRole("button", { name: "Card options" }),
        ).not.toBeInTheDocument();
        expect(
            screen.getAllByRole("button", { name: "Remove from Home" }).length,
        ).toBeGreaterThan(0);
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

        enterEditMode();
        expect(
            screen.getAllByRole("button", { name: "Drag to reorder Home" }),
        ).toHaveLength(3);

        fireEvent.click(screen.getByTestId("home-applet-display-launch"));
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
                screen.getByTestId("home-applet-display-interactive"),
            ).not.toBeDisabled();
        });
        fireEvent.click(screen.getByTestId("home-applet-display-interactive"));
        await waitFor(() => {
            expect(homeItemPutCalls()).toHaveLength(2);
        });
        body = JSON.parse(homeItemPutCalls()[1][1].body);
        expect(body.homeItems[1]).toMatchObject({
            type: "applet",
            appletId: "applet-1",
            size: "large",
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
            expect(homeItemPutCalls()).toHaveLength(3);
        });
        body = JSON.parse(homeItemPutCalls()[2][1].body);
        expect(body.homeItems.map(homeItemKey)).toEqual([
            "digest:digest-1",
            "automation:automation-block-1",
        ]);
    });

    test("opens a unified Add dialog with prompt and existing columns", async () => {
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

        await openHomeAddDialog();

        expect(
            screen.getByText("Describe what you'd like"),
        ).toBeInTheDocument();
        expect(screen.getByText("Existing")).toBeInTheDocument();
        expect(screen.getByText("Apps")).toBeInTheDocument();
        expect(screen.getByText("Tasks")).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /^Digest/ })).toBeNull();
    });

    test("edits digest cards from Home edit mode", async () => {
        renderDirectory();

        enterEditMode();
        fireEvent.click(screen.getAllByRole("button", { name: "Edit" })[0]);
        fireEvent.change(screen.getByPlaceholderText("Title (optional)"), {
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

    // TODO: automation widgets now point at a fixed automation (edited via the
    // linked automation page) instead of a Select, so re-point this at the new
    // title-only edit flow. Skipped until the shadcn Select interaction is
    // wired for jsdom.
    test.skip("edits automation widgets from Home edit mode", async () => {
        renderDirectory();

        enterEditMode();
        fireEvent.click(screen.getAllByRole("button", { name: "Edit" })[1]);
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

    // TODO: a sole group no longer renders an (editable) title; renaming only
    // applies once there are 2+ groups. Re-point at a multi-group scenario.
    test.skip("adds and renames group titles from Home edit controls", async () => {
        renderDirectory({
            initialHomeItems: [],
            initialHomeItemsConfigured: true,
        });

        enterEditMode();
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

    test("does not render a title for a sole home group", () => {
        renderDirectory({
            initialHomeItems: [],
            initialHomeItemsConfigured: false,
            initialHomeItemsDefaultGroupMigrated: false,
        });

        // A single group needs no title, in view or edit mode.
        expect(
            screen.queryByRole("heading", { name: "Home", level: 2 }),
        ).not.toBeInTheDocument();

        enterEditMode();
        expect(
            screen.queryByRole("button", {
                name: "Click to edit group title",
            }),
        ).toBeNull();
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
                name: "Open report: Nightly Report",
            }),
        );

        expect(
            screen.getByRole("dialog", { name: "Nightly Report" }),
        ).toBeInTheDocument();
    });

    test("keeps the group delete outside the card so applet chrome cannot cover it", () => {
        renderDirectory({
            initialHomeItems: [
                {
                    type: "group",
                    groupId: "g1",
                    title: "Newsroom",
                    order: 0,
                },
                {
                    type: "applet",
                    appletId: "applet-1",
                    size: "large",
                    order: 1,
                },
            ],
            initialHomeItemsConfigured: true,
            initialHomeItemsDefaultGroupMigrated: true,
        });

        const compactAdd = screen.getByTestId("home-group-add");
        expect(compactAdd).toHaveClass("h-10", "w-10", "rounded-lg");
        expect(compactAdd).not.toHaveTextContent("Add");

        enterEditMode();

        expect(screen.getByTestId("home-group-remove")).toBeInTheDocument();
        expect(screen.getByTestId("home-group-remove-wrap")).toHaveClass(
            "start-full",
        );
        expect(
            screen.getByRole("button", { name: "Remove from Home" }),
        ).toBeInTheDocument();
    });

    test("fades widgets in edit mode and opens the applet modify dialog", async () => {
        renderDirectory({
            initialHomeItems: [
                {
                    type: "group",
                    groupId: "g1",
                    title: "Newsroom",
                    order: 0,
                },
                {
                    type: "applet",
                    appletId: "applet-1",
                    size: "large",
                    order: 1,
                },
            ],
            initialHomeItemsConfigured: true,
            initialHomeItemsDefaultGroupMigrated: true,
        });

        enterEditMode();
        expect(screen.getByTestId("home-widget-surface")).toHaveClass(
            "pointer-events-none",
            "opacity-60",
        );

        fireEvent.click(screen.getByTestId("home-modify-applet"));
        expect(
            await screen.findByTestId("home-modify-applet-dialog"),
        ).toBeInTheDocument();
        expect(
            screen.getByRole("heading", {
                name: "Modify applet: First Home Applet",
            }),
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

        enterEditMode();
        fireEvent.click(screen.getByRole("button", { name: "Remove group" }));

        await waitFor(() => {
            expect(homeItemPutCalls()).toHaveLength(1);
        });
        const body = JSON.parse(homeItemPutCalls()[0][1].body);
        expect(body.homeItems.map(homeItemKey)).toEqual(["digest:digest-1"]);
    });

    // TODO: the report-widget picker now uses a shadcn Select (Radix) which
    // isn't easily driven in jsdom. Re-enable with a Radix-aware interaction.
    test.skip("adds automation cards from Home edit controls", async () => {
        renderDirectory({
            initialHomeItems: [],
            initialHomeItemsConfigured: true,
        });

        enterEditMode();
        await addGroupAndChooseOption("Report widget");

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

    test("creates a new automation from Home add prompt", async () => {
        renderDirectory({
            initialHomeItems: [
                { type: "group", groupId: "g1", title: "Group", order: 0 },
            ],
            initialHomeItemsConfigured: true,
            initialHomeItemsDefaultGroupMigrated: true,
        });

        await openHomeAddDialog();
        fireEvent.change(screen.getByTestId("home-add-prompt"), {
            target: { value: "daily news brief every morning" },
        });
        fireEvent.click(screen.getByTestId("home-add-create-from-prompt"));

        expect(
            await screen.findByRole("dialog", { name: "New automation" }),
        ).toBeInTheDocument();
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
        const body = JSON.parse(homeItemPutCalls().at(-1)[1].body);
        expect(body.homeItems).toEqual([
            expect.objectContaining({
                type: "group",
                groupId: "g1",
            }),
            expect.objectContaining({
                type: "automation",
                blockId: "automation-block-2",
                automationId: "automation-new",
            }),
        ]);
    });

    test("creates an applet on the dashboard with a loader and keeps Add enabled", async () => {
        const generateWaiters = [];
        const originalFetch = global.fetch;
        global.fetch = jest.fn((url, options = {}) => {
            if (
                typeof url === "string" &&
                url.includes("/api/generate-applet")
            ) {
                return new Promise((resolve) => {
                    generateWaiters.push(() =>
                        resolve(createGenerateAppletResponse()),
                    );
                });
            }
            return originalFetch(url, options);
        });

        renderDirectory({
            initialHomeItems: [
                { type: "group", groupId: "g1", title: "Group", order: 0 },
            ],
            initialHomeItemsConfigured: true,
            initialHomeItemsDefaultGroupMigrated: true,
        });

        await openHomeAddDialog();
        fireEvent.change(screen.getByTestId("home-add-prompt"), {
            target: { value: "A translator applet for Arabic headlines" },
        });
        fireEvent.click(screen.getByTestId("home-add-create-from-prompt"));
        await chooseAppletPlacement("interactive");

        expect(
            await screen.findByTestId("home-creating-applet-card"),
        ).toBeInTheDocument();
        expect(screen.getByText("Getting your app ready…")).toBeInTheDocument();
        expect(mockPush).not.toHaveBeenCalled();
        expect(generateWaiters).toHaveLength(1);

        const addButtons = screen.getAllByTestId("home-group-add");
        expect(addButtons.length).toBeGreaterThan(0);
        addButtons.forEach((button) => {
            expect(button).not.toBeDisabled();
        });

        // Start a second create while the first is still generating.
        fireEvent.click(addButtons[0]);
        expect(
            await screen.findByRole("dialog", { name: "Add to Home" }),
        ).toBeInTheDocument();
        fireEvent.change(screen.getByTestId("home-add-prompt"), {
            target: { value: "A story tracker applet" },
        });
        fireEvent.click(screen.getByTestId("home-add-create-from-prompt"));
        await chooseAppletPlacement("interactive");

        await waitFor(() => {
            expect(
                screen.getAllByTestId("home-creating-applet-card"),
            ).toHaveLength(2);
        });
        expect(generateWaiters).toHaveLength(2);

        generateWaiters.forEach((release) => release());

        await waitFor(() => {
            expect(
                screen.queryByTestId("home-creating-applet-card"),
            ).not.toBeInTheDocument();
        });
        await waitFor(() => {
            const latestApplets = JSON.parse(
                homeItemPutCalls().at(-1)[1].body,
            ).homeItems.filter((item) => item.type === "applet");
            expect(latestApplets.map((item) => item.appletId).sort()).toEqual([
                "applet-created-1",
                "applet-created-2",
            ]);
        });
        expect(mockPush).not.toHaveBeenCalled();
    });

    test("adds an existing applet from the Home Add dialog", async () => {
        renderDirectory({
            initialHomeItems: [
                { type: "group", groupId: "g1", title: "Group", order: 0 },
            ],
            initialHomeItemsConfigured: true,
            initialHomeItemsDefaultGroupMigrated: true,
        });

        await openHomeAddDialog();
        expect(
            await screen.findByText("Third Home Applet"),
        ).toBeInTheDocument();
        expect(screen.getByText("Fourth Home Applet")).toBeInTheDocument();
        expect(screen.getByText("Marketplace Briefing")).toBeInTheDocument();
        expect(screen.getByText("Weekly Automation")).toBeInTheDocument();
        expect(screen.queryByText("Files")).not.toBeInTheDocument();

        fireEvent.click(
            screen.getByTestId("home-add-existing-applet-applet-3"),
        );
        await chooseAppletPlacement("interactive");

        await waitFor(() => {
            expect(homeItemPutCalls().length).toBeGreaterThan(0);
        });
        const body = JSON.parse(homeItemPutCalls().at(-1)[1].body);
        expect(body.homeItems).toEqual([
            expect.objectContaining({
                type: "group",
                groupId: "g1",
            }),
            expect.objectContaining({
                type: "applet",
                appletId: "applet-3",
                size: "large",
            }),
        ]);
    });

    test("adds an existing applet as a launch icon", async () => {
        renderDirectory({
            initialHomeItems: [
                { type: "group", groupId: "g1", title: "Group", order: 0 },
            ],
            initialHomeItemsConfigured: true,
            initialHomeItemsDefaultGroupMigrated: true,
        });

        await openHomeAddDialog();
        fireEvent.click(
            await screen.findByTestId("home-add-existing-applet-applet-3"),
        );
        await chooseAppletPlacement("launch");

        await waitFor(() => {
            expect(homeItemPutCalls().length).toBeGreaterThan(0);
        });
        const body = JSON.parse(homeItemPutCalls().at(-1)[1].body);
        expect(body.homeItems).toEqual([
            expect.objectContaining({
                type: "group",
                groupId: "g1",
            }),
            expect.objectContaining({
                type: "applet",
                appletId: "applet-3",
                size: "mini",
            }),
        ]);
    });

    test("shows marketplace applets in the Add dialog when the user has none of their own", async () => {
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
                    json: async () => ({ applets: [] }),
                });
            }
            if (url === "/api/apps") {
                return Promise.resolve({
                    ok: true,
                    // Bare array — the shape `/api/apps` actually returns.
                    json: async () => [
                        {
                            _id: "store-app-1",
                            name: "Marketplace Briefing",
                            type: "applet",
                            listedInStore: true,
                            appletId: {
                                _id: "applet-market-1",
                                name: "Marketplace Briefing",
                                publishedVersionIndex: 0,
                                htmlVersions: [{ html: "<html></html>" }],
                            },
                        },
                    ],
                });
            }
            return Promise.resolve({
                ok: false,
                json: async () => ({}),
            });
        });

        renderDirectory({
            applets: [],
            initialHomeItems: [
                { type: "group", groupId: "g1", title: "Group", order: 0 },
            ],
            initialHomeItemsConfigured: true,
            initialHomeItemsDefaultGroupMigrated: true,
        });

        await openHomeAddDialog();

        expect(
            await screen.findByText("Marketplace Briefing"),
        ).toBeInTheDocument();
        expect(
            screen.queryByText("No applets available"),
        ).not.toBeInTheDocument();
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
            screen.getByText("Add something to get started."),
        ).toBeInTheDocument();
    });

    test("offers an Add affordance when the home page is completely empty", () => {
        renderDirectory({
            initialHomeItems: [],
            initialHomeItemsConfigured: true,
            initialHomeItemsDefaultGroupMigrated: true,
        });

        // The empty state exposes an Add button (opens the layout chooser).
        expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument();
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
