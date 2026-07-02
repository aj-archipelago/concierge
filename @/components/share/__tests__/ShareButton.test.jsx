import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import ShareButton from "../ShareButton";

jest.mock("react-i18next", () => ({
    __esModule: true,
    useTranslation: () => ({
        t: (key) => key,
    }),
}));

jest.mock("../ShareDialog", () => ({
    __esModule: true,
    default: () => null,
}));

jest.mock("../useShareSettings", () => ({
    useShareSettings: jest.fn(),
}));

const { useShareSettings } = require("../useShareSettings");

function renderWithClient(ui) {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    });
    return render(
        <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
    );
}

describe("ShareButton", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("shows Share when nothing is shared", () => {
        useShareSettings.mockReturnValue({ isShared: false });

        renderWithClient(
            <ShareButton entityType="chat" entityId="chat-1" label="Share" />,
        );

        expect(screen.getByRole("button", { name: "Share" })).toHaveTextContent(
            "Share",
        );
    });

    it("shows Shared styling when sharing is active", () => {
        useShareSettings.mockReturnValue({ isShared: true });

        renderWithClient(
            <ShareButton entityType="chat" entityId="chat-1" label="Share" />,
        );

        const button = screen.getByRole("button", { name: "Shared" });
        expect(button).toHaveTextContent("Shared");
        expect(button.className).toMatch(/sky/);
    });
});
