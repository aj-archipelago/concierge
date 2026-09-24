import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import AssistantMediaGallery from "../AssistantMediaGallery";
import { LanguageContext } from "../../../contexts/LanguageProvider";
import { useTask } from "../../../../app/queries/notifications";
import english from "../../../../config/default/locales/en.json";
import arabic from "../../../../config/default/locales/ar.json";

jest.mock("../../../../app/queries/notifications", () => ({
    useTask: jest.fn(),
}));
jest.mock("../../../contexts/LanguageProvider", () => ({
    LanguageContext: require("react").createContext({ direction: "ltr" }),
}));
jest.mock("react-i18next", () => ({
    useTranslation: () => ({
        t: (key) =>
            require("../../../../config/default/locales/en.json")[key] || key,
    }),
}));
jest.mock("../MediaCard", () => ({
    __esModule: true,
    default: ({ type, src, filename }) => (
        <div data-testid="media-output" data-type={type} data-src={src}>
            {filename}
        </div>
    ),
}));

const receipt = {
    taskId: "a".repeat(24),
    type: "image",
    model: "model",
    name: "Model A",
};

beforeEach(() => jest.clearAllMocks());

it("updates the same card from pending to multiple outputs, and renders saved completed jobs on reopen", () => {
    useTask.mockReturnValue({ data: { status: "pending" } });
    const { rerender, unmount } = render(
        <AssistantMediaGallery receipts={[receipt]} />,
    );
    expect(screen.getByText("Queued")).toBeInTheDocument();
    expect(
        screen.getByText("Your result will appear here automatically."),
    ).toBeInTheDocument();
    useTask.mockReturnValue({
        data: {
            status: "completed",
            data: {
                data: JSON.stringify({
                    outputFiles: [
                        { url: "https://example.com/a.png" },
                        { azureUrl: "https://example.com/b.png" },
                    ],
                }),
            },
        },
    });
    rerender(<AssistantMediaGallery receipts={[receipt]} />);
    expect(screen.getByText("Ready")).toBeInTheDocument();
    expect(screen.getAllByTestId("media-output")).toHaveLength(2);
    expect(screen.queryByText("Queued")).not.toBeInTheDocument();
    unmount();
    render(<AssistantMediaGallery receipts={[receipt]} />);
    expect(screen.getAllByTestId("media-output")).toHaveLength(2);
    expect(useTask).toHaveBeenLastCalledWith(receipt.taskId);
});

it.each(["failed", "abandoned", "cancelled"])(
    "shows a terminal %s state without a spinner or raw error",
    (status) => {
        useTask.mockReturnValue({
            data: { status, error: "private provider error" },
        });
        const { container } = render(
            <AssistantMediaGallery receipts={[receipt]} />,
        );
        expect(
            screen.getByText(
                "This generation stopped before a result was saved.",
            ),
        ).toBeInTheDocument();
        expect(container.innerHTML).not.toContain("animate-spin");
        expect(
            screen.queryByText("private provider error"),
        ).not.toBeInTheDocument();
    },
);

it("retries a failed status fetch without regenerating, and handles malformed completed output", () => {
    const refetch = jest.fn();
    useTask.mockReturnValue({ isError: true, refetch });
    const { rerender } = render(<AssistantMediaGallery receipts={[receipt]} />);
    fireEvent.click(screen.getByRole("button", { name: "Check again" }));
    expect(refetch).toHaveBeenCalledTimes(1);
    useTask.mockReturnValue({
        data: { status: "completed", data: "malformed" },
    });
    rerender(<AssistantMediaGallery receipts={[receipt]} />);
    expect(screen.getByText("Unavailable")).toBeInTheDocument();
    expect(screen.queryByTestId("media-output")).not.toBeInTheDocument();
});

it("plays audio, renders video, inherits RTL, and has matching locale keys", () => {
    useTask.mockReturnValue({
        data: {
            status: "completed",
            data: { url: "https://example.com/output" },
        },
    });
    const receipts = [
        { ...receipt, type: "audio" },
        { ...receipt, taskId: "b".repeat(24), type: "video" },
    ];
    render(
        <LanguageContext.Provider value={{ direction: "rtl" }}>
            <AssistantMediaGallery receipts={receipts} />
        </LanguageContext.Provider>,
    );
    expect(screen.getByLabelText("Generated media")).toHaveAttribute(
        "dir",
        "rtl",
    );
    expect(screen.getByLabelText("Model A")).toHaveAttribute(
        "src",
        "https://example.com/output",
    );
    expect(screen.getByTestId("media-output")).toHaveAttribute(
        "data-type",
        "video",
    );
    for (const key of Object.keys(english).filter((key) =>
        key.startsWith("chat.media."),
    ))
        expect(arabic[key]).toBeTruthy();
});
