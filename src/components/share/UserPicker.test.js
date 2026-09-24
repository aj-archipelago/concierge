import React from "react";
import {
    act,
    fireEvent,
    render,
    screen,
    waitFor,
} from "@testing-library/react";
import "@testing-library/jest-dom";
import axios from "axios";

import UserPicker from "../../../@/components/share/UserPicker";

jest.mock("axios");
jest.mock("../UserAvatar", () => ({
    __esModule: true,
    default: () => <span data-testid="avatar" />,
}));
jest.mock("react-i18next", () => ({
    useTranslation: () => ({ t: (key) => key }),
}));

describe("UserPicker", () => {
    beforeEach(() => {
        jest.useFakeTimers();
        jest.clearAllMocks();
    });

    afterEach(() => {
        jest.runOnlyPendingTimers();
        jest.useRealTimers();
    });

    async function searchFor(query, results) {
        axios.get.mockResolvedValueOnce({ data: results });
        render(<UserPicker onSelect={jest.fn()} />);

        const input = screen.getByPlaceholderText(
            "shareDialog.searchPeoplePlaceholder",
        );
        fireEvent.focus(input);
        fireEvent.change(input, { target: { value: query } });

        await act(async () => {
            jest.advanceTimersByTime(250);
            await Promise.resolve();
        });
    }

    it("shows an Entra display name with the email underneath", async () => {
        await searchFor("babar", [
            {
                _id: "user-1",
                name: "Babar Mustafa",
                username: "Alex@example.com",
            },
        ]);

        expect(await screen.findByText("Babar Mustafa")).toBeInTheDocument();
        expect(screen.getByText("Alex@example.com")).toBeInTheDocument();
    });

    it("does not repeat an email-only identity on two lines", async () => {
        await searchFor("baba", [
            {
                _id: "user-1",
                name: "Alex@example.com",
                username: "alex@example.com",
            },
        ]);

        await waitFor(() =>
            expect(screen.getAllByText("Alex@example.com")).toHaveLength(1),
        );
    });
});
