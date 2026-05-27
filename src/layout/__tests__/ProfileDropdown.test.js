import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import ProfileDropdown from "../ProfileDropdown";
import { LanguageContext } from "../../contexts/LanguageProvider";

jest.mock("react-i18next", () => ({
    __esModule: true,
    useTranslation: () => ({
        t: (key) => key,
    }),
}));

jest.mock("../../contexts/LanguageProvider", () => {
    const React = require("react");
    return {
        __esModule: true,
        LanguageContext: React.createContext({ direction: "ltr" }),
    };
});

jest.mock("../../components/UserAvatar", () => ({
    __esModule: true,
    default: ({ name }) => <div aria-label={name}>Avatar</div>,
}));

jest.mock("../../components/SignOutButton", () => ({
    __esModule: true,
    SignOutButton: ({ className }) => (
        <button className={className} type="button">
            Sign out
        </button>
    ),
}));

describe("ProfileDropdown", () => {
    it("keeps long account names constrained inside the menu", () => {
        const longName =
            "averyveryveryveryveryveryveryveryverylong.email.username@example.com";

        render(
            <LanguageContext.Provider value={{ direction: "ltr" }}>
                <ProfileDropdown
                    user={{ name: longName, initials: "AV" }}
                    handleShowOptions={jest.fn()}
                    setShowTos={jest.fn()}
                />
            </LanguageContext.Provider>,
        );

        fireEvent.click(screen.getByRole("button"));

        const menu = screen.getByRole("menu");
        expect(menu).toHaveClass("max-w-[calc(100vw-1rem)]");
        expect(menu).toHaveClass("overflow-hidden");

        const signedInLabel = screen.getByText("Signed in as");
        expect(signedInLabel).toHaveClass("truncate");

        const name = screen.getByText(longName);
        expect(name).toHaveClass("max-w-full", "truncate");
        expect(name).toHaveAttribute("title", longName);
    });
});
