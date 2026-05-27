import React from "react";
import {
    act,
    cleanup,
    fireEvent,
    render,
    screen,
    waitFor,
    within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import HtmlPreviewTabContent from "../HtmlPreviewTabContent";
import { generateFilteredSandboxHtml } from "@/src/utils/themeUtils";

jest.mock("react-i18next", () => ({
    __esModule: true,
    useTranslation: () => ({
        t: (key) => key,
    }),
    initReactI18next: {
        type: "3rdParty",
        init: () => {},
    },
}));

// Mock tabs component to avoid LanguageProvider/i18n locale file dependency
jest.mock("@/components/ui/tabs", () => ({
    Tabs: ({ children, defaultValue }) => (
        <div data-testid="tabs" data-default-value={defaultValue}>
            {children}
        </div>
    ),
    TabsContent: ({ children, className, value }) => (
        <div data-testid={`tab-content-${value}`} className={className}>
            {children}
        </div>
    ),
    TabsList: ({ children }) => <div>{children}</div>,
    TabsTrigger: ({ children, value }) => (
        <button data-testid={`tab-trigger-${value}`}>{children}</button>
    ),
}));

jest.mock("@/components/ui/alert-dialog", () => ({
    AlertDialog: ({ children, open }) =>
        open ? <div data-testid="alert-dialog">{children}</div> : null,
    AlertDialogAction: ({ children, ...props }) => (
        <button {...props}>{children}</button>
    ),
    AlertDialogCancel: ({ children, ...props }) => (
        <button {...props}>{children}</button>
    ),
    AlertDialogContent: ({ children }) => (
        <div role="alertdialog">{children}</div>
    ),
    AlertDialogDescription: ({ children }) => <p>{children}</p>,
    AlertDialogFooter: ({ children }) => <div>{children}</div>,
    AlertDialogHeader: ({ children }) => <div>{children}</div>,
    AlertDialogTitle: ({ children }) => <h2>{children}</h2>,
}));

jest.mock("@monaco-editor/react", () => ({
    __esModule: true,
    default: ({ onChange, options, value }) => (
        <textarea
            data-testid="monaco-editor"
            data-readonly={String(Boolean(options?.readOnly))}
            onChange={(event) => onChange?.(event.target.value)}
            readOnly={Boolean(options?.readOnly)}
            value={value || ""}
        />
    ),
}));

jest.mock("@/src/contexts/ThemeProvider", () => {
    const { createContext } = require("react");
    return {
        ThemeContext: createContext({ theme: "light" }),
    };
});

jest.mock("@/src/contexts/LanguageProvider", () => {
    const { createContext } = require("react");
    return {
        LanguageContext: createContext({ direction: "ltr", language: "en" }),
    };
});

jest.mock("@/src/utils/appletHtmlUtils", () => ({
    injectAppletIdMeta: (html) => html,
}));

jest.mock("next/navigation", () => ({
    useSearchParams: jest.fn(() => new URLSearchParams("")),
}));

// OutputSandbox is the real /applet sandbox — its internals (Tailwind script,
// theme wrapping, iframe, observers) aren't relevant here. The mock just
// surfaces the props the canvas passes in so tests can verify they're correct.
jest.mock("@/src/components/sandbox/OutputSandbox", () => {
    const R = require("react");
    return {
        __esModule: true,
        default: R.forwardRef(function MockOutputSandbox(
            { content, theme, height, autoResize = true },
            ref,
        ) {
            return (
                <div
                    ref={ref}
                    data-testid="output-sandbox"
                    data-theme={theme}
                    data-height={height}
                    data-auto-resize={String(autoResize)}
                    data-content={content || ""}
                    title="Output Sandbox"
                />
            );
        }),
    };
});

jest.mock("../useContentLoader", () => ({
    useContentLoader: ({ inlineContent }) => ({
        loading: false,
        error: null,
        content: inlineContent || null,
        contentKey: "key-1",
        retry: jest.fn(),
    }),
}));

jest.mock("../TabContentLoader", () => ({
    TabContentLoader: ({ error, loading }) => (
        <div
            data-testid="tab-content-loader"
            data-loading={String(Boolean(loading))}
        >
            {error}
        </div>
    ),
}));

// Mock the publish dialog: mirrors real behavior of surfacing onConfirm errors
jest.mock("../CanvasAppletPublishDialog", () => {
    const R = require("react");
    return {
        __esModule: true,
        default: function MockCanvasAppletPublishDialog({
            isOpen,
            onClose,
            onConfirm,
            isPending,
            isUpdate,
        }) {
            const [error, setError] = R.useState("");
            R.useEffect(() => {
                if (!isOpen) setError("");
            }, [isOpen]);
            if (!isOpen) return null;
            return (
                <div data-testid="publish-dialog">
                    <span data-testid="publish-dialog-is-update">
                        {String(isUpdate)}
                    </span>
                    {error ? (
                        <p data-testid="publish-dialog-error">{error}</p>
                    ) : null}
                    <button
                        type="button"
                        data-testid="publish-dialog-confirm"
                        onClick={async () => {
                            setError("");
                            try {
                                await onConfirm({
                                    appletName: "Test Applet",
                                    publishToAppStore: false,
                                    appName: "",
                                    appIcon: "AppWindow",
                                    appSlug: "",
                                    appDescription: "",
                                });
                            } catch (e) {
                                setError(
                                    e?.message ||
                                        String(e || "An error occurred"),
                                );
                            }
                        }}
                    >
                        Confirm
                    </button>
                    <button
                        type="button"
                        data-testid="publish-dialog-close"
                        onClick={onClose}
                    >
                        Close
                    </button>
                    {isPending ? <span data-testid="publish-pending" /> : null}
                </div>
            );
        },
    };
});

jest.mock("../CanvasAppletManageDialog", () => ({
    __esModule: true,
    default: ({ isOpen, onClose, onUnpublish, isPending }) =>
        isOpen ? (
            <div data-testid="manage-dialog">
                <button
                    data-testid="manage-dialog-unpublish"
                    onClick={onUnpublish}
                >
                    Unpublish
                </button>
                <button data-testid="manage-dialog-close" onClick={onClose}>
                    Close
                </button>
                {isPending && <span data-testid="manage-pending" />}
            </div>
        ) : null,
}));

const HTML_CONTENT =
    '<html><head></head><body><div class="flex">Test</div></body></html>';

const previewSrcDoc = (html) =>
    generateFilteredSandboxHtml(html, "light", {
        language: "en",
        params: {},
    });

const APPLET_ID = "507f1f77bcf86cd799439011";

const makeAppletRecord = (publishedVersionIndex = null) => ({
    _id: APPLET_ID,
    name: "Test Applet",
    version: 2,
    publishedVersionIndex,
    htmlVersions:
        publishedVersionIndex != null ? [{ content: HTML_CONTENT }] : [],
    app: null,
});

const makeAppletRecordWithVersions = (htmlVersions) => ({
    ...makeAppletRecord(null),
    htmlVersions: htmlVersions.map((content) => ({ content })),
});

// Renders HtmlPreviewTabContent so tests can drive publish/manage/fullscreen
// by clicking the inline controls the user sees (next to the Preview/Code
// tabs), the same way Canvas does at runtime.
function renderComponent(props = {}) {
    return render(
        <HtmlPreviewTabContent
            tabId="tab-1"
            initialContent={{
                htmlContent: HTML_CONTENT,
                title: "Preview",
                ...props.initialContent,
            }}
            isActive={true}
            {...props}
        />,
    );
}

const findFullScreenButton = () =>
    screen.findByRole("button", { name: /full screen/i });
const findSaveButton = () => screen.findByRole("button", { name: /^save$/i });
const findPublishButton = () =>
    screen.findByRole("button", { name: /^publish$/i });
const findManageButton = () =>
    screen.findByRole("button", { name: /(published|update)/i });
const findEditVersionButton = () =>
    screen.findByRole("button", { name: /edit this version/i });

describe("HtmlPreviewTabContent", () => {
    beforeEach(() => {
        global.fetch = jest.fn();
    });

    afterEach(() => {
        cleanup();
        jest.useRealTimers();
        jest.restoreAllMocks();
    });

    it("renders the preview through OutputSandbox with the active theme", () => {
        global.fetch.mockResolvedValue({ ok: false });

        renderComponent();

        const sandbox = screen.getByTestId("output-sandbox");
        expect(sandbox).toBeInTheDocument();
        expect(sandbox).toHaveAttribute("data-content", HTML_CONTENT);
        // ThemeContext default in this suite is "light"
        expect(sandbox).toHaveAttribute("data-theme", "light");
        expect(sandbox).toHaveAttribute("data-height", "100%");
        expect(sandbox).toHaveAttribute("data-auto-resize", "true");
        expect(screen.getByTestId("tab-content-preview")).toHaveClass(
            "overflow-auto",
        );
    });

    it("defers streaming preview updates until the preview has been idle", async () => {
        jest.useFakeTimers();
        global.fetch.mockResolvedValue({ ok: false });

        const { rerender } = render(
            <HtmlPreviewTabContent
                tabId="tab-1"
                initialContent={{
                    htmlContent: HTML_CONTENT,
                    htmlStatus: "generating",
                    title: "Preview",
                }}
                isActive={true}
            />,
        );

        const visibleFrame = screen.getByTitle("Preview");
        expect(visibleFrame).toHaveAttribute(
            "srcDoc",
            previewSrcDoc(HTML_CONTENT),
        );
        expect(visibleFrame).toHaveAttribute("scrolling", "auto");

        const updatedHtml =
            "<html><body><main>Updated preview</main></body></html>";

        rerender(
            <HtmlPreviewTabContent
                tabId="tab-1"
                initialContent={{
                    htmlContent: updatedHtml,
                    htmlStatus: "generating",
                    title: "Preview",
                }}
                isActive={true}
            />,
        );

        expect(screen.getByTitle("Preview")).toHaveAttribute(
            "srcDoc",
            previewSrcDoc(HTML_CONTENT),
        );

        await act(async () => {
            jest.advanceTimersByTime(1000);
        });

        expect(screen.getByTitle("Preview")).toHaveAttribute(
            "srcDoc",
            previewSrcDoc(HTML_CONTENT),
        );

        await act(async () => {
            jest.advanceTimersByTime(1500);
        });

        await waitFor(() => {
            expect(screen.getByTitle("Preview")).toHaveAttribute(
                "srcDoc",
                previewSrcDoc(updatedHtml),
            );
        });
    });

    it("shows an error state when applet generation fails", () => {
        render(
            <HtmlPreviewTabContent
                tabId="tab-1"
                initialContent={{
                    htmlContent: "",
                    htmlStatus: "error",
                    htmlError: "Cortex returned 500",
                    title: "Preview",
                }}
                isActive={true}
            />,
        );

        expect(screen.getByTestId("tab-content-loader")).toHaveTextContent(
            "Cortex returned 500",
        );
        expect(screen.getByTestId("tab-content-loader")).toHaveAttribute(
            "data-loading",
            "false",
        );
        expect(
            screen.queryByText("Generating applet..."),
        ).not.toBeInTheDocument();
    });

    it("opens and closes a full screen preview overlay", async () => {
        global.fetch.mockResolvedValue({ ok: false });

        renderComponent();

        await userEvent.click(await findFullScreenButton());

        const dialog = screen.getByRole("dialog", {
            name: "Full screen applet preview",
        });
        expect(dialog).toBeInTheDocument();
        // Two OutputSandbox instances render (inline + fullscreen wrapper);
        // the fullscreen one is what matters here.
        const sandboxes = screen.getAllByTestId("output-sandbox");
        expect(sandboxes.length).toBeGreaterThanOrEqual(2);
        expect(sandboxes[sandboxes.length - 1]).toHaveAttribute(
            "data-auto-resize",
            "true",
        );

        await userEvent.click(
            screen.getByLabelText("Close full screen preview"),
        );

        await waitFor(() => {
            expect(
                screen.queryByRole("dialog", {
                    name: "Full screen applet preview",
                }),
            ).not.toBeInTheDocument();
        });
    });

    it("hides applet header controls until applet metadata has loaded", async () => {
        let resolveAppletRecord;
        const appletRecordPromise = new Promise((resolve) => {
            resolveAppletRecord = resolve;
        });
        global.fetch.mockReturnValue(appletRecordPromise);

        renderComponent({
            initialContent: {
                htmlContent: HTML_CONTENT,
                title: "Preview",
                appletId: APPLET_ID,
            },
        });

        expect(
            screen.queryByRole("button", { name: /full screen/i }),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByRole("button", { name: /^save$/i }),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByRole("button", { name: /^publish$/i }),
        ).not.toBeInTheDocument();

        await act(async () => {
            resolveAppletRecord({
                ok: true,
                json: async () => makeAppletRecordWithVersions([HTML_CONTENT]),
            });
            await appletRecordPromise;
        });

        expect(await findFullScreenButton()).toBeInTheDocument();
        expect(await findPublishButton()).toBeInTheDocument();
    });

    it("closes the full screen preview when Escape is pressed", async () => {
        global.fetch.mockResolvedValue({ ok: false });

        renderComponent();

        await userEvent.click(await findFullScreenButton());
        expect(
            screen.getByRole("dialog", {
                name: "Full screen applet preview",
            }),
        ).toBeInTheDocument();

        await userEvent.keyboard("{Escape}");

        await waitFor(() => {
            expect(
                screen.queryByRole("dialog", {
                    name: "Full screen applet preview",
                }),
            ).not.toBeInTheDocument();
        });
    });

    it("renders generic HTML in hidden-chrome mode with overlay controls", async () => {
        const onCloseCanvas = jest.fn();
        global.fetch.mockResolvedValue({ ok: false });

        renderComponent({
            initialContent: {
                htmlContent: HTML_CONTENT,
                title: "Report",
                canvasChrome: "hidden",
            },
            onCloseCanvas,
        });

        expect(
            screen.queryByTestId("tab-trigger-preview"),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByTestId("tab-trigger-code"),
        ).not.toBeInTheDocument();
        expect(screen.getByTestId("output-sandbox")).toHaveAttribute(
            "data-content",
            HTML_CONTENT,
        );

        await userEvent.click(
            screen.getByRole("button", { name: "Full Screen" }),
        );
        expect(
            screen.getByRole("dialog", {
                name: "Full screen applet preview",
            }),
        ).toBeInTheDocument();

        await userEvent.click(
            screen.getByRole("button", { name: "Close canvas" }),
        );
        expect(onCloseCanvas).toHaveBeenCalledTimes(1);
    });

    describe("Publish actions", () => {
        it("refreshes the version browser when an applet sync saves a new version", async () => {
            global.fetch
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => makeAppletRecordWithVersions(["v1"]),
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () =>
                        makeAppletRecordWithVersions(["v1", HTML_CONTENT]),
                });

            const { rerender } = renderComponent({
                initialContent: {
                    htmlContent: HTML_CONTENT,
                    title: "Preview",
                    appletId: APPLET_ID,
                },
            });

            await waitFor(() => {
                expect(global.fetch).toHaveBeenCalledTimes(1);
            });
            expect(screen.queryByText("v2/2")).not.toBeInTheDocument();

            rerender(
                <HtmlPreviewTabContent
                    tabId="tab-1"
                    initialContent={{
                        htmlContent: HTML_CONTENT,
                        title: "Preview",
                        appletId: APPLET_ID,
                        appletVersionKey: 1,
                        appletVersionCount: 2,
                    }}
                    isActive={true}
                />,
            );

            expect(screen.getByText("v2/2")).toBeInTheDocument();
        });

        it("labels uncheckpointed live content instead of calling it the latest saved version", async () => {
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: async () =>
                    makeAppletRecordWithVersions([
                        "<html>saved-v1</html>",
                        "<html>saved-v2</html>",
                    ]),
            });

            renderComponent({
                initialContent: {
                    htmlContent: "<html>live blob</html>",
                    title: "Preview",
                    appletId: APPLET_ID,
                },
            });

            expect(await screen.findByText("Draft")).toBeInTheDocument();
            expect(screen.queryByText("v2/2")).not.toBeInTheDocument();
            expect(screen.getByTestId("output-sandbox")).toHaveAttribute(
                "data-content",
                "<html>live blob</html>",
            );
        });

        it("can navigate from a saved version back to Draft", async () => {
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: async () =>
                    makeAppletRecordWithVersions([
                        "<html>saved-v1</html>",
                        "<html>saved-v2</html>",
                    ]),
            });

            renderComponent({
                initialContent: {
                    htmlContent: "<html>live draft</html>",
                    title: "Preview",
                    appletId: APPLET_ID,
                },
            });

            expect(await screen.findByText("Draft")).toBeInTheDocument();

            await userEvent.click(screen.getByTitle("Previous version"));
            expect(screen.getByText("v2/2")).toBeInTheDocument();
            expect(screen.getByTestId("output-sandbox")).toHaveAttribute(
                "data-content",
                "<html>saved-v2</html>",
            );

            await userEvent.click(screen.getByTitle("Next version"));
            expect(screen.getByText("Draft")).toBeInTheDocument();
            expect(screen.getByTestId("output-sandbox")).toHaveAttribute(
                "data-content",
                "<html>live draft</html>",
            );
        });

        it("switches from a saved version to Draft when the applet is restored for editing", async () => {
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: async () =>
                    makeAppletRecordWithVersions([
                        "<html>saved-v1</html>",
                        "<html>saved-v2</html>",
                    ]),
            });

            const { rerender } = renderComponent({
                initialContent: {
                    htmlContent: "<html>original draft</html>",
                    title: "Preview",
                    appletId: APPLET_ID,
                },
            });

            expect(await screen.findByText("Draft")).toBeInTheDocument();

            await userEvent.click(screen.getByTitle("Previous version"));
            expect(screen.getByText("v2/2")).toBeInTheDocument();
            expect(screen.getByTestId("output-sandbox")).toHaveAttribute(
                "data-content",
                "<html>saved-v2</html>",
            );

            rerender(
                <HtmlPreviewTabContent
                    tabId="tab-1"
                    initialContent={{
                        htmlContent: "<html>restored draft</html>",
                        title: "Preview",
                        appletId: APPLET_ID,
                        appletIsViewingDraft: true,
                    }}
                    isActive={true}
                />,
            );

            expect(screen.getByText("Draft")).toBeInTheDocument();
            expect(screen.getByTestId("output-sandbox")).toHaveAttribute(
                "data-content",
                "<html>restored draft</html>",
            );
        });

        it("keeps an older copied version as Draft when canvas state follows Draft", async () => {
            global.fetch
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () =>
                        makeAppletRecordWithVersions([
                            "<html>saved-v1</html>",
                            "<html>saved-v2</html>",
                            "<html>saved-v3</html>",
                        ]),
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () =>
                        makeAppletRecordWithVersions([
                            "<html>saved-v1</html>",
                            "<html>saved-v2</html>",
                            "<html>saved-v3</html>",
                        ]),
                });

            const { rerender } = renderComponent({
                initialContent: {
                    htmlContent: "<html>saved-v3</html>",
                    title: "Preview",
                    appletId: APPLET_ID,
                },
            });

            expect(await screen.findByText("v3/3")).toBeInTheDocument();

            await userEvent.click(screen.getByTitle("Previous version"));
            await userEvent.click(screen.getByTitle("Previous version"));
            expect(screen.getByText("v1/3")).toBeInTheDocument();
            expect(screen.getByTestId("output-sandbox")).toHaveAttribute(
                "data-content",
                "<html>saved-v1</html>",
            );

            await userEvent.click(await findEditVersionButton());
            expect(await screen.findByText("Draft")).toBeInTheDocument();
            expect(screen.getByTestId("output-sandbox")).toHaveAttribute(
                "data-content",
                "<html>saved-v1</html>",
            );
            const restoreCall = global.fetch.mock.calls.find((call) => {
                if (call[1]?.method !== "PUT" || !call[0].includes(APPLET_ID)) {
                    return false;
                }
                return JSON.parse(call[1].body).restoreVersion === 1;
            });
            expect(restoreCall).toBeTruthy();

            rerender(
                <HtmlPreviewTabContent
                    tabId="tab-1"
                    initialContent={{
                        htmlContent: "<html>saved-v3</html>",
                        title: "Preview",
                        appletId: APPLET_ID,
                        appletIsViewingDraft: true,
                    }}
                    isActive={true}
                />,
            );

            expect(screen.getByText("Draft")).toBeInTheDocument();
            expect(screen.getByTestId("output-sandbox")).toHaveAttribute(
                "data-content",
                "<html>saved-v1</html>",
            );
            expect(screen.queryByText("v3/3")).not.toBeInTheDocument();

            await userEvent.click(screen.getByTitle("Previous version"));
            expect(screen.getByText("v3/3")).toBeInTheDocument();
            expect(screen.getByTestId("output-sandbox")).toHaveAttribute(
                "data-content",
                "<html>saved-v3</html>",
            );

            await userEvent.click(screen.getByTitle("Next version"));
            expect(screen.getByText("Draft")).toBeInTheDocument();
            expect(screen.getByTestId("output-sandbox")).toHaveAttribute(
                "data-content",
                "<html>saved-v1</html>",
            );
        });

        it("saves uncheckpointed Draft before offering publish", async () => {
            const draftHtml = "<html>live draft</html>";
            global.fetch
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () =>
                        makeAppletRecordWithVersions([
                            "<html>saved-v1</html>",
                            "<html>saved-v2</html>",
                        ]),
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => ({}),
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () =>
                        makeAppletRecordWithVersions([
                            "<html>saved-v1</html>",
                            "<html>saved-v2</html>",
                            draftHtml,
                        ]),
                });

            renderComponent({
                initialContent: {
                    htmlContent: draftHtml,
                    title: "Preview",
                    appletId: APPLET_ID,
                },
            });

            await userEvent.click(await findSaveButton());

            const putCall = global.fetch.mock.calls.find(
                (call) =>
                    call[1]?.method === "PUT" && call[0].includes(APPLET_ID),
            );
            expect(putCall).toBeTruthy();
            expect(JSON.parse(putCall[1].body)).toEqual({
                html: draftHtml,
                saveVersion: true,
            });

            expect(await screen.findByText("v3/3")).toBeInTheDocument();
            expect(await findPublishButton()).toBeInTheDocument();
            expect(
                screen.queryByRole("button", { name: /^save$/i }),
            ).not.toBeInTheDocument();
        });

        it("keeps showing Draft if the post-save version refetch is stale", async () => {
            const draftHtml = "<html>live draft</html>";
            global.fetch
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () =>
                        makeAppletRecordWithVersions([
                            "<html>saved-v1</html>",
                            "<html>saved-v2</html>",
                        ]),
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => ({}),
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () =>
                        makeAppletRecordWithVersions([
                            "<html>saved-v1</html>",
                            "<html>saved-v2</html>",
                        ]),
                });

            renderComponent({
                initialContent: {
                    htmlContent: draftHtml,
                    title: "Preview",
                    appletId: APPLET_ID,
                },
            });

            await userEvent.click(await findSaveButton());

            expect(await screen.findByText("Draft")).toBeInTheDocument();
            expect(screen.getByTestId("output-sandbox")).toHaveAttribute(
                "data-content",
                draftHtml,
            );
            expect(screen.queryByText("v2/2")).not.toBeInTheDocument();
        });

        it("renders Publish button (not Published) for an unpublished applet", async () => {
            global.fetch.mockResolvedValue({
                ok: true,
                json: async () => makeAppletRecordWithVersions([HTML_CONTENT]),
            });

            renderComponent({
                initialContent: {
                    htmlContent: HTML_CONTENT,
                    title: "Preview",
                    appletId: APPLET_ID,
                },
            });

            expect(await findPublishButton()).toBeInTheDocument();
            expect(
                screen.queryByRole("button", { name: /^published$/i }),
            ).not.toBeInTheDocument();
        });

        it("opens publish dialog when the Publish button is clicked", async () => {
            global.fetch.mockResolvedValue({
                ok: true,
                json: async () => makeAppletRecordWithVersions([HTML_CONTENT]),
            });

            renderComponent({
                initialContent: {
                    htmlContent: HTML_CONTENT,
                    title: "Preview",
                    appletId: APPLET_ID,
                },
            });

            await userEvent.click(await findPublishButton());

            expect(screen.getByTestId("publish-dialog")).toBeInTheDocument();
        });
    });

    describe("Published / Manage actions", () => {
        it("renders Published button for a published applet", async () => {
            global.fetch.mockResolvedValue({
                ok: true,
                json: async () => makeAppletRecord(0),
            });

            renderComponent({
                initialContent: {
                    htmlContent: HTML_CONTENT,
                    title: "Preview",
                    appletId: APPLET_ID,
                },
            });

            expect(
                await screen.findByRole("button", { name: /published/i }),
            ).toBeInTheDocument();
        });

        it("opens manage dialog when the Published button is clicked", async () => {
            global.fetch.mockResolvedValue({
                ok: true,
                json: async () => makeAppletRecord(0),
            });

            renderComponent({
                initialContent: {
                    htmlContent: HTML_CONTENT,
                    title: "Preview",
                    appletId: APPLET_ID,
                },
            });

            await userEvent.click(await findManageButton());

            expect(screen.getByTestId("manage-dialog")).toBeInTheDocument();
        });

        it("does not mark a duplicate saved version as Published just because its HTML matches", async () => {
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    ...makeAppletRecord(null),
                    publishedVersionIndex: 3,
                    htmlVersions: [
                        { content: "<html>saved-v1</html>" },
                        { content: "<html>duplicate-published</html>" },
                        { content: "<html>saved-v3</html>" },
                        { content: "<html>duplicate-published</html>" },
                    ],
                }),
            });

            renderComponent({
                initialContent: {
                    htmlContent: "<html>duplicate-published</html>",
                    title: "Preview",
                    appletId: APPLET_ID,
                },
            });

            expect(await screen.findByText("v4/4")).toBeInTheDocument();
            expect(
                screen.getByRole("button", { name: /^published$/i }),
            ).toBeInTheDocument();

            await userEvent.click(screen.getByTitle("Previous version"));
            await userEvent.click(screen.getByTitle("Previous version"));

            expect(screen.getByText("v2/4")).toBeInTheDocument();
            expect(
                screen.queryByRole("button", { name: /^published$/i }),
            ).not.toBeInTheDocument();
            expect(
                screen.getByRole("button", { name: /^republish$/i }),
            ).toBeInTheDocument();
        });
    });

    describe("handlePublish", () => {
        it("publishes the selected saved version without creating a duplicate version", async () => {
            // First fetch: get the applet record (unpublished)
            // Second fetch: PUT publish request
            // Third fetch: refetch after publishing
            global.fetch
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () =>
                        makeAppletRecordWithVersions([HTML_CONTENT]),
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => ({}),
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => makeAppletRecord(0),
                });

            renderComponent({
                initialContent: {
                    htmlContent: HTML_CONTENT,
                    title: "Preview",
                    appletId: APPLET_ID,
                },
            });

            await userEvent.click(await findPublishButton());

            expect(screen.getByTestId("publish-dialog")).toBeInTheDocument();

            const confirmButton = screen.getByTestId("publish-dialog-confirm");
            await userEvent.click(confirmButton);

            await waitFor(() => {
                expect(
                    screen.queryByTestId("publish-dialog"),
                ).not.toBeInTheDocument();
            });

            const putCall = global.fetch.mock.calls.find(
                (call) =>
                    call[1]?.method === "PUT" && call[0].includes(APPLET_ID),
            );
            expect(putCall).toBeTruthy();
            expect(JSON.parse(putCall[1].body)).toMatchObject({
                publishVersion: 1,
            });
            expect(JSON.parse(putCall[1].body)).not.toHaveProperty("publish");
            expect(JSON.parse(putCall[1].body)).not.toHaveProperty("html");
        });

        it("keeps saved versions read-only until the user copies one into Draft", async () => {
            const editedHtml =
                "<html><head></head><body><main>Edited</main></body></html>";

            global.fetch
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () =>
                        makeAppletRecordWithVersions([
                            "<html>saved-v1</html>",
                            HTML_CONTENT,
                        ]),
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () =>
                        makeAppletRecordWithVersions([
                            "<html>saved-v1</html>",
                            HTML_CONTENT,
                        ]),
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => ({}),
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () =>
                        makeAppletRecordWithVersions([
                            "<html>saved-v1</html>",
                            HTML_CONTENT,
                            editedHtml,
                        ]),
                });

            renderComponent({
                initialContent: {
                    htmlContent: HTML_CONTENT,
                    title: "Preview",
                    appletId: APPLET_ID,
                },
            });

            expect(await findPublishButton()).toBeInTheDocument();
            expect(screen.getByTestId("monaco-editor")).toHaveAttribute(
                "data-readonly",
                "true",
            );

            await userEvent.click(await findEditVersionButton());
            expect(await screen.findByText("Draft")).toBeInTheDocument();
            expect(screen.getByTestId("monaco-editor")).toHaveAttribute(
                "data-readonly",
                "false",
            );

            fireEvent.change(screen.getByTestId("monaco-editor"), {
                target: { value: editedHtml },
            });

            await userEvent.click(await findSaveButton());

            const putCall = global.fetch.mock.calls.find((call) => {
                if (call[1]?.method !== "PUT" || !call[0].includes(APPLET_ID)) {
                    return false;
                }
                return JSON.parse(call[1].body).saveVersion === true;
            });
            expect(putCall).toBeTruthy();
            expect(JSON.parse(putCall[1].body)).toEqual({
                html: editedHtml,
                saveVersion: true,
            });
            await waitFor(() => {
                expect(screen.getByText("v3/3")).toBeInTheDocument();
            });
            expect(screen.getByTestId("monaco-editor")).toHaveAttribute(
                "data-readonly",
                "true",
            );
        });

        it("keeps Edit visible but disabled while viewing Draft", async () => {
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: async () =>
                    makeAppletRecordWithVersions(["<html>saved-v1</html>"]),
            });

            renderComponent({
                initialContent: {
                    htmlContent: "<html>draft</html>",
                    title: "Preview",
                    appletId: APPLET_ID,
                },
            });

            expect(await screen.findByText("Draft")).toBeInTheDocument();
            expect(await findEditVersionButton()).toBeDisabled();
        });

        it("confirms before deleting a saved version", async () => {
            global.fetch
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () =>
                        makeAppletRecordWithVersions([
                            "<html>saved-v1</html>",
                            "<html>saved-v2</html>",
                        ]),
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () =>
                        makeAppletRecordWithVersions(["<html>saved-v1</html>"]),
                });

            renderComponent({
                initialContent: {
                    htmlContent: "<html>saved-v2</html>",
                    title: "Preview",
                    appletId: APPLET_ID,
                },
            });

            expect(await screen.findByText("v2/2")).toBeInTheDocument();
            await userEvent.click(
                screen.getByRole("button", { name: "Delete version" }),
            );
            expect(screen.getByRole("alertdialog")).toBeInTheDocument();
            expect(
                global.fetch.mock.calls.some(
                    (call) => call[1]?.method === "PUT",
                ),
            ).toBe(false);

            await userEvent.click(
                screen.getByRole("button", { name: "Delete" }),
            );

            const putCall = global.fetch.mock.calls.find(
                (call) =>
                    call[1]?.method === "PUT" && call[0].includes(APPLET_ID),
            );
            expect(JSON.parse(putCall[1].body)).toEqual({ deleteVersion: 2 });
        });

        it("confirms before clearing Draft and refreshes the tab HTML", async () => {
            const onContentChange = jest.fn();
            global.fetch
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () =>
                        makeAppletRecordWithVersions(["<html>saved-v1</html>"]),
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => ({
                        ...makeAppletRecordWithVersions([
                            "<html>saved-v1</html>",
                        ]),
                        workspacePath: "/workspace/files/applets/test.html",
                    }),
                });

            renderComponent({
                onContentChange,
                initialContent: {
                    htmlContent: "<html>draft</html>",
                    title: "Preview",
                    appletId: APPLET_ID,
                    workspacePath: "/workspace/files/applets/test.html",
                },
            });

            expect(await screen.findByText("Draft")).toBeInTheDocument();
            await userEvent.click(
                screen.getByRole("button", { name: "Clear Draft" }),
            );
            const dialog = screen.getByRole("alertdialog");
            expect(dialog).toBeInTheDocument();
            await userEvent.click(
                within(dialog).getByRole("button", { name: "Clear Draft" }),
            );

            const putCall = global.fetch.mock.calls.find(
                (call) =>
                    call[1]?.method === "PUT" && call[0].includes(APPLET_ID),
            );
            expect(JSON.parse(putCall[1].body)).toEqual({ clearDraft: true });
            await waitFor(() =>
                expect(onContentChange).toHaveBeenCalledWith(
                    "tab-1",
                    expect.objectContaining({
                        htmlContent: "<html>saved-v1</html>",
                        workspacePath: "/workspace/files/applets/test.html",
                        appletActiveVersionIndex: 0,
                        appletActiveVersionNumber: 1,
                        appletIsViewingDraft: false,
                    }),
                ),
            );
        });

        it("can leave an edited Draft even when it was copied from the pinned latest version", async () => {
            global.fetch
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () =>
                        makeAppletRecordWithVersions([
                            "<html>saved-v1</html>",
                            "<html>saved-v2</html>",
                            "<html>saved-v3</html>",
                            "<html>saved-v4</html>",
                        ]),
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () =>
                        makeAppletRecordWithVersions([
                            "<html>saved-v1</html>",
                            "<html>saved-v2</html>",
                            "<html>saved-v3</html>",
                            "<html>saved-v4</html>",
                        ]),
                });

            renderComponent({
                initialContent: {
                    htmlContent: "<html>saved-v4</html>",
                    title: "Preview",
                    appletId: APPLET_ID,
                },
            });

            expect(await screen.findByText("v4/4")).toBeInTheDocument();

            await userEvent.click(screen.getByTitle("Previous version"));
            expect(screen.getByText("v3/4")).toBeInTheDocument();

            await userEvent.click(screen.getByTitle("Next version"));
            expect(screen.getByText("v4/4")).toBeInTheDocument();

            await userEvent.click(await findEditVersionButton());
            expect(await screen.findByText("Draft")).toBeInTheDocument();

            fireEvent.change(screen.getByTestId("monaco-editor"), {
                target: { value: "<html>edited draft</html>" },
            });

            await userEvent.click(screen.getByTitle("Previous version"));
            expect(screen.getByText("v4/4")).toBeInTheDocument();
            expect(screen.getByTestId("output-sandbox")).toHaveAttribute(
                "data-content",
                "<html>saved-v4</html>",
            );
            expect(screen.getByTestId("monaco-editor")).toHaveAttribute(
                "data-readonly",
                "true",
            );
        });

        it("publishes an older saved version by index instead of snapshotting it again", async () => {
            global.fetch
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () =>
                        makeAppletRecordWithVersions([
                            "<html>saved-v1</html>",
                            "<html>saved-v2</html>",
                            "<html>saved-v3</html>",
                        ]),
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => ({}),
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => ({
                        ...makeAppletRecord(null),
                        publishedVersionIndex: 1,
                        htmlVersions: [
                            { content: "<html>saved-v1</html>" },
                            { content: "<html>saved-v2</html>" },
                            { content: "<html>saved-v3</html>" },
                        ],
                    }),
                });

            renderComponent({
                initialContent: {
                    htmlContent: "<html>saved-v3</html>",
                    title: "Preview",
                    appletId: APPLET_ID,
                },
            });

            expect(await screen.findByText("v3/3")).toBeInTheDocument();
            await userEvent.click(screen.getByTitle("Previous version"));
            expect(screen.getByText("v2/3")).toBeInTheDocument();
            await userEvent.click(await findPublishButton());
            await userEvent.click(screen.getByTestId("publish-dialog-confirm"));

            const putCall = global.fetch.mock.calls.find(
                (call) =>
                    call[1]?.method === "PUT" && call[0].includes(APPLET_ID),
            );
            expect(putCall).toBeTruthy();
            expect(JSON.parse(putCall[1].body)).toMatchObject({
                publishVersion: 2,
            });
            expect(JSON.parse(putCall[1].body)).not.toHaveProperty("publish");
            expect(JSON.parse(putCall[1].body)).not.toHaveProperty("html");
        });

        it("surfaces API error message in the publish dialog when publish fails", async () => {
            global.fetch.mockImplementation((_url, opts) => {
                if (opts?.method === "PUT") {
                    return Promise.resolve({
                        ok: false,
                        json: async () => ({ error: "Slug already taken" }),
                    });
                }
                return Promise.resolve({
                    ok: true,
                    json: async () =>
                        makeAppletRecordWithVersions([HTML_CONTENT]),
                });
            });

            renderComponent({
                initialContent: {
                    htmlContent: HTML_CONTENT,
                    title: "Preview",
                    appletId: APPLET_ID,
                },
            });

            await userEvent.click(await findPublishButton());

            expect(screen.getByTestId("publish-dialog")).toBeInTheDocument();

            const confirmButton = screen.getByTestId("publish-dialog-confirm");
            await userEvent.click(confirmButton);

            await waitFor(() => {
                expect(
                    screen.getByTestId("publish-dialog-error"),
                ).toHaveTextContent("Slug already taken");
            });
            expect(screen.getByTestId("publish-dialog")).toBeInTheDocument();
            expect(
                screen.queryByTestId("publish-pending"),
            ).not.toBeInTheDocument();
        });

        it("closes publish dialog when Close is clicked", async () => {
            global.fetch.mockResolvedValue({
                ok: true,
                json: async () => makeAppletRecordWithVersions([HTML_CONTENT]),
            });

            renderComponent({
                initialContent: {
                    htmlContent: HTML_CONTENT,
                    title: "Preview",
                    appletId: APPLET_ID,
                },
            });

            await userEvent.click(await findPublishButton());
            expect(screen.getByTestId("publish-dialog")).toBeInTheDocument();

            await userEvent.click(screen.getByTestId("publish-dialog-close"));

            expect(
                screen.queryByTestId("publish-dialog"),
            ).not.toBeInTheDocument();
        });
    });

    describe("Update published applet (unpublished changes)", () => {
        const OLD_PUBLISHED =
            "<html><head></head><body><p>Old</p></body></html>";

        it("saves Draft changes before offering to republish a published applet", async () => {
            global.fetch
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => ({
                        ...makeAppletRecord(0),
                        htmlVersions: [{ content: OLD_PUBLISHED }],
                    }),
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => ({}),
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => ({
                        ...makeAppletRecord(0),
                        htmlVersions: [
                            { content: OLD_PUBLISHED },
                            { content: HTML_CONTENT },
                        ],
                    }),
                });

            renderComponent({
                initialContent: {
                    htmlContent: HTML_CONTENT,
                    title: "Preview",
                    appletId: APPLET_ID,
                },
            });

            await userEvent.click(await findSaveButton());

            const putCall = global.fetch.mock.calls.find(
                (call) =>
                    call[1]?.method === "PUT" && call[0].includes(APPLET_ID),
            );
            expect(putCall).toBeTruthy();
            expect(JSON.parse(putCall[1].body)).toEqual({
                html: HTML_CONTENT,
                saveVersion: true,
            });

            const republishButton = await screen.findByRole("button", {
                name: /republish/i,
            });
            await userEvent.click(republishButton);
            expect(
                await screen.findByTestId("publish-dialog"),
            ).toBeInTheDocument();
        });
    });

    describe("handleUnpublish", () => {
        it("calls PUT API with unpublish flag and closes manage dialog on success", async () => {
            global.fetch
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => makeAppletRecord(0),
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => ({}),
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => makeAppletRecord(null),
                });

            renderComponent({
                initialContent: {
                    htmlContent: HTML_CONTENT,
                    title: "Preview",
                    appletId: APPLET_ID,
                },
            });

            await userEvent.click(await findManageButton());

            expect(screen.getByTestId("manage-dialog")).toBeInTheDocument();

            const unpublishButton = screen.getByTestId(
                "manage-dialog-unpublish",
            );
            await userEvent.click(unpublishButton);

            await waitFor(() => {
                expect(
                    screen.queryByTestId("manage-dialog"),
                ).not.toBeInTheDocument();
            });

            const putCall = global.fetch.mock.calls.find(
                (call) =>
                    call[1]?.method === "PUT" && call[0].includes(APPLET_ID),
            );
            expect(putCall).toBeTruthy();
            const body = JSON.parse(putCall[1].body);
            expect(body.unpublish).toBe(true);
        });
    });
});
