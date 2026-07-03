import React from "react";
import {
    act,
    fireEvent,
    render,
    screen,
    waitFor,
} from "@testing-library/react";
import "@testing-library/jest-dom";
import AppletMetadataDialog from "./AppletMetadataDialog";
import { ThemeContext } from "@/src/contexts/ThemeProvider";

jest.mock("react-i18next", () => ({
    __esModule: true,
    useTranslation: () => ({
        t: (key, values) =>
            values
                ? key.replace(/\{\{(\w+)\}\}/g, (_, name) => values[name] || "")
                : key,
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

jest.mock("@/components/ui/dialog", () => ({
    __esModule: true,
    Dialog: ({ open, children }) => (open ? <div>{children}</div> : null),
    DialogContent: ({ children, className }) => (
        <div className={className}>{children}</div>
    ),
    DialogDescription: ({ children }) => <p>{children}</p>,
    DialogFooter: ({ children, className }) => (
        <div className={className}>{children}</div>
    ),
    DialogHeader: ({ children }) => <div>{children}</div>,
    DialogTitle: ({ children }) => <h2>{children}</h2>,
}));

jest.mock("@/src/utils/fileDownloadUtils", () => ({
    __esModule: true,
    getDownloadUrl: (url) => url,
}));

describe("AppletMetadataDialog", () => {
    let savedAppMetadata;

    beforeEach(() => {
        jest.useFakeTimers();
        jest.clearAllMocks();
        savedAppMetadata = {};
        global.fetch = jest.fn((url, options = {}) => {
            if (
                url ===
                    "/api/canvas-applets/69f68d347999b2bbd8ffb91a/image/generate" &&
                options.method === "POST"
            ) {
                const body = JSON.parse(options.body || "{}");
                if (body.variant === "light") {
                    return Promise.resolve({
                        ok: true,
                        json: async () => ({
                            taskId: "task-light",
                            variants: {
                                light: { taskId: "task-light" },
                            },
                        }),
                    });
                }
                return Promise.resolve({
                    ok: true,
                    json: async () => ({
                        taskId: "task-dark",
                        variants: {
                            dark: { taskId: "task-dark" },
                        },
                    }),
                });
            }
            if (
                url ===
                    "/api/canvas-applets/69f68d347999b2bbd8ffb91a/metadata/generate" &&
                options.method === "POST"
            ) {
                return Promise.resolve({
                    ok: true,
                    json: async () => ({
                        metadata: {
                            name: "Generated Storm Desk",
                            slug: "generated-storm-desk",
                            description: "Generated coverage workflow.",
                            badgeLabel: "Weather",
                            icon: "CloudSun",
                            imageUrl: "https://images.example/metadata.webp",
                            imageLightUrl:
                                "https://images.example/metadata-light.webp",
                            imageDarkUrl:
                                "https://images.example/metadata-dark.webp",
                            imageAlt: "Generated metadata image alt",
                            tags: ["weather", "desk"],
                            category: "Planning",
                            metadataGeneratedAt: "2026-06-16T00:00:00.000Z",
                        },
                    }),
                });
            }
            if (url === "/api/tasks/task-light") {
                return Promise.resolve({
                    ok: true,
                    json: async () => ({
                        status: "completed",
                        data: {
                            azureUrl: "https://images.example/storm-light.webp",
                        },
                    }),
                });
            }
            if (url === "/api/tasks/task-dark") {
                return Promise.resolve({
                    ok: true,
                    json: async () => ({
                        status: "completed",
                        data: {
                            azureUrl: "https://images.example/storm-dark.webp",
                        },
                    }),
                });
            }
            if (
                url === "/api/canvas-applets/69f68d347999b2bbd8ffb91a" &&
                options.method === "PUT"
            ) {
                savedAppMetadata = {
                    ...savedAppMetadata,
                    ...JSON.parse(options.body).appMetadata,
                };
                return Promise.resolve({
                    ok: true,
                    json: async () => ({
                        _id: "69f68d347999b2bbd8ffb91a",
                        app: savedAppMetadata,
                    }),
                });
            }
            if (
                url === "/api/canvas-applets/69f68d347999b2bbd8ffb91a" &&
                !options.method
            ) {
                return Promise.resolve({
                    ok: true,
                    json: async () => ({
                        _id: "69f68d347999b2bbd8ffb91a",
                        app: savedAppMetadata,
                    }),
                });
            }
            return Promise.resolve({
                ok: false,
                json: async () => ({ error: "unexpected request" }),
            });
        });
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    test("generates an applet card image and fills light and dark image URLs", async () => {
        const onSaved = jest.fn();
        render(
            <AppletMetadataDialog
                isOpen
                applet={{
                    _id: "69f68d347999b2bbd8ffb91a",
                    name: "Storm Desk",
                    app: {
                        slug: "storm-desk",
                        description: "Track active storm coverage.",
                    },
                }}
                onClose={jest.fn()}
                onSaved={onSaved}
            />,
        );

        fireEvent.click(
            screen.getByRole("button", { name: "Generate Images" }),
        );
        expect(
            screen.getByRole("button", { name: "Generate Images" }),
        ).toBeDisabled();
        expect(screen.queryByRole("status")).not.toBeInTheDocument();

        await waitFor(() => {
            expect(global.fetch).toHaveBeenCalledWith(
                "/api/canvas-applets/69f68d347999b2bbd8ffb91a/image/generate",
                expect.objectContaining({
                    method: "POST",
                    body: expect.stringContaining("Storm Desk"),
                }),
            );
        });
        await act(async () => {
            await jest.advanceTimersByTimeAsync(1000);
        });

        await waitFor(() => {
            expect(screen.getByLabelText("Dark image URL")).toHaveValue(
                "https://images.example/storm-dark.webp",
            );
        });
        expect(screen.getByLabelText("Light image URL")).toHaveValue("");
        expect(
            screen.getByRole("button", { name: "Generate Images" }),
        ).not.toBeDisabled();

        await act(async () => {
            await jest.advanceTimersByTimeAsync(1000);
        });

        await waitFor(() => {
            expect(screen.getByLabelText("Light image URL")).toHaveValue(
                "https://images.example/storm-light.webp",
            );
        });
        expect(screen.getByLabelText("Dark image URL")).toHaveValue(
            "https://images.example/storm-dark.webp",
        );
        await waitFor(() => {
            expect(global.fetch).toHaveBeenCalledWith(
                "/api/canvas-applets/69f68d347999b2bbd8ffb91a",
                expect.objectContaining({
                    method: "PUT",
                    body: expect.stringContaining(
                        "https://images.example/storm-dark.webp",
                    ),
                }),
            );
        });
        const saveCalls = global.fetch.mock.calls.filter(
            ([url, options = {}]) =>
                url === "/api/canvas-applets/69f68d347999b2bbd8ffb91a" &&
                options.method === "PUT",
        );
        expect(JSON.parse(saveCalls[0][1].body).appMetadata).toMatchObject({
            imageUrl: "https://images.example/storm-dark.webp",
            imageLightUrl: "",
            imageDarkUrl: "https://images.example/storm-dark.webp",
            imageAlt: "Generated applet image for Storm Desk",
        });
        expect(
            JSON.parse(saveCalls[saveCalls.length - 1][1].body).appMetadata,
        ).toEqual({
            imageLightUrl: "https://images.example/storm-light.webp",
        });
        expect(onSaved).toHaveBeenCalledWith(
            expect.objectContaining({
                _id: "69f68d347999b2bbd8ffb91a",
                app: expect.objectContaining({
                    imageLightUrl: "https://images.example/storm-light.webp",
                    imageDarkUrl: "https://images.example/storm-dark.webp",
                }),
            }),
        );
    });

    test("persists a queued light image after the dialog closes", async () => {
        const onSaved = jest.fn();
        const applet = {
            _id: "69f68d347999b2bbd8ffb91a",
            name: "Storm Desk",
            app: {
                slug: "storm-desk",
                description: "Track active storm coverage.",
            },
        };
        const { rerender } = render(
            <AppletMetadataDialog
                isOpen
                applet={applet}
                onClose={jest.fn()}
                onSaved={onSaved}
            />,
        );

        fireEvent.click(
            screen.getByRole("button", { name: "Generate Images" }),
        );
        await act(async () => {
            await jest.advanceTimersByTimeAsync(1000);
        });
        await waitFor(() => {
            expect(screen.getByLabelText("Dark image URL")).toHaveValue(
                "https://images.example/storm-dark.webp",
            );
        });

        rerender(
            <AppletMetadataDialog
                isOpen={false}
                applet={applet}
                onClose={jest.fn()}
                onSaved={onSaved}
            />,
        );
        await act(async () => {
            await jest.advanceTimersByTimeAsync(1000);
        });

        let saveCalls;
        await waitFor(() => {
            saveCalls = global.fetch.mock.calls.filter(
                ([url, options = {}]) =>
                    url === "/api/canvas-applets/69f68d347999b2bbd8ffb91a" &&
                    options.method === "PUT",
            );
            expect(saveCalls).toHaveLength(2);
        });
        expect(JSON.parse(saveCalls[1][1].body).appMetadata).toEqual({
            imageLightUrl: "https://images.example/storm-light.webp",
        });
        expect(onSaved).toHaveBeenLastCalledWith(
            expect.objectContaining({
                app: expect.objectContaining({
                    imageLightUrl: "https://images.example/storm-light.webp",
                    imageDarkUrl: "https://images.example/storm-dark.webp",
                }),
            }),
        );
    });

    test("saves a queued light image without overwriting metadata edits", async () => {
        const onClose = jest.fn();
        const onSaved = jest.fn();
        render(
            <AppletMetadataDialog
                isOpen
                applet={{
                    _id: "69f68d347999b2bbd8ffb91a",
                    name: "Storm Desk",
                    app: {
                        slug: "storm-desk",
                        description: "Track active storm coverage.",
                    },
                }}
                onClose={onClose}
                onSaved={onSaved}
            />,
        );

        fireEvent.click(
            screen.getByRole("button", { name: "Generate Images" }),
        );
        await act(async () => {
            await jest.advanceTimersByTimeAsync(1000);
        });
        await waitFor(() => {
            expect(screen.getByLabelText("Dark image URL")).toHaveValue(
                "https://images.example/storm-dark.webp",
            );
        });

        fireEvent.change(screen.getByLabelText("Image alt text"), {
            target: { value: "Custom saved storm desk art" },
        });
        fireEvent.click(screen.getByRole("button", { name: "Save metadata" }));
        await waitFor(() => {
            expect(onClose).toHaveBeenCalled();
        });

        await act(async () => {
            await jest.advanceTimersByTimeAsync(1000);
        });

        let saveCalls;
        await waitFor(() => {
            saveCalls = global.fetch.mock.calls.filter(
                ([url, options = {}]) =>
                    url === "/api/canvas-applets/69f68d347999b2bbd8ffb91a" &&
                    options.method === "PUT",
            );
            expect(saveCalls).toHaveLength(3);
        });
        expect(JSON.parse(saveCalls[1][1].body).appMetadata).toMatchObject({
            imageAlt: "Custom saved storm desk art",
        });
        expect(JSON.parse(saveCalls[2][1].body).appMetadata).toEqual({
            imageLightUrl: "https://images.example/storm-light.webp",
        });
        expect(onSaved).toHaveBeenLastCalledWith(
            expect.objectContaining({
                app: expect.objectContaining({
                    imageAlt: "Custom saved storm desk art",
                    imageLightUrl: "https://images.example/storm-light.webp",
                    imageDarkUrl: "https://images.example/storm-dark.webp",
                }),
            }),
        );
    });

    test("shows an inline error when a completed image task has no retrievable URL", async () => {
        global.fetch = jest.fn((url, options = {}) => {
            if (
                url ===
                    "/api/canvas-applets/69f68d347999b2bbd8ffb91a/image/generate" &&
                options.method === "POST"
            ) {
                return Promise.resolve({
                    ok: true,
                    json: async () => ({ taskId: "task-missing-url" }),
                });
            }
            if (url === "/api/tasks/task-missing-url") {
                return Promise.resolve({
                    ok: true,
                    json: async () => ({
                        status: "completed",
                        data: {},
                    }),
                });
            }
            if (url === "/api/media-items?page=1&limit=100") {
                return Promise.resolve({
                    ok: true,
                    json: async () => ({
                        mediaItems: [
                            {
                                taskId: "task-missing-url",
                                status: "completed",
                            },
                        ],
                    }),
                });
            }
            return Promise.resolve({
                ok: false,
                json: async () => ({ error: "unexpected request" }),
            });
        });

        render(
            <AppletMetadataDialog
                isOpen
                applet={{
                    _id: "69f68d347999b2bbd8ffb91a",
                    name: "Storm Desk",
                    app: {
                        slug: "storm-desk",
                    },
                }}
                onClose={jest.fn()}
                onSaved={jest.fn()}
            />,
        );

        fireEvent.click(
            screen.getByRole("button", { name: "Generate Images" }),
        );

        await act(async () => {
            await jest.advanceTimersByTimeAsync(9000);
        });

        expect(
            await screen.findByText(
                "Image generation completed but the image URL could not be retrieved. The image may still be available on the Media page.",
            ),
        ).toBeInTheDocument();
        expect(screen.getByLabelText("Light image URL")).toHaveValue("");
        expect(screen.getByLabelText("Dark image URL")).toHaveValue("");
    });

    test("generates metadata without overwriting custom image URLs", async () => {
        render(
            <AppletMetadataDialog
                isOpen
                applet={{
                    _id: "69f68d347999b2bbd8ffb91a",
                    name: "Storm Desk",
                    app: {
                        slug: "storm-desk",
                        description: "Track active storm coverage.",
                        imageUrl: "https://images.example/current.webp",
                        imageLightUrl:
                            "https://images.example/current-light.webp",
                        imageDarkUrl:
                            "https://images.example/current-dark.webp",
                        imageAlt: "Current image alt",
                    },
                }}
                onClose={jest.fn()}
                onSaved={jest.fn()}
            />,
        );

        fireEvent.click(
            screen.getByRole("button", { name: "Generate Metadata" }),
        );

        await waitFor(() => {
            expect(screen.getByLabelText("Name")).toHaveValue(
                "Generated Storm Desk",
            );
        });
        expect(screen.getByLabelText("Light image URL")).toHaveValue(
            "https://images.example/current-light.webp",
        );
        expect(screen.getByLabelText("Dark image URL")).toHaveValue(
            "https://images.example/current-dark.webp",
        );
        expect(screen.getByLabelText("Image alt text")).toHaveValue(
            "Current image alt",
        );
    });

    test("preview theme toggle swaps between light and dark image URLs", async () => {
        render(
            <AppletMetadataDialog
                isOpen
                applet={{
                    _id: "69f68d347999b2bbd8ffb91a",
                    name: "Headline Generator",
                    app: {
                        slug: "headline-generator",
                        description: "Generate and compare headlines.",
                        imageUrl: "https://images.example/headline-light.webp",
                        imageLightUrl:
                            "https://images.example/headline-light.webp",
                        imageDarkUrl:
                            "https://images.example/headline-dark.webp",
                    },
                }}
                onClose={jest.fn()}
                onSaved={jest.fn()}
            />,
        );

        expect(screen.getByTestId("app-catalog-card-image")).toHaveAttribute(
            "src",
            "https://images.example/headline-light.webp",
        );

        fireEvent.click(screen.getByRole("button", { name: "Dark" }));

        await waitFor(() => {
            expect(
                screen.getByTestId("app-catalog-card-image"),
            ).toHaveAttribute(
                "src",
                "https://images.example/headline-dark.webp",
            );
        });
    });

    test("preview uses the same app-library card treatment as the apps page", () => {
        render(
            <AppletMetadataDialog
                isOpen
                applet={{
                    _id: "69f68d347999b2bbd8ffb91a",
                    name: "Planning Desk",
                    app: {
                        slug: "planning-desk",
                        description: "Plan daily coverage.",
                        category: "Planning",
                        tags: ["daily", "desk"],
                    },
                }}
                onClose={jest.fn()}
                onSaved={jest.fn()}
            />,
        );

        expect(screen.getByTestId("app-catalog-card-overlay")).toHaveClass(
            "bg-[linear-gradient(180deg,rgba(255,255,255,0)_0%,rgba(255,255,255,0)_40%,rgba(255,255,255,0.8)_66%,rgba(255,255,255,0.94)_100%)]",
        );
        expect(screen.getAllByText("Planning")).toHaveLength(1);
    });

    test("preview starts in dark mode when the app theme is dark", () => {
        render(
            <ThemeContext.Provider value={{ theme: "dark" }}>
                <AppletMetadataDialog
                    isOpen
                    applet={{
                        _id: "69f68d347999b2bbd8ffb91a",
                        name: "Headline Generator",
                        app: {
                            slug: "headline-generator",
                            description: "Generate and compare headlines.",
                            imageUrl:
                                "https://images.example/headline-light.webp",
                            imageLightUrl:
                                "https://images.example/headline-light.webp",
                            imageDarkUrl:
                                "https://images.example/headline-dark.webp",
                        },
                    }}
                    onClose={jest.fn()}
                    onSaved={jest.fn()}
                />
            </ThemeContext.Provider>,
        );

        expect(screen.getByRole("button", { name: "Dark" })).toHaveAttribute(
            "aria-pressed",
            "true",
        );
        expect(screen.getByTestId("app-catalog-card-image")).toHaveAttribute(
            "src",
            "https://images.example/headline-dark.webp",
        );
    });
});
