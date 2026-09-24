import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import HomeAddDialog from "./HomeAddDialog";

jest.mock("@/src/hooks/useAutomations", () => ({
    useAutomations: () => ({
        data: [{ _id: "auto-1", name: "Daily brief" }],
        isLoading: false,
    }),
}));

jest.mock("@/components/ui/autosize-textarea", () => ({
    AutosizeTextarea: ({ value, onChange, placeholder, ...props }) => (
        <textarea
            data-testid="home-add-prompt"
            value={value}
            onChange={onChange}
            placeholder={placeholder}
            {...props}
        />
    ),
}));

describe("HomeAddDialog", () => {
    const t = (key) => key;

    beforeEach(() => {
        global.fetch = jest.fn((url) => {
            if (String(url).includes("/api/canvas-applets")) {
                return Promise.resolve({
                    ok: true,
                    json: async () => ({
                        applets: [
                            {
                                _id: "applet-1",
                                name: "Translator",
                                version: 2,
                            },
                            {
                                _id: "applet-calc",
                                name: "ThemeSmart Calculator",
                                version: 2,
                            },
                        ],
                    }),
                });
            }
            if (String(url).includes("/api/apps")) {
                return Promise.resolve({
                    ok: true,
                    json: async () => [],
                });
            }
            if (String(url).includes("/api/home/classify-add")) {
                return Promise.resolve({
                    ok: true,
                    json: async () => ({
                        classification: {
                            kind: "automation",
                            reason: "Scheduled",
                        },
                    }),
                });
            }
            return Promise.resolve({ ok: true, json: async () => ({}) });
        });
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it("shows prompt box and existing applets/automations columns", async () => {
        render(
            <HomeAddDialog
                onClose={jest.fn()}
                onPickApplet={jest.fn()}
                onPickAutomation={jest.fn()}
                onCreateApplet={jest.fn()}
                onCreateAutomation={jest.fn()}
                t={t}
            />,
        );

        expect(screen.getByText("Add to Home")).toBeInTheDocument();
        expect(
            screen.getByText("Describe what you'd like"),
        ).toBeInTheDocument();
        expect(screen.getByText("Existing")).toBeInTheDocument();
        expect(screen.getByText("Apps")).toBeInTheDocument();
        expect(screen.getByText("Tasks")).toBeInTheDocument();
        expect(await screen.findByText("Translator")).toBeInTheDocument();
        expect(screen.getByText("Daily brief")).toBeInTheDocument();
    });

    it("classifies a prompt and routes to automation create", async () => {
        const onCreateAutomation = jest.fn();
        const onClose = jest.fn();

        render(
            <HomeAddDialog
                onClose={onClose}
                onPickApplet={jest.fn()}
                onPickAutomation={jest.fn()}
                onCreateApplet={jest.fn()}
                onCreateAutomation={onCreateAutomation}
                t={t}
            />,
        );

        fireEvent.change(screen.getByTestId("home-add-prompt"), {
            target: { value: "daily news brief every morning" },
        });
        fireEvent.click(screen.getByTestId("home-add-create-from-prompt"));

        await waitFor(() => {
            expect(onCreateAutomation).toHaveBeenCalledWith(
                "daily news brief every morning",
            );
        });
        expect(onClose).not.toHaveBeenCalled();
    });

    it("adds an existing automation from the list", async () => {
        const onPickAutomation = jest.fn();

        render(
            <HomeAddDialog
                onClose={jest.fn()}
                onPickApplet={jest.fn()}
                onPickAutomation={onPickAutomation}
                onCreateApplet={jest.fn()}
                onCreateAutomation={jest.fn()}
                t={t}
            />,
        );

        fireEvent.click(
            await screen.findByTestId("home-add-existing-automation-auto-1"),
        );
        expect(onPickAutomation).toHaveBeenCalledWith(
            expect.objectContaining({ _id: "auto-1" }),
        );
    });

    it("suggests an existing applet that matches the typed prompt", async () => {
        const onPickApplet = jest.fn();
        const onCreateApplet = jest.fn();

        render(
            <HomeAddDialog
                onClose={jest.fn()}
                onPickApplet={onPickApplet}
                onPickAutomation={jest.fn()}
                onCreateApplet={onCreateApplet}
                onCreateAutomation={jest.fn()}
                t={t}
            />,
        );

        expect(
            await screen.findByText("ThemeSmart Calculator"),
        ).toBeInTheDocument();
        fireEvent.change(screen.getByTestId("home-add-prompt"), {
            target: { value: "calculator" },
        });

        expect(
            screen.getByTestId("home-add-existing-suggestion"),
        ).toBeInTheDocument();
        expect(
            screen.getByText("You already have something like this"),
        ).toBeInTheDocument();
        expect(screen.getByText("Create new")).toBeInTheDocument();

        fireEvent.click(
            screen.getByTestId("home-add-use-existing-applet-applet-calc"),
        );
        expect(onPickApplet).not.toHaveBeenCalled();
        expect(screen.getByTestId("home-add-placement")).toBeInTheDocument();
        fireEvent.click(screen.getByTestId("home-add-as-launch"));
        expect(onPickApplet).toHaveBeenCalledWith(
            expect.objectContaining({
                appletId: "applet-calc",
                name: "ThemeSmart Calculator",
            }),
            { size: "mini" },
        );
        expect(onCreateApplet).not.toHaveBeenCalled();
    });

    it("creates a new applet when the user declines the existing match", async () => {
        const onCreateApplet = jest.fn();
        const onClose = jest.fn();
        global.fetch = jest.fn((url) => {
            if (String(url).includes("/api/canvas-applets")) {
                return Promise.resolve({
                    ok: true,
                    json: async () => ({
                        applets: [
                            {
                                _id: "applet-calc",
                                name: "ThemeSmart Calculator",
                                version: 2,
                            },
                        ],
                    }),
                });
            }
            if (String(url).includes("/api/apps")) {
                return Promise.resolve({
                    ok: true,
                    json: async () => [],
                });
            }
            if (String(url).includes("/api/home/classify-add")) {
                return Promise.resolve({
                    ok: true,
                    json: async () => ({
                        classification: {
                            kind: "applet",
                            reason: "Interactive tool",
                        },
                    }),
                });
            }
            return Promise.resolve({ ok: true, json: async () => ({}) });
        });

        render(
            <HomeAddDialog
                onClose={onClose}
                onPickApplet={jest.fn()}
                onPickAutomation={jest.fn()}
                onCreateApplet={onCreateApplet}
                onCreateAutomation={jest.fn()}
                t={t}
            />,
        );

        expect(
            await screen.findByText("ThemeSmart Calculator"),
        ).toBeInTheDocument();
        fireEvent.change(screen.getByTestId("home-add-prompt"), {
            target: { value: "calculator" },
        });
        fireEvent.click(screen.getByTestId("home-add-create-from-prompt"));

        expect(
            await screen.findByTestId("home-add-placement"),
        ).toBeInTheDocument();
        fireEvent.click(screen.getByTestId("home-add-as-interactive"));

        await waitFor(() => {
            expect(onCreateApplet).toHaveBeenCalledWith("calculator", {
                size: "large",
            });
        });
        expect(onClose).toHaveBeenCalled();
    });

    it("notes when the matching applet is already on Home", async () => {
        render(
            <HomeAddDialog
                excludedAppletIds={["applet-calc"]}
                onClose={jest.fn()}
                onPickApplet={jest.fn()}
                onPickAutomation={jest.fn()}
                onCreateApplet={jest.fn()}
                onCreateAutomation={jest.fn()}
                t={t}
            />,
        );

        expect(await screen.findByText("Translator")).toBeInTheDocument();
        fireEvent.change(screen.getByTestId("home-add-prompt"), {
            target: { value: "calculator" },
        });

        expect(
            screen.getByTestId("home-add-existing-suggestion"),
        ).toBeInTheDocument();
        expect(
            screen.getByText("Already on your home page"),
        ).toBeInTheDocument();
        expect(
            screen.queryByTestId("home-add-use-existing-applet-applet-calc"),
        ).not.toBeInTheDocument();
    });

    it("lets the user add an existing applet as a launch icon or live widget", async () => {
        const onPickApplet = jest.fn();

        render(
            <HomeAddDialog
                onClose={jest.fn()}
                onPickApplet={onPickApplet}
                onPickAutomation={jest.fn()}
                onCreateApplet={jest.fn()}
                onCreateAutomation={jest.fn()}
                t={t}
            />,
        );

        fireEvent.click(
            await screen.findByTestId("home-add-existing-applet-applet-1"),
        );
        expect(onPickApplet).not.toHaveBeenCalled();
        expect(
            screen.getByText("How should this appear on Home?"),
        ).toBeInTheDocument();
        expect(screen.getByText("Translator")).toBeInTheDocument();

        fireEvent.click(screen.getByTestId("home-add-placement-back"));
        expect(
            screen.queryByTestId("home-add-placement"),
        ).not.toBeInTheDocument();

        fireEvent.click(
            screen.getByTestId("home-add-existing-applet-applet-1"),
        );
        fireEvent.click(screen.getByTestId("home-add-as-interactive"));
        expect(onPickApplet).toHaveBeenCalledWith(
            expect.objectContaining({ appletId: "applet-1" }),
            { size: "large" },
        );
    });
});
