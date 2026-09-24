import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import CanvasAppletPublishDialog from "../CanvasAppletPublishDialog";

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

jest.mock("@/components/ui/dialog", () => ({
    Dialog: ({ children, open }) => (open ? <div>{children}</div> : null),
    DialogContent: ({ children, className }) => (
        <div data-testid="dialog-content" className={className}>
            {children}
        </div>
    ),
    DialogDescription: ({ children }) => <p>{children}</p>,
    DialogFooter: ({ children, className }) => (
        <div data-testid="dialog-footer" className={className}>
            {children}
        </div>
    ),
    DialogHeader: ({ children, className }) => (
        <div data-testid="dialog-header" className={className}>
            {children}
        </div>
    ),
    DialogTitle: ({ children }) => <h2>{children}</h2>,
}));

jest.mock("@/src/components/UserAvatar", () => ({
    __esModule: true,
    default: () => <div data-testid="user-avatar" />,
}));

jest.mock("@/components/share/useShareSettings", () => ({
    useShareSettings: () => ({ data: null }),
}));

jest.mock("@/components/share/UserPicker", () => ({
    __esModule: true,
    default: () => <div data-testid="user-picker" />,
}));

describe("CanvasAppletPublishDialog", () => {
    it("constrains height to the viewport and scrolls the form body", () => {
        render(
            <CanvasAppletPublishDialog
                isOpen={true}
                onClose={jest.fn()}
                onConfirm={jest.fn()}
                appletRecord={{ _id: "applet-1", name: "Demo Applet" }}
                isUpdate={true}
            />,
        );

        const content = screen.getByTestId("dialog-content");
        expect(content).toHaveClass("max-h-[calc(100vh-2rem)]");
        expect(content).toHaveClass("overflow-hidden");
        expect(content).toHaveClass("w-[calc(100vw-1rem)]");
        expect(content).toHaveClass("sm:max-w-md");

        expect(screen.getByTestId("dialog-header")).toHaveClass("shrink-0");
        expect(screen.getByTestId("dialog-footer")).toHaveClass("shrink-0");

        const scrollBody = screen.getByTestId("publish-dialog-scroll-body");
        expect(scrollBody).toHaveClass("overflow-y-auto");
        expect(scrollBody).toHaveClass("min-h-0");
        expect(scrollBody).toHaveClass("flex-1");

        expect(
            screen.getByRole("heading", { name: "Update Published Applet" }),
        ).toBeInTheDocument();
    });
});
