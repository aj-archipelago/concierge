import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";

import GenerateImageDialog from "../GenerateImageDialog";

const mockMutateAsync = jest.fn(async () => ({ taskId: "task-1" }));

jest.mock("../../../../app/queries/notifications", () => ({
    useRunTask: () => ({
        isPending: false,
        mutateAsync: mockMutateAsync,
    }),
    useTask: () => ({ data: null }),
}));

jest.mock("react-i18next", () => ({
    useTranslation: () => ({ t: (key) => key }),
}));

jest.mock("@/components/ui/dialog", () => ({
    Dialog: ({ open, children }) => (open ? <div>{children}</div> : null),
    DialogContent: ({ children }) => <div>{children}</div>,
    DialogHeader: ({ children }) => <div>{children}</div>,
    DialogTitle: ({ children }) => <h2>{children}</h2>,
}));

describe("GenerateImageDialog", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test("submits the current Gemini 3.1 Flash Image model ID", async () => {
        render(
            <GenerateImageDialog
                show
                onHide={jest.fn()}
                onImageGenerated={jest.fn()}
                contextId="context-1"
            />,
        );

        fireEvent.change(
            screen.getByPlaceholderText(
                "e.g., A beautiful landscape with mountains and a lake at sunset",
            ),
            { target: { value: "A teal origami fox" } },
        );
        fireEvent.click(screen.getByRole("button", { name: "Generate" }));

        await waitFor(() =>
            expect(mockMutateAsync).toHaveBeenCalledWith(
                expect.objectContaining({
                    model: "gemini-flash-31-image",
                    outputType: "image",
                    prompt: "A teal origami fox",
                }),
            ),
        );
    });
});
