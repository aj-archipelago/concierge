import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import AppsPage from "../page";
import axios from "../../utils/axios-client";
import { useCurrentUser } from "../../queries/users";

const mockPush = jest.fn();
const mockInvalidateQueries = jest.fn();
let mockTab = "discover";

jest.mock("next/navigation", () => ({
    __esModule: true,
    useRouter: () => ({
        push: mockPush,
    }),
    useSearchParams: () => ({
        get: (key) => (key === "tab" ? mockTab : null),
        toString: () => (mockTab === "discover" ? "" : `tab=${mockTab}`),
    }),
}));

jest.mock("react-i18next", () => ({
    __esModule: true,
    useTranslation: () => ({
        t: (key, values = {}) =>
            Object.entries(values).reduce(
                (result, [name, value]) =>
                    result.replace(`{{${name}}}`, String(value)),
                key,
            ),
    }),
}));

jest.mock("@tanstack/react-query", () => ({
    __esModule: true,
    useQueryClient: () => ({
        invalidateQueries: mockInvalidateQueries,
    }),
}));

jest.mock("../../utils/axios-client", () => ({
    __esModule: true,
    default: {
        get: jest.fn(),
    },
}));

jest.mock("../../queries/users", () => ({
    __esModule: true,
    useCurrentUser: jest.fn(),
}));

jest.mock("@/src/contexts/LanguageProvider", () => ({
    __esModule: true,
    LanguageContext: require("react").createContext({ direction: "ltr" }),
}));

jest.mock("@/components/share/useShareSettings", () => ({
    __esModule: true,
    useShareSettings: () => ({ isShared: false }),
}));

jest.mock("@/components/share/ShareDialog", () => ({
    __esModule: true,
    default: () => null,
}));

jest.mock("@/src/components/apps/AppletCardActions", () => ({
    __esModule: true,
    useAppletCardInteractionLock: () => ({
        isInteractionHeld: false,
        suppressInteractionMotion: false,
        holdInteraction: jest.fn(),
    }),
    AppletCardMenu: ({
        applet,
        onEditMetadata,
        onToggleHome,
        onToggleHomeDirectory,
        onToggleInstall,
        open = false,
        onOpenChange,
    }) => {
        const React = require("react");
        return (
            <div data-testid="shared-applet-card-menu" data-open={open}>
                <button
                    type="button"
                    aria-label="More actions"
                    aria-expanded={open ? "true" : "false"}
                    onClick={() => onOpenChange?.(!open)}
                >
                    More actions
                </button>
                {open && (
                    <>
                        {onEditMetadata && (
                            <button type="button">Edit metadata</button>
                        )}
                        {onToggleHome && (
                            <button
                                type="button"
                                onClick={() =>
                                    onToggleHome(
                                        { stopPropagation: jest.fn() },
                                        applet,
                                    )
                                }
                            >
                                {applet.isHome
                                    ? "Unset home applet"
                                    : "Set as home applet"}
                            </button>
                        )}
                        {onToggleHomeDirectory && (
                            <button
                                type="button"
                                onClick={() =>
                                    onToggleHomeDirectory(
                                        { stopPropagation: jest.fn() },
                                        applet,
                                    )
                                }
                            >
                                {applet.isHomeDirectory
                                    ? "Remove from Home"
                                    : "Add to Home"}
                            </button>
                        )}
                        {onToggleInstall && (
                            <button
                                type="button"
                                onClick={() =>
                                    onToggleInstall(
                                        { stopPropagation: jest.fn() },
                                        applet,
                                    )
                                }
                            >
                                {applet.isInstalled
                                    ? "Remove from sidebar"
                                    : "Add to sidebar"}
                            </button>
                        )}
                    </>
                )}
            </div>
        );
    },
}));

jest.mock("../../applets/components/Applets", () => ({
    __esModule: true,
    default: ({ scope }) => (
        <div data-testid="applets-tab">
            {scope === "workspaces"
                ? "Workspaces surface"
                : scope === "shared"
                  ? "Shared applets surface"
                  : "My applets surface"}
        </div>
    ),
}));

