import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import WeeklyBudgetControl from "./WeeklyBudgetControl";
jest.mock("react-i18next", () => ({
    useTranslation: () => ({ t: (key) => key }),
}));
const props = {
    apiKeyId: "000000000001",
    defaultWeeklyUsd: 500,
    ready: true,
    onSaved: jest.fn(),
};
beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn().mockResolvedValue({ ok: true });
});
it("edits the $500 default and saves explicit unlimited", async () => {
    render(<WeeklyBudgetControl {...props} />);
    fireEvent.click(screen.getByText("usageDashboard.editCap"));
    expect(screen.getByRole("spinbutton").value).toBe("500");
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByText("usageDashboard.save"));
    await waitFor(() => expect(props.onSaved).toHaveBeenCalled());
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
        apiKeyId: props.apiKeyId,
        weeklyUsd: null,
    });
});
it("retains the edit and displays server errors", async () => {
    fetch.mockResolvedValue({ ok: false });
    render(<WeeklyBudgetControl {...props} />);
    fireEvent.click(screen.getByText("usageDashboard.editCap"));
    fireEvent.change(screen.getByRole("spinbutton"), {
        target: { value: "750" },
    });
    fireEvent.click(screen.getByText("usageDashboard.save"));
    await screen.findByRole("alert");
    expect(screen.getByRole("spinbutton").value).toBe("750");
    expect(props.onSaved).not.toHaveBeenCalled();
});
it("does not allow edits before current limits load", () => {
    render(<WeeklyBudgetControl {...props} ready={false} />);
    expect(screen.getByRole("button").disabled).toBe(true);
});
it("saves a zero cap without turning it into the default", async () => {
    render(<WeeklyBudgetControl {...props} />);
    fireEvent.click(screen.getByText("usageDashboard.editCap"));
    fireEvent.change(screen.getByRole("spinbutton"), {
        target: { value: "0" },
    });
    fireEvent.click(screen.getByText("usageDashboard.save"));
    await waitFor(() =>
        expect(props.onSaved).toHaveBeenCalledWith(props.apiKeyId, 0),
    );
    expect(JSON.parse(fetch.mock.calls[0][1].body).weeklyUsd).toBe(0);
});
it("preserves an unsaved edit when refreshed policy data arrives", () => {
    const { rerender } = render(
        <WeeklyBudgetControl {...props} budget={{ weeklyUsd: 500 }} />,
    );
    fireEvent.click(screen.getByText("usageDashboard.editCap"));
    fireEvent.change(screen.getByRole("spinbutton"), {
        target: { value: "750" },
    });
    rerender(<WeeklyBudgetControl {...props} budget={{ weeklyUsd: 600 }} />);
    expect(screen.getByRole("spinbutton").value).toBe("750");
    fireEvent.click(screen.getByText("usageDashboard.cancel"));
    fireEvent.click(screen.getByText("usageDashboard.editCap"));
    expect(screen.getByRole("spinbutton").value).toBe("600");
});
