import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";

import { Modal } from "@/components/ui/modal";

describe("Modal", () => {
    it("opens without React element.ref warnings", () => {
        const originalConsoleError = console.error;
        const consoleError = jest
            .spyOn(console, "error")
            .mockImplementation((...args) => {
                if (String(args[0]).includes("element.ref")) return;
                originalConsoleError(...args);
            });

        try {
            render(
                <Modal show={true} onHide={jest.fn()} title="Test modal">
                    <button type="button">Inside modal</button>
                </Modal>,
            );

            expect(screen.getByRole("dialog")).toBeInTheDocument();
            expect(screen.getByText("Inside modal")).toBeInTheDocument();
            expect(
                consoleError.mock.calls.some((args) =>
                    args.some((arg) => String(arg).includes("element.ref")),
                ),
            ).toBe(false);
        } finally {
            consoleError.mockRestore();
        }
    });
});
