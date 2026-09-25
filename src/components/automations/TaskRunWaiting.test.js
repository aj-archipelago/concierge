import React from "react";
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import TaskRunWaiting from "./TaskRunWaiting";
jest.mock("react-i18next", () => ({
    useTranslation: () => ({ t: (key) => key }),
}));
it("offers the inbox while waiting and disappears once work continues", () => {
    const { rerender } = render(<TaskRunWaiting run={{ status: "waiting" }} />);
    expect(screen.getByRole("status")).toHaveTextContent(
        "colleagues.waitingForReplies",
    );
    expect(screen.getByRole("link")).toHaveAttribute("href", "/notifications");
    rerender(<TaskRunWaiting run={{ status: "in_progress" }} />);
    expect(screen.queryByRole("status")).toBeNull();
});