describe("AppsPage", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockTab = "discover";
        global.fetch = jest.fn((url, options = {}) => {
            if (url === "/api/users/me/home-applet" && !options.method) {
                return Promise.resolve({
                    ok: true,
                    json: async () => ({
                        homeAppletId: null,
                        homeAppletIds: [],
                    }),
                });
            }
            return Promise.resolve({
                ok: true,
                json: async () => ({}),
            });
        });
        axios.get.mockResolvedValue({
            data: [
                {
                    _id: "native-home",
                    name: "Home",
                    slug: "home",
                    type: "native",
                    description:
                        "Open your personalized home workspace and digest overview.",
                },
                {
                    _id: "public-applet-app",
                    name: "Desk Brief",
                    slug: "desk-brief",
                    type: "applet",
                    listedInStore: true,
                    description: "Public briefing applet",
                    appletId: { _id: "canvas-1", name: "Desk Brief" },
                    author: { _id: "user-2", username: "Mina" },
                },
            ],
        });
        useCurrentUser.mockReturnValue({
            data: {
                _id: "user-1",
                apps: [],
            },
            isLoading: false,
        });
    });

    test("renders the discover applet library by default", async () => {
        render(<AppsPage />);

        expect(await screen.findByText("Applet Library")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Discover" })).toHaveClass(
            "border-sky-500",
        );
        expect(screen.queryByRole("button", { name: "Installed" })).toBeNull();
        expect(await screen.findByText("Desk Brief")).toBeInTheDocument();
        expect(screen.queryByText("Home")).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Add" })).toBeNull();
        expect(screen.queryByRole("button", { name: "Open" })).toBeNull();
        expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
        expect(
            screen.getByRole("button", { name: "More actions" }),
        ).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "More actions" }));
        expect(screen.getByText("Set as home applet")).toBeInTheDocument();
        expect(screen.getByText("Add to Home")).toBeInTheDocument();
        expect(screen.getByText("Add to sidebar")).toBeInTheDocument();
        expect(screen.queryByText("Edit metadata")).toBeNull();
    });

    test("shows placement badges on discover applets", async () => {
        useCurrentUser.mockReturnValue({
            data: {
                _id: "user-1",
                apps: [
                    {
                        appId: {
                            _id: "installed-app-1",
                            appletId: "canvas-1",
                        },
                    },
                ],
            },
            isLoading: false,
        });
        global.fetch = jest.fn((url, options = {}) => {
            if (url === "/api/users/me/home-applet" && !options.method) {
                return Promise.resolve({
                    ok: true,
                    json: async () => ({
                        homeAppletId: "canvas-1",
                        homeAppletIds: ["canvas-1"],
                    }),
                });
            }
            return Promise.resolve({
                ok: true,
                json: async () => ({}),
            });
        });

        render(<AppsPage />);

        expect(await screen.findByText("Desk Brief")).toBeInTheDocument();
        expect(await screen.findByText("In sidebar")).toBeInTheDocument();
        expect(screen.getByText("On Home")).toBeInTheDocument();
        expect(screen.getByText("Home applet")).toBeInTheDocument();
    });

    test("uses footer version metadata for image and fallback discover cards", async () => {
        axios.get.mockResolvedValueOnce({
            data: [
                {
                    _id: "image-applet-app",
                    name: "Image Desk",
                    slug: "image-desk",
                    type: "applet",
                    listedInStore: true,
                    description: "Image backed briefing applet",
                    imageLightUrl: "https://images.example/image-light.webp",
                    appletId: {
                        _id: "canvas-image",
                        name: "Image Desk",
                        publishedVersionIndex: 4,
                    },
                    author: { _id: "user-2", username: "Mina" },
                    updatedAt: "2026-06-16T00:00:00.000Z",
                },
                {
                    _id: "fallback-applet-app",
                    name: "Fallback Desk",
                    slug: "fallback-desk",
                    type: "applet",
                    listedInStore: true,
                    description: "Fallback briefing applet",
                    appletId: {
                        _id: "canvas-fallback",
                        name: "Fallback Desk",
                        publishedVersionIndex: 31,
                    },
                    author: { _id: "user-3", username: "Noor" },
                    updatedAt: "2026-06-02T00:00:00.000Z",
                },
            ],
        });

        render(<AppsPage />);

        expect(await screen.findByText("Image Desk")).toBeInTheDocument();
        expect(screen.getByText("Fallback Desk")).toBeInTheDocument();
        expect(screen.getByText(/Published v5 - Updated/)).toBeInTheDocument();
        expect(screen.getByText(/Published v32 - Updated/)).toBeInTheDocument();
        expect(screen.queryByText("Mina")).not.toBeInTheDocument();
        expect(screen.queryByText("Noor")).not.toBeInTheDocument();
    });

    test("discover applet menu can add public applets without metadata editing", async () => {
        axios.get.mockResolvedValueOnce({
            data: [
                {
                    _id: "owned-applet-app",
                    name: "Owned Desk",
                    slug: "owned-desk",
                    type: "applet",
                    listedInStore: true,
                    description: "Owned briefing applet",
                    appletId: { _id: "canvas-1", name: "Owned Desk" },
                    author: { _id: "user-1", username: "Jamal" },
                },
            ],
        });

        render(<AppsPage />);

        expect(await screen.findByText("Owned Desk")).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Open" })).toBeNull();
        expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
        expect(screen.queryByText("Edit metadata")).toBeNull();

        fireEvent.click(screen.getByRole("button", { name: "More actions" }));
        fireEvent.click(screen.getByText("Add to sidebar"));

        expect(global.fetch).toHaveBeenCalledWith(
            "/api/canvas-applets/canvas-1/install",
            { method: "POST" },
        );
        await waitFor(() =>
            expect(mockInvalidateQueries).toHaveBeenCalledWith({
                queryKey: ["currentUser"],
            }),
        );
    });

    test("keeps only one discover applet context menu open", async () => {
        axios.get.mockResolvedValueOnce({
            data: [
                {
                    _id: "first-applet-app",
                    name: "First Desk",
                    slug: "first-desk",
                    type: "applet",
                    listedInStore: true,
                    description: "First briefing applet",
                    appletId: { _id: "canvas-1", name: "First Desk" },
                    author: { _id: "user-2", username: "Mina" },
                },
                {
                    _id: "second-applet-app",
                    name: "Second Desk",
                    slug: "second-desk",
                    type: "applet",
                    listedInStore: true,
                    description: "Second briefing applet",
                    appletId: { _id: "canvas-2", name: "Second Desk" },
                    author: { _id: "user-3", username: "Noor" },
                },
            ],
        });

        render(<AppsPage />);

        expect(await screen.findByText("First Desk")).toBeInTheDocument();
        expect(screen.getByText("Second Desk")).toBeInTheDocument();

        const menuButtons = screen.getAllByRole("button", {
            name: "More actions",
        });
        fireEvent.click(menuButtons[0]);

        expect(
            screen.getAllByTestId("shared-applet-card-menu")[0],
        ).toHaveAttribute("data-open", "true");
        expect(
            screen.getAllByTestId("shared-applet-card-menu")[1],
        ).toHaveAttribute("data-open", "false");

        fireEvent.click(menuButtons[1]);

        expect(
            screen.getAllByTestId("shared-applet-card-menu")[0],
        ).toHaveAttribute("data-open", "false");
        expect(
            screen.getAllByTestId("shared-applet-card-menu")[1],
        ).toHaveAttribute("data-open", "true");
    });

    test("filters discover applets with the shared app search field", async () => {
        axios.get.mockResolvedValueOnce({
            data: [
                {
                    _id: "public-applet-app",
                    name: "Desk Brief",
                    slug: "desk-brief",
                    type: "applet",
                    listedInStore: true,
                    description: "Public briefing applet",
                    appletId: { _id: "canvas-1", name: "Desk Brief" },
                    author: { _id: "user-2", username: "Mina" },
                },
                {
                    _id: "public-calendar-app",
                    name: "Calendar Planner",
                    slug: "calendar-planner",
                    type: "applet",
                    listedInStore: true,
                    description: "Schedule planning applet",
                    appletId: {
                        _id: "canvas-2",
                        name: "Calendar Planner",
                    },
                },
            ],
        });

        render(<AppsPage />);

        expect(await screen.findByText("Desk Brief")).toBeInTheDocument();
        expect(screen.getByText("Calendar Planner")).toBeInTheDocument();

        fireEvent.change(screen.getByRole("textbox"), {
            target: { value: "calendar" },
        });

        expect(screen.queryByText("Desk Brief")).not.toBeInTheDocument();
        expect(screen.getByText("Calendar Planner")).toBeInTheDocument();
    });

    test("sorts discover applets from the shared control bar", async () => {
        axios.get.mockResolvedValueOnce({
            data: [
                {
                    _id: "zebra-applet-app",
                    name: "Zebra Desk",
                    slug: "zebra-desk",
                    type: "applet",
                    listedInStore: true,
                    description: "Later applet",
                    appletId: { _id: "canvas-1", name: "Zebra Desk" },
                    updatedAt: "2026-06-18T00:00:00.000Z",
                },
                {
                    _id: "alpha-applet-app",
                    name: "Alpha Desk",
                    slug: "alpha-desk",
                    type: "applet",
                    listedInStore: true,
                    description: "Earlier applet",
                    appletId: { _id: "canvas-2", name: "Alpha Desk" },
                    updatedAt: "2026-06-17T00:00:00.000Z",
                },
            ],
        });

        render(<AppsPage />);

        const zebra = await screen.findByText("Zebra Desk");
        const alpha = screen.getByText("Alpha Desk");
        expect(
            zebra.compareDocumentPosition(alpha) &
                Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();

        fireEvent.change(screen.getByRole("combobox", { name: "Sort:" }), {
            target: { value: "name-asc" },
        });

        expect(
            screen
                .getByText("Alpha Desk")
                .compareDocumentPosition(screen.getByText("Zebra Desk")) &
                Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
    });

    test("treats the old installed tab query as discover", async () => {
        mockTab = "installed";

        render(<AppsPage />);

        expect(screen.getByRole("button", { name: "Discover" })).toHaveClass(
            "border-sky-500",
        );
        expect(await screen.findByText("Desk Brief")).toBeInTheDocument();
    });

    test("routes applet tabs without moving sidebar editing into the page", async () => {
        render(<AppsPage />);

        fireEvent.click(
            await screen.findByRole("button", { name: "My Applets" }),
        );
        expect(mockPush).toHaveBeenCalledWith("/apps?tab=my-applets");

        fireEvent.click(screen.getByRole("button", { name: "Workspaces" }));
        expect(mockPush).toHaveBeenCalledWith("/apps?tab=workspaces");

        mockTab = "workspaces";
        render(<AppsPage />);

        expect(screen.getByTestId("applets-tab")).toHaveTextContent(
            "Workspaces surface",
        );

        mockTab = "shared";
        render(<AppsPage />);

        expect(screen.getAllByTestId("applets-tab").at(-1)).toHaveTextContent(
            "Shared applets surface",
        );
    });

    test("does not fetch the app catalog when landing on applet-only tabs", () => {
        mockTab = "my-applets";

        render(<AppsPage />);

        expect(screen.getByTestId("applets-tab")).toHaveTextContent(
            "My applets surface",
        );
        expect(axios.get).not.toHaveBeenCalled();
    });
});
