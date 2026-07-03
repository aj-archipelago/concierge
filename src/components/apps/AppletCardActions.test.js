import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { AppletCardMenu } from "./AppletCardActions";

const mockUseShareSettings = jest.fn();

jest.mock("react-i18next", () => ({
    __esModule: true,
    useTranslation: () => ({ t: (key) => key }),
}));

jest.mock("@/components/share/useShareSettings", () => ({
    __esModule: true,
    useShareSettings: (...args) => mockUseShareSettings(...args),
}));

jest.mock("@/components/share/ShareDialog", () => ({
    __esModule: true,
    default: () => null,
}));

jest.mock("@/components/ui/dropdown-menu", () => ({
    __esModule: true,
    DropdownMenu: ({ children }) => <div>{children}</div>,
    DropdownMenuTrigger: ({ children }) => children,
    DropdownMenuContent: ({ children }) => <div role="menu">{children}</div>,
    DropdownMenuItem: ({ children, onClick }) => (
        <button type="button" role="menuitem" onClick={onClick}>
            {children}
        </button>
    ),
    DropdownMenuCheckboxItem: ({ children }) => (
        <button type="button" role="menuitemcheckbox" aria-checked="false">
            {children}
        </button>
    ),
    DropdownMenuSeparator: () => <hr />,
}));

describe("AppletCardMenu", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockUseShareSettings.mockReturnValue({
            data: undefined,
            isShared: false,
        });
    });

    it("uses preloaded outgoing share state without fetching on card render", () => {
        render(
            <AppletCardMenu
                applet={{
                    _id: "applet-1",
                    type: "canvas",
                    canDelete: true,
                    isSharedOut: true,
                }}
            />,
        );

        expect(mockUseShareSettings).toHaveBeenCalledWith(
            "applet",
            "applet-1",
            { enabled: false },
        );
        expect(screen.getByRole("menuitem", { name: /Shared/ })).toBeVisible();
    });

    it("keeps fetching share state for callers without preloaded status", () => {
        render(
            <AppletCardMenu
                applet={{
                    _id: "applet-1",
                    type: "canvas",
                    canDelete: true,
                }}
            />,
        );

        expect(mockUseShareSettings).toHaveBeenCalledWith(
            "applet",
            "applet-1",
            { enabled: true },
        );
        expect(screen.getByRole("menuitem", { name: /Share/ })).toBeVisible();
    });
});
