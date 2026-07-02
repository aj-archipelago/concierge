import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import AppletPlacementBadges from "../AppletPlacementBadges";

jest.mock("react-i18next", () => ({
    useTranslation: () => ({
        t: (key) => key,
    }),
}));

describe("AppletPlacementBadges", () => {
    test("renders placement badges for sidebar, home directory, and home applet", () => {
        render(
            <AppletPlacementBadges
                applet={{
                    type: "canvas",
                    isInstalled: true,
                    isHomeDirectory: true,
                    isHome: true,
                }}
            />,
        );

        expect(screen.getByText("In sidebar")).toBeInTheDocument();
        expect(screen.getByText("On Home")).toBeInTheDocument();
        expect(screen.getByText("Home applet")).toBeInTheDocument();
    });

    test("renders nothing when no placement flags are set", () => {
        const { container } = render(
            <AppletPlacementBadges applet={{ type: "canvas" }} />,
        );

        expect(container).toBeEmptyDOMElement();
    });
});
