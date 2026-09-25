import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { ModelThinkingPanel, ThinkingSlider } from "./ModelThinkingControl";

jest.mock("../contexts/LanguageProvider", () => ({
    LanguageContext: require("react").createContext({ direction: "rtl" }),
}));
jest.mock("react-i18next", () => ({
    useTranslation: () => ({ t: (key) => key }),
}));

it("previews a drag and saves only the released level, without another write on blur", () => {
    const save = jest.fn();
    render(<ThinkingSlider value="low" onChange={save} />);
    const slider = screen.getByRole("slider");
    fireEvent.change(slider, { target: { value: "2" } });
    fireEvent.change(slider, { target: { value: "3" } });
    expect(save).not.toHaveBeenCalled();
    expect(slider).toHaveAttribute(
        "aria-valuetext",
        "reasoning_effort_level_high",
    );
    fireEvent.pointerUp(slider);
    fireEvent.blur(slider);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith("high");
});

it("commits keyboard changes and direct level selection", () => {
    const save = jest.fn();
    render(<ThinkingSlider value="low" onChange={save} />);
    const slider = screen.getByRole("slider");
    fireEvent.change(slider, { target: { value: "2" } });
    fireEvent.keyUp(slider, { key: "ArrowRight" });
    expect(save).toHaveBeenLastCalledWith("medium");
    fireEvent.click(
        screen.getByRole("button", { name: "reasoning_effort_level_none" }),
    );
    expect(save).toHaveBeenLastCalledWith("none");
});

it("restores the saved level after a rejected save and lets it be retried", async () => {
    const save = jest.fn().mockResolvedValue(false);
    render(<ThinkingSlider value="low" onChange={save} />);
    const high = screen.getByRole("button", {
        name: "reasoning_effort_level_high",
    });
    fireEvent.click(high);
    await waitFor(() =>
        expect(screen.getByRole("slider")).toHaveAttribute(
            "aria-valuetext",
            "reasoning_effort_level_low",
        ),
    );
    fireEvent.click(high);
    expect(save).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(screen.getByRole("slider")).toHaveValue("1"));
});

it("normalizes model changes, offers only supported stops, and respects RTL", () => {
    const save = jest.fn();
    const models = [
        { modelId: "a", displayName: "A" },
        {
            modelId: "b",
            displayName: "B",
            supportedReasoningEfforts: ["medium", "low"],
        },
    ];
    const { rerender } = render(
        <ModelThinkingPanel
            models={models}
            modelId="a"
            reasoningEffort="high"
            onChange={save}
        />,
    );
    expect(
        screen.getByRole("group", { name: "thinkingControl.settings" }),
    ).toHaveAttribute("dir", "rtl");
    fireEvent.change(screen.getByLabelText("Model"), {
        target: { value: "b" },
    });
    expect(save).toHaveBeenCalledWith({ model: "b", reasoningEffort: "low" });
    rerender(
        <ModelThinkingPanel
            models={models}
            modelId="b"
            reasoningEffort="low"
            onChange={save}
        />,
    );
    expect(screen.getByRole("slider")).toHaveAttribute("max", "1");
    expect(
        screen.queryByRole("button", { name: "reasoning_effort_level_high" }),
    ).not.toBeInTheDocument();
    fireEvent.click(
        screen.getByRole("button", { name: "reasoning_effort_level_medium" }),
    );
    expect(save).toHaveBeenLastCalledWith({ reasoningEffort: "medium" });
});

it("disables a fixed level and all controls while saving", () => {
    const save = jest.fn();
    const { rerender } = render(
        <ThinkingSlider
            model={{ supportedReasoningEfforts: ["medium"] }}
            value="high"
            onChange={save}
        />,
    );
    expect(screen.getByRole("slider")).toBeDisabled();
    expect(screen.getByRole("slider")).toHaveAttribute(
        "aria-valuetext",
        "reasoning_effort_level_medium",
    );
    rerender(
        <ModelThinkingPanel
            models={[{ modelId: "a" }]}
            modelId="a"
            reasoningEffort="low"
            onChange={save}
            disabled
        />,
    );
    expect(screen.getByLabelText("Model")).toBeDisabled();
    expect(screen.getByRole("slider")).toBeDisabled();
    fireEvent.click(
        screen.getByRole("button", { name: "reasoning_effort_level_high" }),
    );
    expect(save).not.toHaveBeenCalled();
});
