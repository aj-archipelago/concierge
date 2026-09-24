import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom";
import PersonalizationPortal from "./PersonalizationPortal";

jest.mock("../../App", () => ({
    AuthContext: require("react").createContext({
        user: { name: "Preview user", personalEntityId: "personal" },
    }),
}));
jest.mock("../../contexts/LanguageProvider", () => ({
    LanguageContext: require("react").createContext({ direction: "ltr" }),
}));
jest.mock("react-i18next", () => ({
    useTranslation: () => ({ t: (key) => key, i18n: { dir: () => "ltr" } }),
}));
jest.mock("./ProfileSection", () => () => <p>Profile controls</p>);
jest.mock("./DiscoverSection", () => () => <p>Overview controls</p>);
jest.mock("./SharingSection", () => () => <p>Sharing controls</p>);
jest.mock("../chat/McpConfigDialog", () => ({
    McpConfigContent: () => <p>Connector controls</p>,
}));
jest.mock("../chat/SkillsDialog", () => ({
    SkillsContent: () => <p>Skill controls</p>,
}));
jest.mock("../SecretsEditor", () => () => <p>Secret controls</p>);

it("keeps every section reachable and closes with Escape", () => {
    const close = jest.fn();
    render(<PersonalizationPortal open onClose={close} initialTab="profile" />);
    const navigation = within(
        screen.getByRole("navigation", { name: "portal_title" }),
    );
    expect(screen.getByText("Profile controls")).toBeInTheDocument();
    fireEvent.click(
        navigation.getByRole("button", { name: "portal_tab_sharing" }),
    );
    expect(screen.getByText("Sharing controls")).toBeInTheDocument();
    expect(
        navigation.getByRole("button", { name: "portal_tab_sharing" }),
    ).toHaveAttribute("aria-current", "page");
    fireEvent.click(
        navigation.getByRole("button", { name: "portal_tab_capabilities" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Skills" }));
    expect(screen.getByText("Skill controls")).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(close).toHaveBeenCalledTimes(1);
});

it("follows a new capability shortcut while Settings is already open", () => {
    const { rerender } = render(
        <PersonalizationPortal
            open
            onClose={() => {}}
            initialTab="capabilities"
            initialSubTab="connectors"
        />,
    );
    expect(screen.getByText("Connector controls")).toBeInTheDocument();
    rerender(
        <PersonalizationPortal
            open
            onClose={() => {}}
            initialTab="capabilities"
            initialSubTab="secrets"
        />,
    );
    expect(screen.getByText("Secret controls")).toBeInTheDocument();
    rerender(
        <PersonalizationPortal open onClose={() => {}} initialTab="unknown" />,
    );
    expect(screen.getByText("Overview controls")).toBeInTheDocument();
});
