import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import EntityOptions from "./EntityOptions";
jest.mock("../../contexts/LanguageProvider", () => ({
    LanguageContext: require("react").createContext({ direction: "ltr" }),
}));
jest.mock("react-i18next", () => ({
    useTranslation: () => ({ t: (key) => key }),
}));
const mockSave = jest.fn();
jest.mock("../../hooks/useColleagues", () => ({
    useSaveColleague: () => ({ mutateAsync: mockSave }),
}));
jest.mock("../../../app/queries/modelMetadata", () => ({
    useAgentModels: () => ({
        data: [
            { modelId: "a", displayName: "A" },
            {
                modelId: "b",
                displayName: "B",
                supportedReasoningEfforts: ["none", "low"],
            },
        ],
        redirects: {},
    }),
    resolveAgentModelForSend: (id) => id,
}));
it("saves model and memory settings to the selected entity and normalizes unsupported reasoning", async () => {
    render(
        <EntityOptions
            entity={{
                id: "colleague",
                model: "a",
                reasoningEffort: "high",
                memoryLearning: true,
            }}
        />,
    );
    fireEvent.change(screen.getByLabelText("Model"), {
        target: { value: "b" },
    });
    await waitFor(() =>
        expect(mockSave).toHaveBeenCalledWith({
            id: "colleague",
            model: "b",
            reasoningEffort: "none",
        }),
    );
    fireEvent.click(screen.getByRole("switch"));
    await waitFor(() =>
        expect(mockSave).toHaveBeenCalledWith({
            id: "colleague",
            memoryLearning: false,
        }),
    );
});
