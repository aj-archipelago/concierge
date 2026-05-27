import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import CanvasAppletManageDialog from "../CanvasAppletManageDialog";

jest.mock("react-i18next", () => ({
    __esModule: true,
    useTranslation: () => ({
        t: (key, params) =>
            params
                ? key.replace(/\{\{(\w+)\}\}/g, (_, name) => params[name] || "")
                : key,
    }),
}));

jest.mock("@/src/App", () => {
    const React = require("react");
    return {
        ServerContext: React.createContext({
            serverUrl: "https://concierge.test",
        }),
    };
});

jest.mock("@/components/ui/dialog", () => ({
    Dialog: ({ children, open }) => (open ? <div>{children}</div> : null),
    DialogContent: ({ children }) => <div>{children}</div>,
    DialogDescription: ({ children }) => <p>{children}</p>,
    DialogFooter: ({ children }) => <div>{children}</div>,
    DialogHeader: ({ children }) => <div>{children}</div>,
    DialogTitle: ({ children }) => <h2>{children}</h2>,
}));

const appletRecord = {
    _id: "applet-123",
    name: "Weather Applet",
    app: null,
};

describe("CanvasAppletManageDialog", () => {
    beforeEach(() => {
        global.fetch = jest.fn();
        Object.assign(navigator, {
            clipboard: {
                writeText: jest.fn(),
            },
        });
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it("publishes an already published direct-link applet to the app store without unpublishing", async () => {
        const onAppUpdated = jest.fn();
        global.fetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({}),
        });

        render(
            <CanvasAppletManageDialog
                isOpen={true}
                onClose={jest.fn()}
                onUnpublish={jest.fn()}
                appletRecord={appletRecord}
                onAppUpdated={onAppUpdated}
            />,
        );

        expect(
            screen.getByDisplayValue(
                "https://concierge.test/published/applets/applet-123",
            ),
        ).toHaveValue("https://concierge.test/published/applets/applet-123");
        expect(screen.queryByLabelText("App Name")).not.toBeInTheDocument();

        await userEvent.click(
            screen.getByRole("button", { name: "Add to App Store" }),
        );

        expect(screen.getByLabelText("App Name")).toHaveValue("Weather Applet");
        expect(screen.getByLabelText("App Slug")).toHaveValue("weather-applet");

        await userEvent.type(
            screen.getByLabelText("App Description"),
            "Weather tools for the newsroom",
        );
        await userEvent.click(
            screen.getByRole("button", { name: "Publish to App Store" }),
        );

        await waitFor(() => {
            expect(onAppUpdated).toHaveBeenCalled();
        });

        expect(global.fetch).toHaveBeenCalledWith(
            "/api/canvas-applets/applet-123",
            expect.objectContaining({
                method: "PUT",
                body: JSON.stringify({
                    publishToAppStore: true,
                    appName: "Weather Applet",
                    appSlug: "weather-applet",
                    appDescription: "Weather tools for the newsroom",
                    appIcon: "AppWindow",
                }),
            }),
        );
    });
});
