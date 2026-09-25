import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import TeamJobControls from "./TeamJobControls";
import { useCancelTask } from "../../../app/queries/notifications";
jest.mock("../../../app/queries/notifications", () => ({
    useCancelTask: jest.fn(),
}));
jest.mock("@tanstack/react-query", () => ({
    useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));
jest.mock("react-i18next", () => ({
    useTranslation: () => ({ t: (key) => key }),
}));
it("requires confirmation before stopping a job and leaves finished jobs alone", () => {
    const mutate = jest.fn();
    useCancelTask.mockReturnValue({ mutate });
    const { rerender } = render(
        <TeamJobControls team={{ teamId: "job", taskStatus: "waiting" }} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "teams.stopJob" }));
    expect(mutate).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "teams.keepWorking" }));
    expect(mutate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "teams.stopJob" }));
    fireEvent.click(screen.getByRole("button", { name: "teams.stopJob" }));
    expect(mutate).toHaveBeenCalledWith(
        "job",
        expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
    rerender(
        <TeamJobControls team={{ teamId: "job", taskStatus: "completed" }} />,
    );
    expect(
        screen.queryByRole("button", { name: "teams.stopJob" }),
    ).not.toBeInTheDocument();
});
