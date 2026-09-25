import React from "react";
import {
    fireEvent,
    render,
    screen,
    waitFor,
    within,
} from "@testing-library/react";
import "@testing-library/jest-dom";
import HomeAppletWidget from "./HomeAppletWidget";

jest.mock("react-i18next", () => ({
    __esModule: true,
    useTranslation: () => ({ t: (key) => key }),
}));

jest.mock("@/src/contexts/ThemeProvider", () => {
    const React = require("react");
    return {
        __esModule: true,
        ThemeContext: React.createContext({ theme: "light" }),
    };
});

jest.mock("@/src/contexts/LanguageProvider", () => {
    const React = require("react");
    return {
        __esModule: true,
        LanguageContext: React.createContext({ direction: "ltr" }),
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

describe("HomeAppletWidget", () => {
    beforeEach(() => {
        global.fetch = jest.fn((url) => {
            const isWidget =
                typeof url === "string" && url.includes("variant=widget");
            return Promise.resolve({
                ok: true,
                json: async () => ({
                    applet: {
                        runtimeHtml: isWidget
                            ? "<html><body>Hello widget</body></html>"
                            : "<html><body>Hello full applet</body></html>",
                    },
                }),
            });
        });
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test("loads runtime HTML into an interactive sandbox with a stable header", async () => {
        render(
            <HomeAppletWidget
                applet={{ appletId: "applet-1", name: "My Widget" }}
            />,
        );

        expect(screen.getByTestId("home-applet-widget")).toHaveAttribute(
            "aria-label",
            "My Widget",
        );
        expect(
            screen.queryByTestId("home-applet-widget-open"),
        ).not.toBeInTheDocument();
        await waitFor(() => {
            expect(global.fetch).toHaveBeenCalledWith(
                "/api/canvas-applets/applet-1/runtime?variant=widget",
            );
        });
        expect(
            await screen.findByTestId("mock-output-sandbox"),
        ).toHaveTextContent("Hello widget");
        expect(screen.getByTestId("home-card-toolbar")).toBeInTheDocument();
        expect(
            screen.getByTestId("home-applet-widget-fullscreen"),
        ).toBeInTheDocument();
    });

    test("disables pointer events while editing layout", async () => {
        render(
            <HomeAppletWidget
                applet={{ appletId: "applet-1", name: "My Widget" }}
                isEditing
            />,
        );

        await screen.findByTestId("mock-output-sandbox");
        expect(screen.getByTestId("home-applet-widget")).toHaveClass(
            "pointer-events-none",
        );
    });

    test("refetches runtime HTML when reloadToken changes", async () => {
        const { rerender } = render(
            <HomeAppletWidget
                applet={{ appletId: "applet-1", name: "My Widget" }}
            />,
        );
        await screen.findByTestId("mock-output-sandbox");
        expect(global.fetch).toHaveBeenCalledTimes(1);

        rerender(
            <HomeAppletWidget
                applet={{ appletId: "applet-1", name: "My Widget" }}
                reloadToken={1}
            />,
        );
        await waitFor(() => {
            expect(global.fetch).toHaveBeenCalledTimes(2);
        });
    });

    test("opens the full applet in a fullscreen overlay and closes it", async () => {
        render(
            <HomeAppletWidget
                applet={{ appletId: "applet-1", name: "My Widget" }}
            />,
        );

        await screen.findByTestId("mock-output-sandbox");
        fireEvent.click(screen.getByRole("button", { name: "Open app" }));

        const dialog = await screen.findByRole("dialog", { name: "My Widget" });
        expect(dialog).toHaveAttribute(
            "data-testid",
            "home-applet-widget-fullscreen-overlay",
        );
        expect(dialog).toHaveAttribute("dir", "ltr");
        await waitFor(() => {
            expect(
                within(dialog).getByTestId("mock-output-sandbox"),
            ).toHaveTextContent("Hello full applet");
        });
        expect(screen.getAllByTestId("mock-output-sandbox")).toHaveLength(1);

        fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        expect(
            await screen.findByTestId("mock-output-sandbox"),
        ).toHaveTextContent("Hello widget");
    });

    test("closes the fullscreen overlay when Escape is pressed", async () => {
        render(
            <HomeAppletWidget
                applet={{ appletId: "applet-1", name: "My Widget" }}
            />,
        );

        await screen.findByTestId("mock-output-sandbox");
        fireEvent.click(screen.getByRole("button", { name: "Open app" }));
        expect(screen.getByRole("dialog")).toBeInTheDocument();

        fireEvent.keyDown(window, { key: "Escape" });
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    test("hides the fullscreen control while editing layout", async () => {
        render(
            <HomeAppletWidget
                applet={{ appletId: "applet-1", name: "My Widget" }}
                isEditing
            />,
        );

        await screen.findByTestId("mock-output-sandbox");
        expect(
            screen.queryByRole("button", { name: "Open app" }),
        ).not.toBeInTheDocument();
    });

    function missingWidgetFetch(widgetResponse) {
        global.fetch = jest.fn(async (url, options = {}) => {
            if (String(url).includes("variant=widget"))
                return {
                    ok: false,
                    status: 404,
                    json: async () => ({ code: "WIDGET_MISSING" }),
                };
            if (options.method === "POST" && String(url).endsWith("/widget"))
                return { ok: true, json: async () => widgetResponse(options) };
            throw new Error(`Unexpected request ${url}`);
        });
    }

    test("shares first-time preparation across Strict Mode remounts", async () => {
        missingWidgetFetch(() => ({
            status: "ready",
            html: "<html>Generated widget</html>",
        }));
        render(
            <React.StrictMode>
                <HomeAppletWidget
                    applet={{ appletId: "strict-widget", name: "My Widget" }}
                />
            </React.StrictMode>,
        );
        expect(
            await screen.findByTestId("mock-output-sandbox"),
        ).toHaveTextContent("Generated widget");
        expect(
            global.fetch.mock.calls.filter(
                ([, opts]) => opts?.method === "POST",
            ),
        ).toHaveLength(1);
        expect(
            global.fetch.mock.calls.some(([, opts]) => opts?.method === "PUT"),
        ).toBe(false);
    });

    test("shares an unfinished request when the tile is unmounted and reopened", async () => {
        let finish;
        missingWidgetFetch(
            () =>
                new Promise((resolve) => {
                    finish = resolve;
                }),
        );
        const { unmount } = render(
            <HomeAppletWidget applet={{ appletId: "reopened-widget" }} />,
        );
        await waitFor(() => expect(finish).toBeDefined());
        unmount();
        render(<HomeAppletWidget applet={{ appletId: "reopened-widget" }} />);
        finish({ status: "ready", html: "<html>Saved widget</html>" });
        expect(
            await screen.findByTestId("mock-output-sandbox"),
        ).toHaveTextContent("Saved widget");
        expect(
            global.fetch.mock.calls.filter(
                ([, opts]) => opts?.method === "POST",
            ),
        ).toHaveLength(1);
    });

    test("renders the server fallback without generating for applets the user cannot edit", async () => {
        global.fetch = jest.fn(() =>
            Promise.resolve({
                ok: true,
                json: async () => ({
                    applet: {
                        runtimeHtml: "<html><body>Full applet</body></html>",
                        isWidgetFallback: true,
                    },
                }),
            }),
        );

        render(
            <HomeAppletWidget
                applet={{ appletId: "applet-1", name: "Store Widget" }}
            />,
        );

        expect(
            await screen.findByTestId("mock-output-sandbox"),
        ).toHaveTextContent("Full applet");
        expect(
            global.fetch.mock.calls.some(([url]) =>
                String(url).includes("/api/generate-applet"),
            ),
        ).toBe(false);
    });

    test("shows save failure and requests only one explicit retry", async () => {
        const attempts = [];
        missingWidgetFetch((options) => {
            attempts.push(JSON.parse(options.body).retry);
            return { status: "failed", code: "WIDGET_SAVE_FAILED" };
        });
        const { rerender } = render(
            <HomeAppletWidget applet={{ appletId: "failed-widget" }} />,
        );
        expect(await screen.findByRole("alert")).toHaveTextContent(
            "Couldn't load this app. Please try again.",
        );
        fireEvent.click(screen.getByRole("button", { name: "Retry" }));
        await screen.findByRole("alert");
        expect(attempts).toEqual([false, true]);
        rerender(
            <HomeAppletWidget
                applet={{ appletId: "failed-widget" }}
                reloadToken={1}
            />,
        );
        await screen.findByRole("alert");
        expect(attempts).toEqual([false, true, false]);
    });
});
