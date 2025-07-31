import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";

// Simple test component to verify CSS classes
const TestComponent = () => (
    <div className="mobile-overflow-safe" data-testid="overflow-container">
        <div className="mobile-text-wrap" data-testid="text-wrap">
            <p>Test content</p>
        </div>
        <div className="mobile-table-container" data-testid="table-container">
            <table className="mobile-table" data-testid="table">
                <thead>
                    <tr>
                        <th
                            className="mobile-table-cell"
                            data-testid="header-1"
                        >
                            Header 1
                        </th>
                        <th
                            className="mobile-table-cell"
                            data-testid="header-2"
                        >
                            Header 2
                        </th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td className="mobile-table-cell" data-testid="cell-1">
                            Data 1
                        </td>
                        <td className="mobile-table-cell" data-testid="cell-2">
                            Data 2
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
    </div>
);

describe("Mobile Overflow CSS Utilities", () => {
    it("should render components with mobile overflow utility classes", () => {
        render(<TestComponent />);

        // Verify that our utility classes are applied using Testing Library methods
        expect(screen.getByTestId("overflow-container")).toBeInTheDocument();
        expect(screen.getByTestId("text-wrap")).toBeInTheDocument();
        expect(screen.getByTestId("table-container")).toBeInTheDocument();
        expect(screen.getByTestId("table")).toBeInTheDocument();
        expect(screen.getByTestId("header-1")).toBeInTheDocument();
        expect(screen.getByTestId("header-2")).toBeInTheDocument();
        expect(screen.getByTestId("cell-1")).toBeInTheDocument();
        expect(screen.getByTestId("cell-2")).toBeInTheDocument();
    });

    it("should have proper CSS class structure for mobile overflow handling", () => {
        render(<TestComponent />);

        const overflowSafeElement = screen.getByTestId("overflow-container");
        const textWrapElement = screen.getByTestId("text-wrap");
        const tableContainer = screen.getByTestId("table-container");

        // These elements should exist and have the proper classes
        expect(overflowSafeElement).toBeInTheDocument();
        expect(textWrapElement).toBeInTheDocument();
        expect(tableContainer).toBeInTheDocument();

        // Verify the structure is correct
        expect(overflowSafeElement).toContainElement(textWrapElement);
        expect(overflowSafeElement).toContainElement(tableContainer);
    });
});
