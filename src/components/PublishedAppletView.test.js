import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import PublishedAppletView from "./PublishedAppletView";
import { useAddChat } from "../../app/queries/chats";

jest.mock("@/src/components/sandbox/OutputSandbox", () => ({
    __esModule: true,
    default: ({ autoResize, content, height }) => (
        <div
            data-auto-resize={String(autoResize)}
            data-content={content || ""}
            data-height={height || ""}
            data-testid="output-sandbox"
        />
    ),
}));

jest.mock("next/navigation", () => ({
    useRouter: jest.fn(() => ({ push: jest.fn(), replace: jest.fn() })),
    useSearchParams: jest.fn(() => new URLSearchParams("")),
}));

jest.mock("react-redux", () => ({
    useDispatch: jest.fn(() => jest.fn()),
}));

jest.mock("react-i18next", () => ({
    useTranslation: () => ({
        t: (key) => key,
    }),
}));

jest.mock("../../app/queries/chats", () => ({
    useAddChat: jest.fn(),
}));

jest.mock("@/src/contexts/ThemeProvider", () => ({
    ThemeContext: require("react").createContext({ theme: "light" }),
}));

jest.mock("@/src/utils/openCanvasApplet", () => ({
    openCanvasAppletInChat: jest.fn(),
}));

describe("PublishedAppletView", () => {
    const renderView = () =>
        render(
            <PublishedAppletView
                applet={{
                    _id: "applet-1",
                    publishedHtml: "<main>Published applet</main>",
                }}
                app={{ _id: "app-1" }}
                meta={{ canAdminCopy: true }}
                isLoading={false}
                error={null}
            />,
        );

    beforeEach(() => {
        jest.clearAllMocks();
        const { useSearchParams } = require("next/navigation");
        useSearchParams.mockReturnValue(new URLSearchParams(""));
        useAddChat.mockReturnValue({ mutateAsync: jest.fn() });
    });

    it("shows copy action but no sidebar install action in the normal shell", () => {
        renderView();

        expect(
            screen.getByRole("button", { name: "Copy to my account" }),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole("button", { name: "Add to my apps" }),
        ).not.toBeInTheDocument();
        expect(screen.getByTestId("output-sandbox")).toHaveAttribute(
            "data-height",
            "100%",
        );
        expect(screen.getByTestId("output-sandbox")).toHaveAttribute(
            "data-auto-resize",
            "false",
        );
    });

    it("hides published applet actions in embed mode", () => {
        const { useSearchParams } = require("next/navigation");
        useSearchParams.mockReturnValue(new URLSearchParams("embed=true"));

        renderView();

        expect(
            screen.queryByRole("button", { name: "Copy to my account" }),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByRole("button", { name: "Add to my apps" }),
        ).not.toBeInTheDocument();
        expect(screen.getByTestId("output-sandbox")).toBeInTheDocument();
    });
});
