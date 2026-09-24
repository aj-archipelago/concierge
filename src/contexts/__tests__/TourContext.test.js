import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { TourProvider, useTour } from "../TourContext";

const STEPS = [
    { id: "welcome", target: null, title: "Welcome" },
    { id: "menu", target: "home-menu", title: "Menu" },
    { id: "finish", target: null, title: "Finish" },
];

function Harness() {
    const {
        isActive,
        index,
        steps,
        currentStep,
        startTour,
        next,
        back,
        endTour,
        isTourCompleted,
    } = useTour();
    return (
        <div>
            <div data-testid="active">{String(isActive)}</div>
            <div data-testid="index">{index}</div>
            <div data-testid="total">{steps.length}</div>
            <div data-testid="step">{currentStep?.id || "none"}</div>
            <div data-testid="completed">{String(isTourCompleted("home"))}</div>
            <button onClick={() => startTour({ id: "home", steps: STEPS })}>
                start
            </button>
            <button onClick={next}>next</button>
            <button onClick={back}>back</button>
            <button onClick={() => endTour({ completed: false })}>skip</button>
        </div>
    );
}

function renderWithProvider(props = {}) {
    return render(
        <TourProvider {...props}>
            <Harness />
        </TourProvider>,
    );
}

beforeEach(() => {
    try {
        window.localStorage.clear();
    } catch {
        // ignore
    }
});

describe("TourContext", () => {
    test("starts a tour on the first step", () => {
        renderWithProvider();
        fireEvent.click(screen.getByText("start"));
        expect(screen.getByTestId("active")).toHaveTextContent("true");
        expect(screen.getByTestId("index")).toHaveTextContent("0");
        expect(screen.getByTestId("step")).toHaveTextContent("welcome");
    });

    test("next advances exactly one step (no double advance)", () => {
        renderWithProvider();
        fireEvent.click(screen.getByText("start"));
        fireEvent.click(screen.getByText("next"));
        expect(screen.getByTestId("index")).toHaveTextContent("1");
        expect(screen.getByTestId("step")).toHaveTextContent("menu");
    });

    test("back returns to the previous step", () => {
        renderWithProvider();
        fireEvent.click(screen.getByText("start"));
        fireEvent.click(screen.getByText("next"));
        fireEvent.click(screen.getByText("back"));
        expect(screen.getByTestId("index")).toHaveTextContent("0");
    });

    test("completing on the last step ends the tour and persists completion", () => {
        const onCompleteTour = jest.fn();
        renderWithProvider({ onCompleteTour });
        fireEvent.click(screen.getByText("start"));
        fireEvent.click(screen.getByText("next")); // -> menu
        fireEvent.click(screen.getByText("next")); // -> finish
        fireEvent.click(screen.getByText("next")); // completes
        expect(screen.getByTestId("active")).toHaveTextContent("false");
        expect(onCompleteTour).toHaveBeenCalledWith("home");
        expect(screen.getByTestId("completed")).toHaveTextContent("true");
    });

    test("skip ends the tour without marking it completed", () => {
        const onCompleteTour = jest.fn();
        renderWithProvider({ onCompleteTour });
        fireEvent.click(screen.getByText("start"));
        fireEvent.click(screen.getByText("skip"));
        expect(screen.getByTestId("active")).toHaveTextContent("false");
        expect(onCompleteTour).not.toHaveBeenCalled();
        expect(screen.getByTestId("completed")).toHaveTextContent("false");
    });

    test("isTourCompleted reflects the completed prop", () => {
        renderWithProvider({ completed: { home: true } });
        expect(screen.getByTestId("completed")).toHaveTextContent("true");
    });

    test("startTour ignores empty step lists", () => {
        function EmptyStart() {
            const { startTour, isActive } = useTour();
            return (
                <div>
                    <div data-testid="active">{String(isActive)}</div>
                    <button
                        onClick={() => startTour({ id: "home", steps: [] })}
                    >
                        start
                    </button>
                </div>
            );
        }
        render(
            <TourProvider>
                <EmptyStart />
            </TourProvider>,
        );
        fireEvent.click(screen.getByText("start"));
        expect(screen.getByTestId("active")).toHaveTextContent("false");
    });
});
