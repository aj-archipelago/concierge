import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import Footer from "../Footer";
import { PortalContext } from "../../contexts/PortalContext";
import {
    CurrentEntityProvider,
    useCurrentEntityTarget,
} from "../../contexts/CurrentEntityContext";
import { useColleagues, useSaveColleague } from "../../hooks/useColleagues";

jest.mock("../../App", () => ({
    AuthContext: require("react").createContext({
        user: {
            contextId: "user",
            personalEntityId: "personal",
            agentModel: "model-a",
        },
    }),
}));
jest.mock("../../contexts/LanguageProvider", () => ({
    LanguageContext: require("react").createContext({
        language: "en",
        changeLanguage: jest.fn(),
    }),
}));
jest.mock("react-i18next", () => ({
    useTranslation: () => ({
        t: (key, values) => (values?.name ? `${key} ${values.name}` : key),
    }),
}));
jest.mock("../../hooks/useColleagues", () => ({
    useColleagues: jest.fn(),
    useSaveColleague: jest.fn(),
}));
jest.mock("../../../app/queries/modelMetadata", () => ({
    useAgentModels: () => ({
        data: [
            { modelId: "model-a", displayName: "Model A" },
            { modelId: "model-b", displayName: "Model B" },
        ],
    }),
    getProviderFromModelId: () => "openai",
}));
const save = jest.fn();
const entities = [
    { id: "personal", name: "Personal", model: "model-a" },
    { id: "rowan", name: "Rowan", model: "model-b", reasoningEffort: "high" },
];
function Surface({ id }) {
    useCurrentEntityTarget(id);
    return null;
}
beforeEach(() => {
    jest.clearAllMocks();
    save.mockReset();
    useColleagues.mockReturnValue({ data: entities });
    useSaveColleague.mockReturnValue({ mutateAsync: save });
});

it("saves thinking to the active assistant and restores the slider if saving fails", async () => {
    save.mockRejectedValueOnce(new Error("Unavailable"));
    render(
        <CurrentEntityProvider>
            <Surface id="rowan" />
            <Footer />
        </CurrentEntityProvider>,
    );
    fireEvent.click(
        screen.getByRole("button", { name: "thinkingControl.choose Rowan" }),
    );
    fireEvent.click(
        screen.getByRole("button", { name: "reasoning_effort_level_low" }),
    );
    await waitFor(() =>
        expect(save).toHaveBeenCalledWith({
            id: "rowan",
            reasoningEffort: "low",
        }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
        "colleagues.error",
    );
    await waitFor(() =>
        expect(screen.getByRole("slider")).toHaveAttribute(
            "aria-valuetext",
            "reasoning_effort_level_high",
        ),
    );
});
it("changes the current colleague, then returns to the personal entity when its surface closes", async () => {
    const { rerender } = render(
        <CurrentEntityProvider>
            <Surface id="rowan" />
            <Footer />
        </CurrentEntityProvider>,
    );
    expect(
        screen.getByRole("button", { name: "thinkingControl.choose Rowan" }),
    ).toBeEnabled();
    fireEvent.click(
        screen.getByRole("button", { name: "thinkingControl.choose Rowan" }),
    );
    fireEvent.change(screen.getByLabelText("Model"), {
        target: { value: "model-a" },
    });
    await waitFor(() =>
        expect(save).toHaveBeenCalledWith({
            id: "rowan",
            model: "model-a",
            reasoningEffort: "high",
        }),
    );
    rerender(
        <CurrentEntityProvider>
            <Footer />
        </CurrentEntityProvider>,
    );
    expect(
        screen.getByRole("button", { name: "thinkingControl.choose Personal" }),
    ).toBeEnabled();
});

it("opens profile Settings from the footer gear", () => {
    const openPortal = jest.fn();
    render(
        <PortalContext.Provider value={{ openPortal }}>
            <CurrentEntityProvider>
                <Footer />
            </CurrentEntityProvider>
        </PortalContext.Provider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(openPortal).toHaveBeenCalledWith("profile");
});
